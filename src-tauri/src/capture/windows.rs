use crate::capture::DisplayInfo;
use std::mem::size_of;
use std::path::Path;
use thiserror::Error;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{BOOL, LPARAM, RECT, TRUE};
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

const NOT_IMPLEMENTED: &str = "Screen recording is not implemented on Windows yet";

/// `MONITORINFOF_PRIMARY` from winuser.h.
const MONITORINFO_PRIMARY_FLAG: u32 = 1;
/// Windows reports 96 DPI at 100% scaling.
const BASE_DPI: f64 = 96.0;

/// Windows Graphics Capture is not implemented yet. Display listing is real;
/// starting a recording still fails loudly instead of writing empty files.
pub struct WindowsScreenRecorder;

impl WindowsScreenRecorder {
    /// Lists attached monitors with their true pixel size and DPI scale.
    pub fn list_displays() -> Result<Vec<DisplayInfo>, WindowsCaptureError> {
        let mut displays: Vec<DisplayInfo> = Vec::new();

        // SAFETY: the callback only runs during this call and `displays`
        // outlives it, so the pointer smuggled through LPARAM stays valid.
        let ok = unsafe {
            EnumDisplayMonitors(
                None,
                None,
                Some(collect_monitor),
                LPARAM(&mut displays as *mut Vec<DisplayInfo> as isize),
            )
        };
        if !ok.as_bool() {
            return Err(WindowsCaptureError::WgcError(
                "Could not enumerate displays".into(),
            ));
        }
        if displays.is_empty() {
            return Err(WindowsCaptureError::WgcError("No displays found".into()));
        }

        // Primary first, then by id, so the default pick matches what users expect.
        displays.sort_by_key(|d| (!d.is_primary, d.id));
        Ok(displays)
    }

    pub fn start<P: AsRef<Path>>(
        _output_file: P,
        _target_display_id: Option<u32>,
    ) -> Result<Self, WindowsCaptureError> {
        Err(WindowsCaptureError::WgcError(NOT_IMPLEMENTED.into()))
    }

    pub fn stop(&mut self) -> Result<u64, WindowsCaptureError> {
        Err(WindowsCaptureError::WgcError(NOT_IMPLEMENTED.into()))
    }

    pub fn frame_count(&self) -> u64 {
        0
    }
}

unsafe extern "system" fn collect_monitor(
    monitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    data: LPARAM,
) -> BOOL {
    // SAFETY: `data` is the `&mut Vec<DisplayInfo>` passed by `list_displays`.
    let displays = unsafe { &mut *(data.0 as *mut Vec<DisplayInfo>) };
    if let Some(display) = describe_monitor(monitor, displays.len()) {
        displays.push(display);
    }
    TRUE
}

fn describe_monitor(monitor: HMONITOR, index: usize) -> Option<DisplayInfo> {
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
    Some(DisplayInfo {
        id: number,
        name: format!("Display {number}"),
        width,
        height,
        scale_factor: monitor_scale_factor(monitor),
        is_primary,
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
