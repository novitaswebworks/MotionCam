//! Windows Graphics Capture session that records one monitor to an H.264 MP4.
//!
//! The cursor is never baked into the video (CLAUDE.md §1): it is recorded
//! separately by the input hooks and drawn as a vector in post.

use super::audio_windows::{AudioCapture, AudioRequest};
use super::CaptureStreamSettings;
use parking_lot::Mutex;
use std::ffi::c_void;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
use windows_capture::encoder::{
    AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder,
    VideoSettingsSubType,
};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};

type BoxError = Box<dyn std::error::Error + Send + Sync>;

/// How long to wait for the first frame before giving up on the capture.
const FIRST_FRAME_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Default)]
struct Shared {
    frames: AtomicU64,
    first_frame_at: Mutex<Option<Instant>>,
    error: Mutex<Option<String>>,
}

struct Flags {
    path: PathBuf,
    settings: CaptureStreamSettings,
    with_audio: bool,
    shared: Arc<Shared>,
}

struct Handler {
    encoder: Option<VideoEncoder>,
    shared: Arc<Shared>,
}

impl GraphicsCaptureApiHandler for Handler {
    type Flags = Flags;
    type Error = BoxError;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let Flags {
            path,
            settings,
            with_audio,
            shared,
        } = ctx.flags;
        let video = VideoSettingsBuilder::new(settings.width, settings.height)
            .sub_type(VideoSettingsSubType::H264)
            .frame_rate(settings.fps)
            .bitrate(target_bitrate(settings));
        let encoder = VideoEncoder::new(
            video,
            AudioSettingsBuilder::default().disabled(!with_audio),
            ContainerSettingsBuilder::default(),
            path,
        )?;
        Ok(Self {
            encoder: Some(encoder),
            shared,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        let Some(encoder) = self.encoder.as_mut() else {
            return Ok(());
        };
        if let Err(err) = encoder.send_frame(frame) {
            *self.shared.error.lock() = Some(format!("Video encoder failed: {err}"));
            capture_control.stop();
            return Ok(());
        }

        self.shared
            .first_frame_at
            .lock()
            .get_or_insert_with(Instant::now);
        self.shared.frames.fetch_add(1, Ordering::Relaxed);
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        // The captured monitor went away (unplugged, mode change, ...).
        let mut error = self.shared.error.lock();
        if error.is_none() {
            *error = Some("The captured display was closed".into());
        }
        Ok(())
    }
}

/// Roughly 0.1 bit per pixel, clamped to a sane range.
fn target_bitrate(settings: CaptureStreamSettings) -> u32 {
    let pixels_per_second =
        u64::from(settings.width) * u64::from(settings.height) * u64::from(settings.fps);
    (pixels_per_second / 10).clamp(8_000_000, 80_000_000) as u32
}

pub struct CaptureSession {
    control: Option<CaptureControl<Handler, BoxError>>,
    audio: Option<AudioCapture>,
    shared: Arc<Shared>,
    started_at: Instant,
}

impl CaptureSession {
    pub fn start(
        output_file: PathBuf,
        monitor_handle: isize,
        settings: CaptureStreamSettings,
        audio: AudioRequest,
    ) -> Result<Self, String> {
        let shared = Arc::new(Shared::default());
        let monitor = Monitor::from_raw_hmonitor(monitor_handle as *mut c_void);
        let capture_settings = Settings::new(
            monitor,
            CursorCaptureSettings::WithoutCursor,
            DrawBorderSettings::Default,
            SecondaryWindowSettings::Default,
            MinimumUpdateIntervalSettings::Default,
            DirtyRegionSettings::Default,
            ColorFormat::Bgra8,
            Flags {
                path: output_file,
                settings,
                with_audio: audio.any(),
                shared: Arc::clone(&shared),
            },
        );

        let control = Handler::start_free_threaded(capture_settings)
            .map_err(|e| format!("Could not start Windows screen capture: {e}"))?;
        let mut session = Self {
            control: Some(control),
            audio: None,
            shared,
            started_at: Instant::now(),
        };

        // Like macOS, only report success once real frames are flowing.
        let deadline = Instant::now() + FIRST_FRAME_TIMEOUT;
        while session.shared.first_frame_at.lock().is_none() {
            let failed = session.shared.error.lock().clone();
            let finished = session.control.as_ref().is_none_or(|c| c.is_finished());
            if failed.is_some() || finished || Instant::now() >= deadline {
                let reason = failed.unwrap_or_else(|| "No frames arrived from the display".into());
                let _ = session.stop();
                return Err(reason);
            }
            thread::sleep(Duration::from_millis(10));
        }

        if audio.any() {
            let handler = session
                .control
                .as_ref()
                .map(|c| c.callback())
                .ok_or("Capture stopped unexpectedly")?;
            let origin = session.capture_started_at();
            let sink: super::audio_windows::AudioSink =
                Box::new(move |bytes| match handler.lock().encoder.as_mut() {
                    Some(encoder) => encoder
                        .send_audio_buffer(bytes, 0)
                        .map_err(|e| format!("Audio encoder failed: {e}")),
                    None => Ok(()),
                });
            match AudioCapture::start(audio, origin, sink) {
                Ok(capture) => session.audio = Some(capture),
                Err(reason) => {
                    let _ = session.stop();
                    return Err(reason);
                }
            }
        }
        Ok(session)
    }

    /// The moment the first frame was encoded; cursor timestamps are relative to it.
    pub fn capture_started_at(&self) -> Instant {
        self.shared.first_frame_at.lock().unwrap_or(self.started_at)
    }

    pub fn frame_count(&self) -> u64 {
        self.shared.frames.load(Ordering::Relaxed)
    }

    /// Stops capture, finalizes the MP4 and returns the number of frames written.
    pub fn stop(&mut self) -> Result<u64, String> {
        let Some(control) = self.control.take() else {
            return Err("Capture already stopped".into());
        };
        // Stop audio first so nothing is sent to a finishing encoder.
        let audio_result = match self.audio.take() {
            Some(mut audio) => audio.stop(),
            None => Ok(()),
        };
        let handler = control.callback();
        control
            .stop()
            .map_err(|e| format!("Could not stop Windows screen capture: {e}"))?;

        // Finalize the file even if capture ended on an error, so the part
        // that was recorded is still a playable MP4.
        let encoder = handler.lock().encoder.take();
        if let Some(encoder) = encoder {
            encoder
                .finish()
                .map_err(|e| format!("Could not finish the video file: {e}"))?;
        }

        audio_result?;
        if let Some(error) = self.shared.error.lock().clone() {
            return Err(error);
        }
        let frames = self.frame_count();
        if frames == 0 {
            return Err("The recording contains no video frames".into());
        }
        Ok(frames)
    }
}

impl Drop for CaptureSession {
    fn drop(&mut self) {
        if self.control.is_some() {
            let _ = self.stop();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bitrate_scales_with_resolution_and_is_clamped() {
        let hd = CaptureStreamSettings {
            width: 1920,
            height: 1080,
            fps: 30,
        };
        let uhd = CaptureStreamSettings {
            width: 3840,
            height: 2160,
            fps: 60,
        };
        let tiny = CaptureStreamSettings {
            width: 320,
            height: 240,
            fps: 30,
        };
        assert_eq!(target_bitrate(hd), 8_000_000);
        assert_eq!(target_bitrate(uhd), 49_766_400);
        assert_eq!(target_bitrate(tiny), 8_000_000);
    }
}
