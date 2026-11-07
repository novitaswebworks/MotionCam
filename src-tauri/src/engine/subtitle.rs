use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Write};
use std::path::Path;

/// High-precision word-level transcription token with millisecond timing.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TranscriptWord {
    pub word: String,
    pub start_ms: f64,
    pub end_ms: f64,
    pub confidence: f32,
}

/// A subtitle cue segment containing full text and word-level timing for karaoke highlight.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SubtitleCue {
    pub id: String,
    pub start_ms: f64,
    pub end_ms: f64,
    pub text: String,
    pub words: Vec<TranscriptWord>,
}

pub struct SubtitleEngine;

impl SubtitleEngine {
    /// Format milliseconds into SRT timestamp format: HH:MM:SS,mmm
    pub fn format_srt_timestamp(ms: f64) -> String {
        let total_secs = ms.max(0.0) / 1000.0;
        let hours = (total_secs / 3600.0).floor() as u64;
        let mins = ((total_secs % 3600.0) / 60.0).floor() as u64;
        let secs = (total_secs % 60.0).floor() as u64;
        let millis = (ms.max(0.0) % 1000.0).round() as u64;
        format!(
            "{:02}:{:02}:{:02},{:03}",
            hours,
            mins,
            secs,
            millis.min(999)
        )
    }

    /// Format milliseconds into WebVTT timestamp format: HH:MM:SS.mmm
    pub fn format_vtt_timestamp(ms: f64) -> String {
        let total_secs = ms.max(0.0) / 1000.0;
        let hours = (total_secs / 3600.0).floor() as u64;
        let mins = ((total_secs % 3600.0) / 60.0).floor() as u64;
        let secs = (total_secs % 60.0).floor() as u64;
        let millis = (ms.max(0.0) % 1000.0).round() as u64;
        format!(
            "{:02}:{:02}:{:02}.{:03}",
            hours,
            mins,
            secs,
            millis.min(999)
        )
    }

    /// Export cues to standard SubRip (.srt) subtitle file string.
    pub fn export_srt(cues: &[SubtitleCue]) -> String {
        let mut out = String::new();
        for (i, cue) in cues.iter().enumerate() {
            out.push_str(&format!("{}\n", i + 1));
            out.push_str(&format!(
                "{} --> {}\n",
                Self::format_srt_timestamp(cue.start_ms),
                Self::format_srt_timestamp(cue.end_ms)
            ));
            out.push_str(&format!("{}\n\n", cue.text.trim()));
        }
        out
    }

    /// Export cues to standard WebVTT (.vtt) format.
    pub fn export_vtt(cues: &[SubtitleCue]) -> String {
        let mut out = String::from("WEBVTT\n\n");
        for (i, cue) in cues.iter().enumerate() {
            out.push_str(&format!("{}\n", i + 1));
            out.push_str(&format!(
                "{} --> {}\n",
                Self::format_vtt_timestamp(cue.start_ms),
                Self::format_vtt_timestamp(cue.end_ms)
            ));
            out.push_str(&format!("{}\n\n", cue.text.trim()));
        }
        out
    }

    /// Distribute words evenly across a known time window with realistic syllable weights.
    pub fn build_cue_from_text(id: String, text: &str, start_ms: f64, end_ms: f64) -> SubtitleCue {
        let raw_words: Vec<&str> = text.split_whitespace().collect();
        if raw_words.is_empty() {
            return SubtitleCue {
                id,
                start_ms,
                end_ms,
                text: text.to_string(),
                words: Vec::new(),
            };
        }

        let total_chars: usize = raw_words.iter().map(|w| w.len().max(1)).sum();
        let total_duration = (end_ms - start_ms).max(100.0);
        let mut words = Vec::with_capacity(raw_words.len());

        let mut current_start = start_ms;
        for (idx, w) in raw_words.iter().enumerate() {
            let weight = (w.len().max(1) as f64) / (total_chars as f64);
            let word_duration = (total_duration * weight).max(80.0);
            let is_last = idx == raw_words.len() - 1;
            let word_end = if is_last {
                end_ms
            } else {
                (current_start + word_duration).min(end_ms)
            };

            words.push(TranscriptWord {
                word: w.to_string(),
                start_ms: (current_start * 10.0).round() / 10.0,
                end_ms: (word_end * 10.0).round() / 10.0,
                confidence: 0.95,
            });

            current_start = word_end;
        }

        SubtitleCue {
            id,
            start_ms,
            end_ms,
            text: text.to_string(),
            words,
        }
    }

    /// Read transcript JSON file from bundle.
    pub fn read_transcript<P: AsRef<Path>>(path: P) -> std::io::Result<Vec<SubtitleCue>> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let cues = serde_json::from_reader(reader)?;
        Ok(cues)
    }

    /// Save transcript JSON file to bundle.
    pub fn save_transcript<P: AsRef<Path>>(path: P, cues: &[SubtitleCue]) -> std::io::Result<()> {
        let mut file = File::create(path)?;
        let json = serde_json::to_string_pretty(cues)?;
        file.write_all(json.as_bytes())?;
        file.flush()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_srt_timestamp() {
        assert_eq!(SubtitleEngine::format_srt_timestamp(0.0), "00:00:00,000");
        assert_eq!(SubtitleEngine::format_srt_timestamp(1234.0), "00:00:01,234");
        assert_eq!(
            SubtitleEngine::format_srt_timestamp(3661500.0),
            "01:01:01,500"
        );
    }

    #[test]
    fn test_format_vtt_timestamp() {
        assert_eq!(SubtitleEngine::format_vtt_timestamp(0.0), "00:00:00.000");
        assert_eq!(SubtitleEngine::format_vtt_timestamp(1234.0), "00:00:01.234");
    }

    #[test]
    fn test_build_cue_and_word_alignment() {
        let cue = SubtitleEngine::build_cue_from_text(
            "test-1".to_string(),
            "MotionCam is cinematic",
            1000.0,
            2500.0,
        );

        assert_eq!(cue.words.len(), 3);
        assert_eq!(cue.words[0].word, "MotionCam");
        assert_eq!(cue.words[0].start_ms, 1000.0);
        assert!(cue.words[0].end_ms > 1000.0);

        let last_word = &cue.words[2];
        assert_eq!(last_word.word, "cinematic");
        assert_eq!(last_word.end_ms, 2500.0);
    }

    #[test]
    fn test_export_srt() {
        let cues = vec![
            SubtitleCue {
                id: "1".to_string(),
                start_ms: 1000.0,
                end_ms: 3000.0,
                text: "Hello world".to_string(),
                words: Vec::new(),
            },
            SubtitleCue {
                id: "2".to_string(),
                start_ms: 3500.0,
                end_ms: 5000.0,
                text: "Second subtitle line".to_string(),
                words: Vec::new(),
            },
        ];

        let srt = SubtitleEngine::export_srt(&cues);
        assert!(srt.contains("1\n00:00:01,000 --> 00:00:03,000\nHello world"));
        assert!(srt.contains("2\n00:00:03,500 --> 00:00:05,000\nSecond subtitle line"));
    }

    #[test]
    fn test_save_and_read_transcript() {
        let temp_dir = std::env::temp_dir();
        let transcript_path =
            temp_dir.join(format!("transcript_test_{}.json", uuid::Uuid::new_v4()));

        let cue = SubtitleEngine::build_cue_from_text(
            "test-cue".to_string(),
            "Automatic transcription verified",
            500.0,
            2000.0,
        );

        SubtitleEngine::save_transcript(&transcript_path, &[cue.clone()]).expect("save");
        let loaded = SubtitleEngine::read_transcript(&transcript_path).expect("read");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].text, "Automatic transcription verified");
        assert_eq!(loaded[0].words.len(), 3);

        let _ = std::fs::remove_file(&transcript_path);
    }
}
