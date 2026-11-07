//! Windows global mouse and keyboard capture using low-level hooks.
//!
//! Coordinates arrive in virtual-desktop pixels. They are normalized against
//! the recorded display, never stored raw (see CLAUDE.md §3.2).

use super::cursor::{CursorEvent, CursorEventType, DisplayBounds, MouseButton};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, KillTimer, SetTimer, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, WH_KEYBOARD_LL,
    WH_MOUSE_LL,
};

const HC_ACTION: i32 = 0;
const WM_KEYDOWN: u32 = 0x0100;
const WM_SYSKEYDOWN: u32 = 0x0104;
const WM_MOUSEMOVE: u32 = 0x0200;
const WM_LBUTTONDOWN: u32 = 0x0201;
const WM_LBUTTONUP: u32 = 0x0202;
const WM_RBUTTONDOWN: u32 = 0x0204;
const WM_RBUTTONUP: u32 = 0x0205;
const WM_MBUTTONDOWN: u32 = 0x0207;
const WM_MBUTTONUP: u32 = 0x0208;
const WM_MOUSEWHEEL: u32 = 0x020A;
const WM_XBUTTONDOWN: u32 = 0x020B;
const WM_XBUTTONUP: u32 = 0x020C;
const WM_MOUSEHWHEEL: u32 = 0x020E;

const VK_SHIFT: i32 = 0x10;
const VK_CONTROL: i32 = 0x11;
const VK_MENU: i32 = 0x12;
const VK_LWIN: i32 = 0x5B;
const VK_RWIN: i32 = 0x5C;

type SharedError = Arc<parking_lot::Mutex<Option<String>>>;

struct HookState {
    tx: SyncSender<CursorEvent>,
    bounds: DisplayBounds,
    start: Instant,
    error: SharedError,
}

/// Hook callbacks are bare `extern "system"` functions with no user data, so
/// the active recorder's state lives here. Only one recorder runs at a time.
static HOOK_STATE: Mutex<Option<HookState>> = Mutex::new(None);

pub fn run_windows_tap(
    running: Arc<AtomicBool>,
    writer: &mut BufWriter<File>,
    bounds: DisplayBounds,
    start: Instant,
    error: SharedError,
) -> Result<(), String> {
    let file = writer
        .get_ref()
        .try_clone()
        .map_err(|e| format!("Could not open the cursor log: {e}"))?;
    let (tx, rx) = mpsc::sync_channel::<CursorEvent>(4096);

    {
        let mut state = HOOK_STATE.lock().map_err(|_| "Input hook state poisoned")?;
        if state.is_some() {
            return Err("Another input recorder is already running".into());
        }
        *state = Some(HookState {
            tx: tx.clone(),
            bounds,
            start,
            error: Arc::clone(&error),
        });
    }

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

    let result = pump_messages(&running);

    // Drop every sender so the writer drains and exits.
    if let Ok(mut state) = HOOK_STATE.lock() {
        *state = None;
    }
    drop(tx);
    let _ = writer_handle.join();

    result
}

/// Installs the hooks on this thread and pumps messages until `running` clears.
/// Low-level hooks only fire while the installing thread processes messages.
fn pump_messages(running: &AtomicBool) -> Result<(), String> {
    // SAFETY: the hook procs are `extern "system"` with the HOOKPROC signature
    // and only touch HOOK_STATE. Both hooks are removed before returning.
    unsafe {
        let mouse = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), None, 0)
            .map_err(|e| format!("Could not hook the mouse: {e}"))?;
        let keyboard = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), None, 0) {
            Ok(hook) => hook,
            Err(e) => {
                let _ = UnhookWindowsHookEx(mouse);
                return Err(format!("Could not hook the keyboard: {e}"));
            }
        };

        // A thread timer wakes GetMessageW so we notice `running` clearing.
        let timer = SetTimer(None, 0, 50, None);
        let mut msg = MSG::default();
        while running.load(Ordering::Relaxed) {
            if GetMessageW(&mut msg, None, 0, 0).0 <= 0 {
                break;
            }
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        if timer != 0 {
            let _ = KillTimer(None, timer);
        }
        let _ = UnhookWindowsHookEx(mouse);
        let _ = UnhookWindowsHookEx(keyboard);
    }
    Ok(())
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION && lparam.0 != 0 {
        // SAFETY: for WH_MOUSE_LL with HC_ACTION, lParam points to an MSLLHOOKSTRUCT.
        let data = unsafe { &*(lparam.0 as *const MSLLHOOKSTRUCT) };
        if let Some((event_type, btn)) = classify_mouse(wparam.0 as u32) {
            emit(event_type, btn, data.pt.x, data.pt.y, None);
        }
    }
    // SAFETY: forwarding the unchanged hook arguments.
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let message = wparam.0 as u32;
    if code == HC_ACTION && lparam.0 != 0 && (message == WM_KEYDOWN || message == WM_SYSKEYDOWN) {
        // SAFETY: for WH_KEYBOARD_LL with HC_ACTION, lParam points to a KBDLLHOOKSTRUCT.
        let data = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        if let Some(key) = vk_to_str(data.vkCode) {
            let modifiers = held_modifiers();
            let shortcut = format_shortcut(&key, &modifiers);
            // Keystrokes carry no position; reuse the last known cursor spot.
            emit(
                CursorEventType::Key,
                None,
                i32::MIN,
                i32::MIN,
                Some((key, modifiers, shortcut)),
            );
        }
    }
    // SAFETY: forwarding the unchanged hook arguments.
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// `x`/`y` of `i32::MIN` mean "no position"; the event is placed at the centre
/// of the display so it normalizes cleanly.
fn emit(
    event_type: CursorEventType,
    btn: Option<MouseButton>,
    x: i32,
    y: i32,
    key: Option<(String, Vec<String>, String)>,
) {
    let Ok(guard) = HOOK_STATE.lock() else {
        return;
    };
    let Some(state) = guard.as_ref() else {
        return;
    };

    let elapsed_ms = state.start.elapsed().as_secs_f64() * 1000.0;
    let (norm_x, norm_y) = if x == i32::MIN {
        state.bounds.normalize(
            state.bounds.origin_x + state.bounds.width * 0.5,
            state.bounds.origin_y + state.bounds.height * 0.5,
        )
    } else {
        state.bounds.normalize(f64::from(x), f64::from(y))
    };

    let mut evt = CursorEvent {
        t: (elapsed_ms * 100.0).round() / 100.0,
        x: (norm_x * 10000.0).round() / 10000.0,
        y: (norm_y * 10000.0).round() / 10000.0,
        event_type,
        btn,
        ..Default::default()
    };
    if let Some((name, modifiers, shortcut)) = key {
        evt.key = Some(name);
        evt.modifiers = if modifiers.is_empty() {
            None
        } else {
            Some(modifiers)
        };
        evt.shortcut = Some(shortcut);
    }

    if state.tx.try_send(evt).is_err() {
        *state.error.lock() = Some("Cursor event queue overflow or writer failure".into());
    }
}

fn classify_mouse(message: u32) -> Option<(CursorEventType, Option<MouseButton>)> {
    // XBUTTON1/2 are the back/forward buttons; both map to Other.
    Some(match message {
        WM_MOUSEMOVE => (CursorEventType::Move, None),
        WM_LBUTTONDOWN => (CursorEventType::Down, Some(MouseButton::Left)),
        WM_LBUTTONUP => (CursorEventType::Up, Some(MouseButton::Left)),
        WM_RBUTTONDOWN => (CursorEventType::Down, Some(MouseButton::Right)),
        WM_RBUTTONUP => (CursorEventType::Up, Some(MouseButton::Right)),
        WM_MBUTTONDOWN => (CursorEventType::Down, Some(MouseButton::Middle)),
        WM_MBUTTONUP => (CursorEventType::Up, Some(MouseButton::Middle)),
        WM_XBUTTONDOWN => (CursorEventType::Down, Some(MouseButton::Other)),
        WM_XBUTTONUP => (CursorEventType::Up, Some(MouseButton::Other)),
        WM_MOUSEWHEEL | WM_MOUSEHWHEEL => (CursorEventType::Scroll, None),
        _ => return None,
    })
}

fn key_is_down(vk: i32) -> bool {
    // SAFETY: GetAsyncKeyState has no preconditions.
    let state = unsafe { GetAsyncKeyState(vk) };
    (state as u16) & 0x8000 != 0
}

fn held_modifiers() -> Vec<String> {
    modifier_names(
        key_is_down(VK_CONTROL),
        key_is_down(VK_MENU),
        key_is_down(VK_SHIFT),
        key_is_down(VK_LWIN) || key_is_down(VK_RWIN),
    )
}

fn modifier_names(ctrl: bool, alt: bool, shift: bool, win: bool) -> Vec<String> {
    [(ctrl, "Ctrl"), (alt, "Alt"), (shift, "Shift"), (win, "Win")]
        .into_iter()
        .filter(|(held, _)| *held)
        .map(|(_, name)| name.to_string())
        .collect()
}

fn format_shortcut(key: &str, modifiers: &[String]) -> String {
    if modifiers.is_empty() {
        key.to_string()
    } else {
        format!("{} + {}", modifiers.join(" + "), key)
    }
}

/// Map Windows virtual-key codes to the same names the macOS tap emits.
/// Pure modifier keys return `None`, matching macOS.
fn vk_to_str(vk: u32) -> Option<String> {
    let name = match vk {
        0x30..=0x39 | 0x41..=0x5A => char::from_u32(vk)?.to_string(),
        0x70..=0x7B => format!("F{}", vk - 0x6F),
        0x08 => "Backspace".into(),
        0x09 => "Tab".into(),
        0x0D => "Enter".into(),
        0x1B => "Escape".into(),
        0x20 => "Space".into(),
        0x25 => "←".into(),
        0x26 => "↑".into(),
        0x27 => "→".into(),
        0x28 => "↓".into(),
        0x2E => "Delete".into(),
        0xBA => ";".into(),
        0xBB => "=".into(),
        0xBC => ",".into(),
        0xBD => "-".into(),
        0xBE => ".".into(),
        0xBF => "/".into(),
        0xC0 => "`".into(),
        0xDB => "[".into(),
        0xDC => "\\".into(),
        0xDD => "]".into(),
        0xDE => "'".into(),
        _ => return None,
    };
    Some(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture::cursor::CursorRecorder;

    #[test]
    fn maps_virtual_keys_to_names() {
        assert_eq!(vk_to_str(0x41).as_deref(), Some("A"));
        assert_eq!(vk_to_str(0x35).as_deref(), Some("5"));
        assert_eq!(vk_to_str(0x70).as_deref(), Some("F1"));
        assert_eq!(vk_to_str(0x7B).as_deref(), Some("F12"));
        assert_eq!(vk_to_str(0x0D).as_deref(), Some("Enter"));
        assert_eq!(vk_to_str(0x27).as_deref(), Some("→"));
        assert_eq!(vk_to_str(0x11), None, "Ctrl alone is not a keystroke");
        assert_eq!(vk_to_str(0x10), None, "Shift alone is not a keystroke");
    }

    #[test]
    fn formats_shortcuts_with_modifiers() {
        let mods = modifier_names(true, false, true, false);
        assert_eq!(mods, vec!["Ctrl", "Shift"]);
        assert_eq!(format_shortcut("S", &mods), "Ctrl + Shift + S");
        assert_eq!(format_shortcut("S", &[]), "S");
    }

    #[test]
    fn classifies_mouse_messages() {
        assert_eq!(
            classify_mouse(WM_LBUTTONDOWN),
            Some((CursorEventType::Down, Some(MouseButton::Left)))
        );
        assert_eq!(
            classify_mouse(WM_MOUSEWHEEL),
            Some((CursorEventType::Scroll, None))
        );
        assert_eq!(classify_mouse(0x0001), None);
    }

    #[test]
    fn recorder_starts_and_stops_cleanly() {
        let path = std::env::temp_dir().join(format!(
            "motioncam-cursor-test-{}-{}.jsonl",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let bounds = DisplayBounds {
            origin_x: 0.0,
            origin_y: 0.0,
            width: 1920.0,
            height: 1080.0,
        };
        let mut recorder = CursorRecorder::start(&path, bounds, Instant::now()).unwrap();
        thread::sleep(Duration::from_millis(250));
        // A CI session may not allow hooks; a clear error is fine, a hang is not.
        let stopped = recorder.stop();

        let log = std::fs::read_to_string(&path).unwrap_or_default();
        let _ = std::fs::remove_file(&path);
        if stopped.is_ok() {
            for line in log.lines() {
                let evt: CursorEvent = serde_json::from_str(line).unwrap();
                assert!((0.0..=1.0).contains(&evt.x) && (0.0..=1.0).contains(&evt.y));
            }
        }
    }
}
