use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CursorEventType {
    Move,
    Down,
    Up,
    Scroll,
    Key,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
    Other,
}

/// Represents a microsecond-precision, normalized cursor event.
/// Matches PLAN.md §3.2 schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorEvent {
    /// Timestamp in milliseconds since recording start (sub-millisecond precision)
    pub t: f64,
    /// Normalized X coordinate [0.0, 1.0] relative to display width
    pub x: f64,
    /// Normalized Y coordinate [0.0, 1.0] relative to display height
    pub y: f64,
    #[serde(rename = "type")]
    pub event_type: CursorEventType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub btn: Option<MouseButton>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modifiers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcut: Option<String>,
}

impl Default for CursorEvent {
    fn default() -> Self {
        Self {
            t: 0.0,
            x: 0.5,
            y: 0.5,
            event_type: CursorEventType::Move,
            btn: None,
            key: None,
            modifiers: None,
            shortcut: None,
        }
    }
}

/// Map macOS virtual keycodes to human-readable strings.
pub fn macos_keycode_to_str(code: i64) -> Option<&'static str> {
    match code {
        0 => Some("A"),
        1 => Some("S"),
        2 => Some("D"),
        3 => Some("F"),
        4 => Some("H"),
        5 => Some("G"),
        6 => Some("Z"),
        7 => Some("X"),
        8 => Some("C"),
        9 => Some("V"),
        11 => Some("B"),
        12 => Some("Q"),
        13 => Some("W"),
        14 => Some("E"),
        15 => Some("R"),
        16 => Some("Y"),
        17 => Some("T"),
        18 => Some("1"),
        19 => Some("2"),
        20 => Some("3"),
        21 => Some("4"),
        22 => Some("6"),
        23 => Some("5"),
        24 => Some("="),
        25 => Some("9"),
        26 => Some("7"),
        27 => Some("-"),
        28 => Some("8"),
        29 => Some("0"),
        30 => Some("]"),
        31 => Some("O"),
        32 => Some("U"),
        33 => Some("["),
        34 => Some("I"),
        35 => Some("P"),
        36 => Some("Enter"),
        37 => Some("L"),
        38 => Some("J"),
        39 => Some("'"),
        40 => Some("K"),
        41 => Some(";"),
        42 => Some("\\"),
        43 => Some(","),
        44 => Some("/"),
        45 => Some("N"),
        46 => Some("M"),
        47 => Some("."),
        48 => Some("Tab"),
        49 => Some("Space"),
        50 => Some("`"),
        51 => Some("Backspace"),
        53 => Some("Escape"),
        122 => Some("F1"),
        120 => Some("F2"),
        99 => Some("F3"),
        118 => Some("F4"),
        96 => Some("F5"),
        97 => Some("F6"),
        98 => Some("F7"),
        100 => Some("F8"),
        101 => Some("F9"),
        109 => Some("F10"),
        103 => Some("F11"),
        111 => Some("F12"),
        123 => Some("←"),
        124 => Some("→"),
        125 => Some("↓"),
        126 => Some("↑"),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
pub fn decode_macos_keystroke(
    keycode: i64,
    flags: core_graphics::event::CGEventFlags,
) -> Option<(String, Vec<String>, String)> {
    use core_graphics::event::CGEventFlags;

    let key_str = macos_keycode_to_str(keycode)?;

    let mut modifiers = Vec::new();
    if flags.contains(CGEventFlags::CGEventFlagControl) {
        modifiers.push("⌃".to_string());
    }
    if flags.contains(CGEventFlags::CGEventFlagAlternate) {
        modifiers.push("⌥".to_string());
    }
    if flags.contains(CGEventFlags::CGEventFlagShift) {
        modifiers.push("⇧".to_string());
    }
    if flags.contains(CGEventFlags::CGEventFlagCommand) {
        modifiers.push("⌘".to_string());
    }

    let formatted_shortcut = if modifiers.is_empty() {
        key_str.to_string()
    } else {
        format!("{} + {}", modifiers.join(" + "), key_str)
    };

    Some((key_str.to_string(), modifiers, formatted_shortcut))
}

/// Display bounds used for sub-pixel coordinate normalization.
#[derive(Debug, Clone, Copy)]
pub struct DisplayBounds {
    pub origin_x: f64,
    pub origin_y: f64,
    pub width: f64,
    pub height: f64,
}

impl Default for DisplayBounds {
    fn default() -> Self {
        Self {
            origin_x: 0.0,
            origin_y: 0.0,
            width: 1920.0,
            height: 1080.0,
        }
    }
}

impl DisplayBounds {
    /// Normalize raw screen points to [0.0, 1.0] relative to this display.
    pub fn normalize(&self, screen_x: f64, screen_y: f64) -> (f64, f64) {
        let norm_x = if self.width > 0.0 {
            ((screen_x - self.origin_x) / self.width).clamp(0.0, 1.0)
        } else {
            0.5
        };
        let norm_y = if self.height > 0.0 {
            ((screen_y - self.origin_y) / self.height).clamp(0.0, 1.0)
        } else {
            0.5
        };
        (norm_x, norm_y)
    }
}

/// Global mouse event capture controller.
pub struct CursorRecorder {
    running: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
    output_path: PathBuf,
    error: Arc<parking_lot::Mutex<Option<String>>>,
}

impl CursorRecorder {
    pub fn start<P: AsRef<Path>>(
        output_file: P,
        bounds: DisplayBounds,
        start_instant: Instant,
    ) -> std::io::Result<Self> {
        let output_path = output_file.as_ref().to_path_buf();
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = Arc::clone(&running);

        let file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&output_path)?;
        let mut writer = BufWriter::new(file);
        let error = Arc::new(parking_lot::Mutex::new(None));
        let worker_error = Arc::clone(&error);

        let thread_handle = thread::spawn(move || {
            #[cfg(target_os = "macos")]
            {
                if let Err(err) = Self::run_macos_tap(
                    running_clone.clone(),
                    &mut writer,
                    bounds,
                    start_instant,
                    worker_error,
                ) {
                    log::warn!(
                        "macOS CGEventTap failed ({:?}); falling back to polling tap",
                        err
                    );
                    Self::run_polling_tap(running_clone, &mut writer, bounds, start_instant);
                }
            }

            #[cfg(not(target_os = "macos"))]
            {
                let _ = worker_error;
                Self::run_polling_tap(running_clone, &mut writer, bounds, start_instant);
            }
        });

        Ok(Self {
            running,
            thread_handle: Some(thread_handle),
            output_path,
            error,
        })
    }

    pub fn stop(&mut self) -> std::io::Result<()> {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            handle
                .join()
                .map_err(|_| std::io::Error::other("Cursor writer panicked"))?;
        }
        if let Some(error) = self.error.lock().as_ref() {
            return Err(std::io::Error::other(error.clone()));
        }
        Ok(())
    }

    pub fn output_path(&self) -> &Path {
        &self.output_path
    }

    #[cfg(target_os = "macos")]
    fn run_macos_tap(
        running: Arc<AtomicBool>,
        writer: &mut BufWriter<File>,
        bounds: DisplayBounds,
        start_instant: Instant,
        error: Arc<parking_lot::Mutex<Option<String>>>,
    ) -> Result<(), ()> {
        use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
        use core_graphics::event::{
            CGEvent, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
            CGEventTapProxy, CGEventType, CallbackResult,
        };
        use std::sync::mpsc;
        use std::time::Duration;

        let events_of_interest = vec![
            CGEventType::MouseMoved,
            CGEventType::LeftMouseDown,
            CGEventType::LeftMouseUp,
            CGEventType::RightMouseDown,
            CGEventType::RightMouseUp,
            CGEventType::OtherMouseDown,
            CGEventType::OtherMouseUp,
            CGEventType::ScrollWheel,
            CGEventType::LeftMouseDragged,
            CGEventType::RightMouseDragged,
            CGEventType::KeyDown,
        ];

        let (tx, rx) = mpsc::sync_channel::<CursorEvent>(4096);
        let file = writer.get_ref().try_clone().map_err(|_| ())?;
        let write_error = Arc::clone(&error);
        let writer_handle = thread::spawn(move || {
            let mut disk = BufWriter::new(file);
            let mut last_flush = Instant::now();
            let result = (|| -> std::io::Result<()> {
                loop {
                    match rx.recv_timeout(Duration::from_millis(100)) {
                        Ok(evt) => {
                            serde_json::to_writer(&mut disk, &evt)?;
                            writeln!(disk)?;
                        }
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                    }
                    if last_flush.elapsed() >= Duration::from_millis(100) {
                        disk.flush()?;
                        last_flush = Instant::now();
                    }
                }
                disk.flush()?;
                disk.get_ref().sync_data()
            })();
            if let Err(err) = result {
                *write_error.lock() = Some(err.to_string());
            }
        });

        let tx_callback = tx.clone();
        let tap_result = CGEventTap::with_enabled(
            CGEventTapLocation::HID,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            events_of_interest,
            move |_proxy: CGEventTapProxy, etype: CGEventType, event: &CGEvent| -> CallbackResult {
                let elapsed_ms = start_instant.elapsed().as_secs_f64() * 1000.0;
                let loc = event.location();
                let (norm_x, norm_y) = bounds.normalize(loc.x, loc.y);

                if let CGEventType::KeyDown = etype {
                    let keycode = event.get_integer_value_field(
                        core_graphics::event::EventField::KEYBOARD_EVENT_KEYCODE,
                    );
                    let flags = event.get_flags();
                    if let Some((key_name, modifiers, shortcut)) =
                        decode_macos_keystroke(keycode, flags)
                    {
                        let evt = CursorEvent {
                            t: (elapsed_ms * 100.0).round() / 100.0,
                            x: (norm_x * 10000.0).round() / 10000.0,
                            y: (norm_y * 10000.0).round() / 10000.0,
                            event_type: CursorEventType::Key,
                            btn: None,
                            key: Some(key_name),
                            modifiers: if modifiers.is_empty() {
                                None
                            } else {
                                Some(modifiers)
                            },
                            shortcut: Some(shortcut),
                        };
                        if tx_callback.try_send(evt).is_err() {
                            *error.lock() =
                                Some("Cursor event queue overflow or writer failure".into());
                        }
                    }
                    return CallbackResult::Keep;
                }

                let (evt_type, btn) = match etype {
                    CGEventType::MouseMoved
                    | CGEventType::LeftMouseDragged
                    | CGEventType::RightMouseDragged => (CursorEventType::Move, None),
                    CGEventType::LeftMouseDown => (CursorEventType::Down, Some(MouseButton::Left)),
                    CGEventType::LeftMouseUp => (CursorEventType::Up, Some(MouseButton::Left)),
                    CGEventType::RightMouseDown => {
                        (CursorEventType::Down, Some(MouseButton::Right))
                    }
                    CGEventType::RightMouseUp => (CursorEventType::Up, Some(MouseButton::Right)),
                    CGEventType::OtherMouseDown => {
                        (CursorEventType::Down, Some(MouseButton::Middle))
                    }
                    CGEventType::OtherMouseUp => (CursorEventType::Up, Some(MouseButton::Middle)),
                    CGEventType::ScrollWheel => (CursorEventType::Scroll, None),
                    _ => (CursorEventType::Move, None),
                };

                let evt = CursorEvent {
                    t: (elapsed_ms * 100.0).round() / 100.0,
                    x: (norm_x * 10000.0).round() / 10000.0,
                    y: (norm_y * 10000.0).round() / 10000.0,
                    event_type: evt_type,
                    btn,
                    ..Default::default()
                };

                if tx_callback.try_send(evt).is_err() {
                    *error.lock() = Some("Cursor event queue overflow or writer failure".into());
                }
                CallbackResult::Keep
            },
            || {
                let run_loop = CFRunLoop::get_current();
                while running.load(Ordering::Relaxed) {
                    CFRunLoop::run_in_mode(
                        unsafe { kCFRunLoopCommonModes },
                        Duration::from_millis(100),
                        false,
                    );
                }
                run_loop.stop();
            },
        );

        drop(tx);
        let _ = writer_handle.join();

        tap_result
    }

    /// Resilient cross-platform polling tap used as fallback or when permissions are restricted.
    fn run_polling_tap(
        running: Arc<AtomicBool>,
        writer: &mut BufWriter<File>,
        bounds: DisplayBounds,
        start_instant: Instant,
    ) {
        use std::time::Duration;

        let mut last_x = -1.0;
        let mut last_y = -1.0;

        while running.load(Ordering::Relaxed) {
            let elapsed_ms = start_instant.elapsed().as_secs_f64() * 1000.0;

            #[cfg(target_os = "macos")]
            let (screen_x, screen_y) = {
                use core_graphics::event::CGEvent;
                use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
                if let Ok(source) = CGEventSource::new(CGEventSourceStateID::CombinedSessionState) {
                    if let Ok(event) = CGEvent::new(source) {
                        let loc = event.location();
                        (loc.x, loc.y)
                    } else {
                        (
                            bounds.origin_x + bounds.width * 0.5,
                            bounds.origin_y + bounds.height * 0.5,
                        )
                    }
                } else {
                    (
                        bounds.origin_x + bounds.width * 0.5,
                        bounds.origin_y + bounds.height * 0.5,
                    )
                }
            };

            #[cfg(not(target_os = "macos"))]
            let (screen_x, screen_y) = (
                bounds.origin_x + bounds.width * 0.5,
                bounds.origin_y + bounds.height * 0.5,
            );

            let (norm_x, norm_y) = bounds.normalize(screen_x, screen_y);

            // Emit if movement occurred or on regular heartbeat (every ~8ms for 120Hz precision)
            if (norm_x - last_x).abs() > 0.0005 || (norm_y - last_y).abs() > 0.0005 {
                last_x = norm_x;
                last_y = norm_y;

                let evt = CursorEvent {
                    t: (elapsed_ms * 100.0).round() / 100.0,
                    x: (norm_x * 10000.0).round() / 10000.0,
                    y: (norm_y * 10000.0).round() / 10000.0,
                    event_type: CursorEventType::Move,
                    btn: None,
                    ..Default::default()
                };

                if let Ok(json) = serde_json::to_string(&evt) {
                    let _ = writeln!(writer, "{}", json);
                }
            }

            thread::sleep(Duration::from_millis(8)); // 120Hz sampling rate
        }

        let _ = writer.flush();
    }
}

impl Drop for CursorRecorder {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coordinate_normalization() {
        let bounds = DisplayBounds {
            origin_x: 0.0,
            origin_y: 0.0,
            width: 3840.0,
            height: 2160.0,
        };

        let (nx, ny) = bounds.normalize(1920.0, 1080.0);
        assert!((nx - 0.5).abs() < 1e-4);
        assert!((ny - 0.5).abs() < 1e-4);

        // Clamping checks
        let (cx, cy) = bounds.normalize(-100.0, 5000.0);
        assert_eq!(cx, 0.0);
        assert_eq!(cy, 1.0);
    }

    #[test]
    fn normalizes_secondary_display_using_logical_bounds() {
        let bounds = DisplayBounds {
            origin_x: -1920.0,
            origin_y: 200.0,
            width: 1920.0,
            height: 1080.0,
        };
        assert_eq!(bounds.normalize(-960.0, 740.0), (0.5, 0.5));
        assert_eq!(bounds.normalize(-1920.0, 200.0), (0.0, 0.0));
        assert_eq!(bounds.normalize(0.0, 1280.0), (1.0, 1.0));
    }

    #[test]
    fn test_cursor_event_serialization() {
        let evt = CursorEvent {
            t: 1420.5,
            x: 0.4521,
            y: 0.3120,
            event_type: CursorEventType::Down,
            btn: Some(MouseButton::Left),
            ..Default::default()
        };

        let json = serde_json::to_string(&evt).expect("serialize");
        assert!(json.contains("\"type\":\"down\""));
        assert!(json.contains("\"btn\":\"left\""));
        assert!(json.contains("\"t\":1420.5"));
    }

    #[test]
    fn test_keystroke_serialization() {
        let evt = CursorEvent {
            t: 2100.0,
            x: 0.5,
            y: 0.5,
            event_type: CursorEventType::Key,
            key: Some("K".to_string()),
            modifiers: Some(vec!["⌘".to_string()]),
            shortcut: Some("⌘ + K".to_string()),
            ..Default::default()
        };

        let json = serde_json::to_string(&evt).expect("serialize");
        assert!(json.contains("\"type\":\"key\""));
        assert!(json.contains("\"key\":\"K\""));
        assert!(json.contains("\"shortcut\":\"⌘ + K\""));
    }

    #[test]
    fn test_macos_keycode_mapping() {
        assert_eq!(macos_keycode_to_str(40), Some("K"));
        assert_eq!(macos_keycode_to_str(36), Some("Enter"));
        assert_eq!(macos_keycode_to_str(49), Some("Space"));
        assert_eq!(macos_keycode_to_str(53), Some("Escape"));
    }
}
