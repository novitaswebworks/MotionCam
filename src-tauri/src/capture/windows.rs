use crate::capture::audio_windows::AudioRequest;
use crate::capture::cursor::DisplayBounds;
use crate::capture::wgc::CaptureSession;
use crate::capture::{CaptureStreamSettings, DisplayInfo};
use std::mem::size_of;
use std::path::Path;
use std::time::Instant;
use thiserror::Error;
use windows::core::{BOOL, PCWSTR};
use windows::Win32::Foundation::{LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, EnumDisplaySettingsW, GetMonitorInfoW, DEVMODEW, ENUM_CURRENT_SETTINGS,
    HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

#[derive(Error, Debug)]
pub enum WindowsCaptureError {
    #[error("Windows Graphics Capture error: {0}")]
    WgcError(String),
}

/// `MONITORINFOF_PRIMARY` from winuser.h.
const MONITORINFO_PRIMARY_FLAG: u32 = 1;
/// Windows reports 96 DPI at 100% scaling.
const BASE_DPI: f64 = 96.0;

/// Records one display with Windows Graphics Capture into an H.264 MP4.
pub struct WindowsScreenRecorder {
    session: CaptureSession,
}

impl WindowsScreenRecorder {
    /// Lists attached monitors with their true pixel size and DPI scale.
    pub fn list_displays() -> Result<Vec<DisplayInfo>, WindowsCaptureError> {
        Ok(enumerate_monitors()?.into_iter().map(|m| m.info).collect())
    }

    pub fn start<P: AsRef<Path>>(
        output_file: P,
        target_display_id: u32,
        settings: CaptureStreamSettings,
        audio: AudioRequest,
    ) -> Result<Self, WindowsCaptureError> {
        let handle = display_handle(target_display_id).ok_or_else(|| {
            WindowsCaptureError::WgcError("Selected display is unavailable".into())
        })?;
        let session =
            CaptureSession::start(output_file.as_ref().to_path_buf(), handle, settings, audio)
                .map_err(WindowsCaptureError::WgcError)?;
        Ok(Self { session })
    }

    pub fn capture_started_at(&self) -> Instant {
        self.session.capture_started_at()
    }

    pub fn stop(&mut self) -> Result<u64, WindowsCaptureError> {
        self.session.stop().map_err(WindowsCaptureError::WgcError)
    }

    pub fn frame_count(&self) -> u64 {
        self.session.frame_count()
    }
}

struct MonitorEntry {
    info: DisplayInfo,
    /// Monitor rectangle in the same coordinate space the input hooks report.
    bounds: DisplayBounds,
    /// Raw HMONITOR, valid while the monitor stays attached.
    handle: isize,
}

fn enumerate_monitors() -> Result<Vec<MonitorEntry>, WindowsCaptureError> {
    let mut monitors: Vec<MonitorEntry> = Vec::new();

    // SAFETY: the callback only runs during this call and `monitors`
    // outlives it, so the pointer smuggled through LPARAM stays valid.
    let ok = unsafe {
        EnumDisplayMonitors(
            None,
            None,
            Some(collect_monitor),
            LPARAM(&mut monitors as *mut Vec<MonitorEntry> as isize),
        )
    };
    if !ok.as_bool() {
        return Err(WindowsCaptureError::WgcError(
            "Could not enumerate displays".into(),
        ));
    }
    if monitors.is_empty() {
        return Err(WindowsCaptureError::WgcError("No displays found".into()));
    }

    // Primary first, then by id, so the default pick matches what users expect.
    monitors.sort_by_key(|m| (!m.info.is_primary, m.info.id));
    Ok(monitors)
}

/// Native monitor handle of a listed display, for starting capture.
fn display_handle(display_id: u32) -> Option<isize> {
    enumerate_monitors()
        .ok()?
        .into_iter()
        .find(|m| m.info.id == display_id)
        .map(|m| m.handle)
}

/// Bounds of a listed display, for normalizing cursor coordinates.
pub fn display_bounds(display_id: u32) -> Option<DisplayBounds> {
    enumerate_monitors()
        .ok()?
        .into_iter()
        .find(|m| m.info.id == display_id)
        .map(|m| m.bounds)
}

unsafe extern "system" fn collect_monitor(
    monitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    data: LPARAM,
) -> BOOL {
    // SAFETY: `data` is the `&mut Vec<MonitorEntry>` passed by `enumerate_monitors`.
    let monitors = unsafe { &mut *(data.0 as *mut Vec<MonitorEntry>) };
    if let Some(entry) = describe_monitor(monitor, monitors.len()) {
        monitors.push(entry);
    }
    BOOL::from(true)
}

fn describe_monitor(monitor: HMONITOR, index: usize) -> Option<MonitorEntry> {
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
    // SAFETY: MONITORINFOEXW begins with a MONITORINFO and cbSize says so.
    let got_info = unsafe {
        GetMonitorInfoW(
            monitor,
            &mut info as *mut MONITORINFOEXW as *mut MONITORINFO,
        )
    };
    if !got_info.as_bool() {
        return None;
    }

    let device_name = wide_to_string(&info.szDevice);
    let is_primary = info.monitorInfo.dwFlags & MONITORINFO_PRIMARY_FLAG != 0;

    // rcMonitor is in logical units when the process is not per-monitor DPI
    // aware, so ask the display driver for the real pixel mode instead.
    let (width, height) = current_pixel_size(&info).unwrap_or_else(|| {
        let rect = info.monitorInfo.rcMonitor;
        (
            (rect.right - rect.left).max(0) as u32,
            (rect.bottom - rect.top).max(0) as u32,
        )
    });
    if width == 0 || height == 0 {
        return None;
    }

    let number = display_number(&device_name).unwrap_or(index as u32 + 1);
    let rect = info.monitorInfo.rcMonitor;
    Some(MonitorEntry {
        info: DisplayInfo {
            id: number,
            name: format!("Display {number}"),
            width,
            height,
            scale_factor: monitor_scale_factor(monitor),
            is_primary,
        },
        bounds: DisplayBounds {
            origin_x: f64::from(rect.left),
            origin_y: f64::from(rect.top),
            width: f64::from(rect.right - rect.left),
            height: f64::from(rect.bottom - rect.top),
        },
        handle: monitor.0 as isize,
    })
}

fn current_pixel_size(info: &MONITORINFOEXW) -> Option<(u32, u32)> {
    let mut mode = DEVMODEW {
        dmSize: size_of::<DEVMODEW>() as u16,
        ..Default::default()
    };
    // SAFETY: szDevice is a NUL-terminated wide string filled by GetMonitorInfoW
    // and `mode` has its dmSize set as the API requires.
    let ok = unsafe {
        EnumDisplaySettingsW(
            PCWSTR(info.szDevice.as_ptr()),
            ENUM_CURRENT_SETTINGS,
            &mut mode,
        )
    };
    if ok.as_bool() && mode.dmPelsWidth > 0 && mode.dmPelsHeight > 0 {
        Some((mode.dmPelsWidth, mode.dmPelsHeight))
    } else {
        None
    }
}

fn monitor_scale_factor(monitor: HMONITOR) -> f64 {
    let mut dpi_x = 0u32;
    let mut dpi_y = 0u32;
    // SAFETY: both out-pointers are valid for the duration of the call.
    let result = unsafe { GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y) };
    scale_from_dpi(result.ok().map(|_| dpi_x))
}

fn scale_from_dpi(dpi: Option<u32>) -> f64 {
    match dpi {
        Some(dpi) if dpi > 0 => f64::from(dpi) / BASE_DPI,
        _ => 1.0,
    }
}

fn wide_to_string(wide: &[u16]) -> String {
    let len = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
    String::from_utf16_lossy(&wide[..len])
}

/// `\\.\DISPLAY2` -> 2. Windows keeps this number stable for a given output.
fn display_number(device_name: &str) -> Option<u32> {
    let digits: String = device_name
        .chars()
        .rev()
        .take_while(char::is_ascii_digit)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    digits.parse().ok().filter(|n| *n > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_display_number_from_device_name() {
        assert_eq!(display_number(r"\\.\DISPLAY1"), Some(1));
        assert_eq!(display_number(r"\\.\DISPLAY12"), Some(12));
        assert_eq!(display_number(r"\\.\DISPLAY"), None);
        assert_eq!(display_number(""), None);
    }

    #[test]
    fn converts_dpi_to_scale_factor() {
        assert_eq!(scale_from_dpi(Some(96)), 1.0);
        assert_eq!(scale_from_dpi(Some(144)), 1.5);
        assert_eq!(scale_from_dpi(Some(192)), 2.0);
        assert_eq!(scale_from_dpi(Some(0)), 1.0);
        assert_eq!(scale_from_dpi(None), 1.0);
    }

    #[test]
    fn trims_wide_strings_at_nul() {
        let wide: Vec<u16> = "DISPLAY1\0junk".encode_utf16().collect();
        assert_eq!(wide_to_string(&wide), "DISPLAY1");
    }

    #[test]
    fn listed_displays_are_sane() {
        // CI runners can be headless, so "no displays" is an acceptable answer.
        let Ok(displays) = WindowsScreenRecorder::list_displays() else {
            return;
        };
        assert!(displays.iter().filter(|d| d.is_primary).count() <= 1);
        for display in &displays {
            assert!(display.width > 0 && display.height > 0);
            assert!(display.scale_factor >= 1.0);
        }
    }
}
