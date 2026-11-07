use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

impl AudioDeviceInfo {
    pub fn list() -> Vec<Self> {
        #[cfg(target_os = "macos")]
        {
            use screencapturekit::audio_devices::AudioInputDevice;
            let devs = AudioInputDevice::list();
            if !devs.is_empty() {
                return devs
                    .into_iter()
                    .map(|d| AudioDeviceInfo {
                        id: d.id,
                        name: d.name,
                        is_default: d.is_default,
                    })
                    .collect();
            }
        }

        #[cfg(target_os = "windows")]
        {
            return super::audio_windows::list_input_devices();
        }

        // An empty list is truthful when the platform has no implemented device
        // enumeration path or when macOS reports no available inputs.
        Vec::new()
    }
}

/// Standard 48kHz Stereo 16-bit PCM WAV audio writer.
pub struct WavWriter {
    writer: BufWriter<File>,
    path: PathBuf,
    bytes_written: u32,
    sample_rate: u32,
    channels: u16,
    bits_per_sample: u16,
    level_meter: Arc<AtomicU32>,
}

impl WavWriter {
    pub fn create<P: AsRef<Path>>(
        path: P,
        sample_rate: u32,
        channels: u16,
    ) -> std::io::Result<(Self, Arc<AtomicU32>)> {
        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&path)?;
        let mut writer = BufWriter::new(file);
        let level_meter = Arc::new(AtomicU32::new(0));

        let bits_per_sample = 16u16;

        // Write 44-byte WAV header placeholder
        let mut header = [0u8; 44];
        header[0..4].copy_from_slice(b"RIFF");
        // placeholder for riff length (offset 4..8)
        header[8..12].copy_from_slice(b"WAVE");
        header[12..16].copy_from_slice(b"fmt ");
        header[16..20].copy_from_slice(&16u32.to_le_bytes()); // Subchunk1Size (16 for PCM)
        header[20..22].copy_from_slice(&1u16.to_le_bytes()); // AudioFormat (1 = PCM)
        header[22..24].copy_from_slice(&channels.to_le_bytes());
        header[24..28].copy_from_slice(&sample_rate.to_le_bytes());

        let byte_rate = sample_rate * (channels as u32) * (bits_per_sample as u32 / 8);
        header[28..32].copy_from_slice(&byte_rate.to_le_bytes());

        let block_align = channels * (bits_per_sample / 8);
        header[32..34].copy_from_slice(&block_align.to_le_bytes());
        header[34..36].copy_from_slice(&bits_per_sample.to_le_bytes());
        header[36..40].copy_from_slice(b"data");
        // placeholder for data length (offset 40..44)

        writer.write_all(&header)?;
        writer.flush()?;

        let session = Self {
            writer,
            path: path.as_ref().to_path_buf(),
            bytes_written: 0,
            sample_rate,
            channels,
            bits_per_sample,
            level_meter: Arc::clone(&level_meter),
        };

        Ok((session, level_meter))
    }

    /// Write raw 16-bit PCM bytes and update the live RMS level meter.
    pub fn write_pcm_samples(&mut self, pcm_bytes: &[u8]) -> std::io::Result<()> {
        if pcm_bytes.is_empty() {
            return Ok(());
        }

        self.writer.write_all(pcm_bytes)?;
        self.bytes_written = self.bytes_written.saturating_add(pcm_bytes.len() as u32);

        // Calculate RMS audio level (0..100)
        let mut sum_sq: f64 = 0.0;
        let mut count = 0;
        let (samples, _) = pcm_bytes.as_chunks::<2>();
        for sample_bytes in samples {
            let sample = i16::from_le_bytes(*sample_bytes) as f64 / 32768.0;
            sum_sq += sample * sample;
            count += 1;
        }

        if count > 0 {
            let rms = (sum_sq / count as f64).sqrt();
            let level = ((rms * 150.0).min(100.0) as u32).min(100);
            self.level_meter.store(level, Ordering::Relaxed);
        }

        Ok(())
    }

    /// Finalize WAV file by writing final chunk lengths.
    pub fn finalize(mut self) -> std::io::Result<u32> {
        self.writer.flush()?;

        let riff_size = self.bytes_written.saturating_add(36);
        let data_size = self.bytes_written;

        let mut file = self.writer.into_inner()?;
        file.seek(SeekFrom::Start(4))?;
        file.write_all(&riff_size.to_le_bytes())?;

        file.seek(SeekFrom::Start(40))?;
        file.write_all(&data_size.to_le_bytes())?;
        file.flush()?;

        self.level_meter.store(0, Ordering::Relaxed);
        Ok(self.bytes_written)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn channels(&self) -> u16 {
        self.channels
    }

    pub fn bits_per_sample(&self) -> u16 {
        self.bits_per_sample
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_device_listing() {
        let devices = AudioDeviceInfo::list();
        assert!(devices
            .iter()
            .all(|device| !device.id.is_empty() && !device.name.is_empty()));
    }

    #[test]
    fn test_wav_writer_header_and_finalization() {
        let temp_dir = std::env::temp_dir();
        let wav_path = temp_dir.join(format!("test_audio_{}.wav", uuid::Uuid::new_v4()));

        let (mut writer, level_meter) = WavWriter::create(&wav_path, 48000, 2).expect("create wav");

        // Write 1 second of stereo 16-bit 48kHz audio (48000 * 2 channels * 2 bytes = 192,000 bytes)
        let sample_bytes = vec![0x40; 1920];
        writer.write_pcm_samples(&sample_bytes).expect("write");

        let level = level_meter.load(Ordering::Relaxed);
        assert!(level <= 100);

        let bytes_written = writer.finalize().expect("finalize");
        assert_eq!(bytes_written, 1920);

        // Verify file size and header
        let metadata = std::fs::metadata(&wav_path).expect("metadata");
        assert_eq!(metadata.len(), 1920 + 44);

        let bytes = std::fs::read(&wav_path).expect("read");
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(&bytes[12..16], b"fmt ");
        assert_eq!(&bytes[36..40], b"data");

        let _ = std::fs::remove_file(&wav_path);
    }
}
