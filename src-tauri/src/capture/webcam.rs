use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebcamDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

impl WebcamDeviceInfo {
    pub fn list() -> Vec<Self> {
        // Device capture is not implemented yet. Do not advertise fabricated devices as real.
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unimplemented_webcam_capture_has_no_fake_devices() {
        let list = WebcamDeviceInfo::list();
        assert!(list.is_empty());
    }
}
