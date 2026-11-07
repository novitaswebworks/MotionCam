use crate::capture::{CaptureStreamSettings, DisplayInfo, PermissionState};
use block2::RcBlock;
use core_graphics::access::ScreenCaptureAccess;
use objc2::runtime::Bool;
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
use screencapturekit::prelude::*;
use screencapturekit::recording_output::{
    SCRecordingOutput, SCRecordingOutputConfiguration, SCRecordingOutputDelegate,
};
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::Duration;

struct RecordingCompletion(Sender<Result<(), String>>);
impl SCRecordingOutputDelegate for RecordingCompletion {
    fn recording_did_finish(&self) {
        let _ = self.0.send(Ok(()));
    }
    fn recording_did_fail(&self, error: String) {
        let _ = self.0.send(Err(error));
    }
}
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MacCaptureError {
    #[error("ScreenCaptureKit error: {0}")]
    SCKError(String),
    #[error("Display with ID {0} not found")]
    DisplayNotFound(u32),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

pub fn screen_capture_permission_status() -> PermissionState {
    if ScreenCaptureAccess.preflight() {
        PermissionState::Granted
    } else {
        PermissionState::NotGranted
    }
}

pub fn request_screen_capture_permission() -> PermissionState {
    if ScreenCaptureAccess.request() {
        PermissionState::Granted
    } else {
        PermissionState::NotGranted
    }
}

pub fn microphone_permission_status() -> PermissionState {
    let Some(media_type) = (unsafe { AVMediaTypeAudio }) else {
        return PermissionState::Unsupported;
    };

    match unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) } {
        AVAuthorizationStatus::Authorized => PermissionState::Granted,
        AVAuthorizationStatus::NotDetermined => PermissionState::NotDetermined,
        AVAuthorizationStatus::Denied => PermissionState::Denied,
        AVAuthorizationStatus::Restricted => PermissionState::Restricted,
        _ => PermissionState::Unsupported,
    }
}

pub fn request_microphone_permission() -> Result<PermissionState, String> {
    let Some(media_type) = (unsafe { AVMediaTypeAudio }) else {
        return Ok(PermissionState::Unsupported);
    };
    let status = microphone_permission_status();
    if status != PermissionState::NotDetermined {
        return Ok(status);
    }

    let (sender, receiver) = mpsc::channel();
    let handler = RcBlock::new(move |granted: Bool| {
        let _ = sender.send(granted.as_bool());
    });
    unsafe {
        AVCaptureDevice::requestAccessForMediaType_completionHandler(media_type, &handler);
    }

    match receiver.recv_timeout(Duration::from_secs(120)) {
        Ok(true) => Ok(PermissionState::Granted),
        Ok(false) => Ok(PermissionState::Denied),
        Err(error) => Err(format!(
            "Timed out waiting for microphone permission: {error}"
        )),
    }
}

pub struct MacScreenRecorder {
    stream: Option<SCStream>,
    output_path: PathBuf,
    _recording_output: SCRecordingOutput,
    completion: Receiver<Result<(), String>>,
    frame_count: Arc<AtomicU64>,
    is_recording: Arc<AtomicBool>,
    capture_started_at: std::time::Instant,
}

impl MacScreenRecorder {
    pub fn list_displays() -> Result<Vec<DisplayInfo>, MacCaptureError> {
        let content =
            SCShareableContent::get().map_err(|e| MacCaptureError::SCKError(format!("{:?}", e)))?;

        let mut displays = Vec::new();
        for disp in content.displays() {
            let cg = core_graphics::display::CGDisplay::new(disp.display_id());
            let bounds = cg.bounds();
            displays.push(DisplayInfo {
                id: disp.display_id(),
                name: format!("Display {}", disp.display_id()),
                width: cg.pixels_wide() as u32,
                height: cg.pixels_high() as u32,
                scale_factor: cg.pixels_wide() as f64 / bounds.size.width.max(1.0),
                is_primary: cg.is_main(),
            });
        }

        Ok(displays)
    }

    pub fn start<P: AsRef<Path>>(
        output_file: P,
        target_display_id: Option<u32>,
        capture_system_audio: bool,
        capture_microphone: bool,
        mic_device_id: Option<String>,
        capture_settings: CaptureStreamSettings,
    ) -> Result<Self, MacCaptureError> {
        if !SCRecordingOutput::is_available() {
            return Err(MacCaptureError::SCKError(
                "Recording currently requires macOS 15 or newer".into(),
            ));
        }
        let output_path = output_file.as_ref().to_path_buf();
        if output_path.exists() {
            return Err(MacCaptureError::SCKError(
                "Refusing to overwrite an existing source recording".into(),
            ));
        }
        let frame_count = Arc::new(AtomicU64::new(0));
        let frame_count_clone = Arc::clone(&frame_count);
        let is_recording = Arc::new(AtomicBool::new(true));

        let captures_any_audio = capture_system_audio || capture_microphone;

        let content =
            SCShareableContent::get().map_err(|e| MacCaptureError::SCKError(format!("{:?}", e)))?;

        let displays = content.displays();
        let display = if let Some(target_id) = target_display_id {
            displays.iter().find(|d| d.display_id() == target_id)
        } else {
            displays.first()
        };

        let target_disp = display.ok_or(MacCaptureError::DisplayNotFound(
            target_display_id.unwrap_or(0),
        ))?;

        let width = capture_settings.width.max(2);
        let height = capture_settings.height.max(2);

        let filter = SCContentFilter::create()
            .with_display(target_disp)
            .with_excluding_windows(&[])
            .build()
            .map_err(|e| MacCaptureError::SCKError(format!("{:?}", e)))?;

        // Discipline 3.2 & Rule 5.3: shows_cursor MUST be false so cursor is not baked in
        let mut config = SCStreamConfiguration::new()
            .with_width(width)
            .with_height(height)
            .with_fps(capture_settings.fps)
            .with_shows_cursor(false);

        if capture_system_audio {
            config = config
                .with_captures_audio(true)
                .with_sample_rate(48000)
                .with_channel_count(2);
        }
        if capture_microphone {
            config = config
                .with_captures_microphone(true)
                .map_err(|e| MacCaptureError::SCKError(e.to_string()))?;
            if let Some(device_id) = mic_device_id.as_deref().filter(|id| !id.trim().is_empty()) {
                config = config
                    .with_microphone_capture_device_id(device_id)
                    .map_err(|e| MacCaptureError::SCKError(e.to_string()))?;
            }
        }

        let mut stream = SCStream::new(&filter, &config)
            .map_err(|e| MacCaptureError::SCKError(format!("{:?}", e)))?;

        stream
            .add_output_handler(
                move |_sample: CMSampleBuffer, of_type: SCStreamOutputType| {
                    if of_type == SCStreamOutputType::Screen {
                        frame_count_clone.fetch_add(1, Ordering::Relaxed);
                    }
                },
                SCStreamOutputType::Screen,
            )
            .map_err(|e| MacCaptureError::SCKError(format!("{:?}", e)))?;

        let recording_config = SCRecordingOutputConfiguration::new()
            .map_err(|e| MacCaptureError::SCKError(e.to_string()))?
            .with_output_url(&output_path)
            .map_err(|e| MacCaptureError::SCKError(e.to_string()))?;
        let (sender, completion) = mpsc::channel();
        let recording_output =
            SCRecordingOutput::new_with_delegate(&recording_config, RecordingCompletion(sender))
                .ok_or_else(|| {
                    MacCaptureError::SCKError("Could not create recording output".into())
                })?;
        stream
            .add_recording_output(&recording_output)
            .map_err(|e| MacCaptureError::SCKError(e.to_string()))?;

        let capture_started_at = std::time::Instant::now();
        stream
            .start_capture()
            .map_err(|e| MacCaptureError::SCKError(format!("{:?}", e)))?;

        log::info!(
            "ScreenCaptureKit started recording to {:?} at {}x{} (cursor hidden, audio={})",
            output_path,
            width,
            height,
            captures_any_audio
        );

        Ok(Self {
            stream: Some(stream),
            output_path,
            _recording_output: recording_output,
            completion,
            frame_count,
            is_recording,
            capture_started_at,
        })
    }

    pub fn stop(&mut self) -> Result<u64, MacCaptureError> {
        self.is_recording.store(false, Ordering::SeqCst);
        if let Some(stream) = self.stream.take() {
            stream
                .stop_capture()
                .map_err(|e| MacCaptureError::SCKError(e.to_string()))?;
            self.completion
                .recv_timeout(Duration::from_secs(30))
                .map_err(|e| {
                    MacCaptureError::SCKError(format!("Recording finalization failed: {e}"))
                })?
                .map_err(MacCaptureError::SCKError)?;
        } else {
            return Ok(self.frame_count.load(Ordering::Relaxed));
        }
        let total_frames = self.frame_count.load(Ordering::SeqCst);

        log::info!(
            "ScreenCaptureKit stopped. Captured {} frames to {:?}",
            total_frames,
            self.output_path
        );

        if std::fs::metadata(&self.output_path)?.len() == 0 {
            return Err(MacCaptureError::SCKError(
                "Recording produced an empty video".into(),
            ));
        }

        Ok(total_frames)
    }

    pub fn frame_count(&self) -> u64 {
        self.frame_count.load(Ordering::Relaxed)
    }

    pub fn capture_started_at(&self) -> std::time::Instant {
        self.capture_started_at
    }
}

impl Drop for MacScreenRecorder {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
