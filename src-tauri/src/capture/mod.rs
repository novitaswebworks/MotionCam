pub mod audio;
pub mod cursor;
pub mod webcam;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

pub use audio::AudioDeviceInfo;
use cursor::{CursorRecorder, DisplayBounds};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Instant;
use thiserror::Error;
pub use webcam::WebcamDeviceInfo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayInfo {
    pub id: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    Granted,
    NotGranted,
    NotDetermined,
    Denied,
    Restricted,
    Unsupported,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PermissionStatus {
    pub screen_capture: PermissionState,
    pub microphone: PermissionState,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureQuality {
    #[default]
    #[serde(rename = "source_60")]
    Source60,
    #[serde(rename = "full_hd_30")]
    FullHd30,
    #[serde(rename = "full_hd_60")]
    FullHd60,
}

impl CaptureQuality {
    pub fn fps(self) -> u32 {
        match self {
            Self::FullHd30 => 30,
            Self::Source60 | Self::FullHd60 => 60,
        }
    }

    pub fn resolution(self, source_width: u32, source_height: u32) -> (u32, u32) {
        let width = source_width.max(2);
        let height = source_height.max(2);
        let scale = match self {
            Self::Source60 => 1.0,
            Self::FullHd30 | Self::FullHd60 => (1920.0 / f64::from(width))
                .min(1080.0 / f64::from(height))
                .min(1.0),
        };

        let even_dimension = |dimension: u32| {
            let scaled = (f64::from(dimension) * scale).round() as u32;
            scaled.max(2) - scaled.max(2) % 2
        };

        (even_dimension(width), even_dimension(height))
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CaptureStreamSettings {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

#[derive(Error, Debug)]
pub enum RecordingError {
    #[error("Recording is already in progress")]
    AlreadyRecording,
    #[error("No active recording session")]
    NotRecording,
    #[error("IO failure: {0}")]
    Io(#[from] std::io::Error),
    #[error("Capture backend error: {0}")]
    Backend(String),
}

/// Active dual-stream recording session controller with parallel audio ingestion.
pub struct ActiveRecordingSession {
    pub project_dir: PathBuf,
    pub source_video_path: PathBuf,
    pub cursor_log_path: PathBuf,
    pub start_instant: Instant,
    pub display_info: DisplayInfo,
    pub capture_width: u32,
    pub capture_height: u32,
    pub capture_fps: u32,
    cursor_recorder: CursorRecorder,
    #[cfg(target_os = "macos")]
    screen_recorder: macos::MacScreenRecorder,
    #[cfg(not(target_os = "macos"))]
    #[allow(dead_code)]
    screen_recorder_frames: u64,
}

impl ActiveRecordingSession {
    pub fn start<P: AsRef<Path>>(
        project_dir: P,
        target_display: Option<u32>,
        capture_audio: bool,
        capture_microphone: bool,
        mic_device_id: Option<String>,
        capture_quality: CaptureQuality,
    ) -> Result<Self, RecordingError> {
        // Audio capture is only wired up on macOS so far.
        #[cfg(not(target_os = "macos"))]
        let _ = (capture_audio, capture_microphone, &mic_device_id);

        let dir = project_dir.as_ref().to_path_buf();
        if dir.exists() {
            return Err(RecordingError::Backend(
                "Refusing to start recording in an existing project directory".into(),
            ));
        }

        let source_video_path = dir.join("source.mp4");
        let cursor_log_path = dir.join("cursor.jsonl");

        let displays = Self::list_displays()?;
        let display = if let Some(id) = target_display {
            displays.into_iter().find(|d| d.id == id)
        } else {
            displays.into_iter().next()
        }
        .ok_or_else(|| RecordingError::Backend("Selected display is unavailable".into()))?;

        let (capture_width, capture_height) =
            capture_quality.resolution(display.width, display.height);
        let capture_fps = capture_quality.fps();
        std::fs::create_dir_all(&dir)?;

        #[cfg(target_os = "macos")]
        let bounds = {
            let rect = core_graphics::display::CGDisplay::new(display.id).bounds();
            DisplayBounds {
                origin_x: rect.origin.x,
                origin_y: rect.origin.y,
                width: rect.size.width,
                height: rect.size.height,
            }
        };
        #[cfg(not(target_os = "macos"))]
        let bounds = DisplayBounds::default();

        // Start native capture first so cursor timestamps do not include cursor-tap
        // startup time before ScreenCaptureKit begins producing frames.
        #[cfg(target_os = "macos")]
        let mut screen_recorder = match macos::MacScreenRecorder::start(
            &source_video_path,
            Some(display.id),
            capture_audio,
            capture_microphone,
            mic_device_id,
            CaptureStreamSettings {
                width: capture_width,
                height: capture_height,
                fps: capture_fps,
            },
        ) {
            Ok(recorder) => recorder,
            Err(error) => {
                let _ = std::fs::remove_dir_all(&dir);
                return Err(RecordingError::Backend(error.to_string()));
            }
        };

        #[cfg(not(target_os = "macos"))]
        let screen_recorder_frames = 0;

        #[cfg(target_os = "macos")]
        let start_instant = screen_recorder.capture_started_at();
        #[cfg(not(target_os = "macos"))]
        let start_instant = Instant::now();

        let cursor_recorder = match CursorRecorder::start(&cursor_log_path, bounds, start_instant) {
            Ok(recorder) => recorder,
            Err(error) => {
                #[cfg(target_os = "macos")]
                let _ = screen_recorder.stop();
                let _ = std::fs::remove_dir_all(&dir);
                return Err(error.into());
            }
        };

        Ok(Self {
            project_dir: dir,
            source_video_path,
            cursor_log_path,
            start_instant,
            display_info: display,
            capture_width,
            capture_height,
            capture_fps,
            cursor_recorder,
            #[cfg(target_os = "macos")]
            screen_recorder,
            #[cfg(not(target_os = "macos"))]
            screen_recorder_frames,
        })
    }

    pub fn stop(mut self) -> Result<(PathBuf, u64, f64), RecordingError> {
        let duration_ms = self.start_instant.elapsed().as_secs_f64() * 1000.0;
        let cursor_result = self.cursor_recorder.stop();

        #[cfg(target_os = "macos")]
        let frames = self
            .screen_recorder
            .stop()
            .map_err(|e| RecordingError::Backend(e.to_string()))?;

        #[cfg(not(target_os = "macos"))]
        let frames = self.screen_recorder_frames;

        cursor_result?;
        Ok((self.project_dir, frames, duration_ms))
    }

    pub fn list_displays() -> Result<Vec<DisplayInfo>, RecordingError> {
        #[cfg(target_os = "macos")]
        {
            macos::MacScreenRecorder::list_displays()
                .map_err(|e| RecordingError::Backend(e.to_string()))
        }
        #[cfg(not(target_os = "macos"))]
        {
            Err(RecordingError::Backend(
                "Screen recording is not implemented on this platform".into(),
            ))
        }
    }

    pub fn permission_status() -> PermissionStatus {
        #[cfg(target_os = "macos")]
        {
            PermissionStatus {
                screen_capture: macos::screen_capture_permission_status(),
                microphone: macos::microphone_permission_status(),
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            PermissionStatus {
                screen_capture: PermissionState::Unsupported,
                microphone: PermissionState::Unsupported,
            }
        }
    }

    pub fn request_screen_capture_permission() -> PermissionState {
        #[cfg(target_os = "macos")]
        {
            macos::request_screen_capture_permission()
        }
        #[cfg(not(target_os = "macos"))]
        {
            PermissionState::Unsupported
        }
    }

    pub fn request_microphone_permission() -> Result<PermissionState, String> {
        #[cfg(target_os = "macos")]
        {
            macos::request_microphone_permission()
        }
        #[cfg(not(target_os = "macos"))]
        {
            Ok(PermissionState::Unsupported)
        }
    }

    pub fn list_audio_devices() -> Vec<AudioDeviceInfo> {
        AudioDeviceInfo::list()
    }

    pub fn list_webcams() -> Vec<WebcamDeviceInfo> {
        WebcamDeviceInfo::list()
    }

    pub fn frame_count(&self) -> u64 {
        #[cfg(target_os = "macos")]
        {
            self.screen_recorder.frame_count()
        }
        #[cfg(not(target_os = "macos"))]
        {
            0
        }
    }
}
