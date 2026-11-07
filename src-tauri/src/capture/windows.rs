use crate::capture::DisplayInfo;
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum WindowsCaptureError {
    #[error("Windows Graphics Capture error: {0}")]
    WgcError(String),
}

const NOT_IMPLEMENTED: &str = "Screen recording is not implemented on Windows yet";

/// Placeholder until Windows Graphics Capture is implemented. It never reports
/// fake displays and never writes empty recordings.
pub struct WindowsScreenRecorder;

impl WindowsScreenRecorder {
    pub fn list_displays() -> Result<Vec<DisplayInfo>, WindowsCaptureError> {
        Err(WindowsCaptureError::WgcError(NOT_IMPLEMENTED.into()))
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
