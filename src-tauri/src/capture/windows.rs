use crate::capture::DisplayInfo;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum WindowsCaptureError {
    #[error("Windows Graphics Capture error: {0}")]
    WgcError(String),
    #[error("Display not found")]
    DisplayNotFound,
}

pub struct WindowsScreenRecorder {
    output_path: PathBuf,
    frame_count: Arc<AtomicU64>,
    is_recording: Arc<AtomicBool>,
}

impl WindowsScreenRecorder {
    pub fn list_displays() -> Result<Vec<DisplayInfo>, WindowsCaptureError> {
        Ok(vec![DisplayInfo {
            id: 1,
            name: "Primary Monitor".to_string(),
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
            is_primary: true,
        }])
    }

    pub fn start<P: AsRef<Path>>(
        output_file: P,
        _target_display_id: Option<u32>,
    ) -> Result<Self, WindowsCaptureError> {
        let output_path = output_file.as_ref().to_path_buf();
        let frame_count = Arc::new(AtomicU64::new(0));
        let is_recording = Arc::new(AtomicBool::new(true));

        Ok(Self {
            output_path,
            frame_count,
            is_recording,
        })
    }

    pub fn stop(&mut self) -> Result<u64, WindowsCaptureError> {
        self.is_recording.store(false, Ordering::SeqCst);
        if !self.output_path.exists() {
            let _ = std::fs::File::create(&self.output_path);
        }
        Ok(self.frame_count.load(Ordering::SeqCst))
    }

    pub fn frame_count(&self) -> u64 {
        self.frame_count.load(Ordering::Relaxed)
    }
}
