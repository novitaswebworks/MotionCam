//! Windows audio capture: system sound (WASAPI loopback) and microphone.
//!
//! Both sources are converted to 48 kHz stereo and mixed on a wall-clock
//! schedule. The MP4 encoder numbers audio by sample count, so the mixer
//! always emits exactly as many samples as real time has passed (padding
//! silence). Without that, silent periods would make audio drift ahead of video.

use super::audio::AudioDeviceInfo;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, SizedSample, Stream, SupportedStreamConfig};
use parking_lot::Mutex;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub const OUTPUT_RATE: u32 = 48_000;
const TICK: Duration = Duration::from_millis(10);
/// Per-source backlog cap (2 s of stereo samples) so a stalled mixer cannot grow memory.
const MAX_QUEUE_SAMPLES: usize = OUTPUT_RATE as usize * 2 * 2;

type Queue = Arc<Mutex<VecDeque<f32>>>;
/// Receives interleaved 16-bit little-endian stereo PCM at 48 kHz.
pub type AudioSink = Box<dyn FnMut(&[u8]) -> Result<(), String> + Send>;

#[derive(Debug, Clone, Default)]
pub struct AudioRequest {
    pub system: bool,
    pub microphone: bool,
    pub mic_device_id: Option<String>,
}

impl AudioRequest {
    pub fn any(&self) -> bool {
        self.system || self.microphone
    }
}

pub fn list_input_devices() -> Vec<AudioDeviceInfo> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());
    let Ok(devices) = host.input_devices() else {
        return Vec::new();
    };
    devices
        .filter_map(|d| d.name().ok())
        .map(|name| AudioDeviceInfo {
            is_default: Some(&name) == default_name.as_ref(),
            id: name.clone(),
            name,
        })
        .collect()
}

pub struct AudioCapture {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    error: Arc<Mutex<Option<String>>>,
}

impl AudioCapture {
    /// Starts capture. `origin` is the instant that maps to audio sample 0
    /// (the first video frame). Fails if a requested device cannot be opened.
    pub fn start(request: AudioRequest, origin: Instant, sink: AudioSink) -> Result<Self, String> {
        let stop = Arc::new(AtomicBool::new(false));
        let error = Arc::new(Mutex::new(None));
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

        let thread_stop = Arc::clone(&stop);
        let thread_error = Arc::clone(&error);
        let thread = thread::spawn(move || {
            // cpal streams are not Send, so they live and die on this thread.
            let system = Queue::default();
            let mic = Queue::default();
            let streams = match open_streams(&request, &system, &mic) {
                Ok(streams) => {
                    let _ = ready_tx.send(Ok(()));
                    streams
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                    return;
                }
            };

            system.lock().clear();
            mic.lock().clear();
            if let Err(e) = mix_loop(&thread_stop, origin, &system, &mic, sink) {
                *thread_error.lock() = Some(e);
            }
            drop(streams);
        });

        match ready_rx.recv() {
            Ok(Ok(())) => Ok(Self {
                stop,
                thread: Some(thread),
                error,
            }),
            Ok(Err(e)) => {
                let _ = thread.join();
                Err(e)
            }
            Err(_) => Err("Audio capture thread exited unexpectedly".into()),
        }
    }

    pub fn stop(&mut self) -> Result<(), String> {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            thread
                .join()
                .map_err(|_| "Audio capture thread panicked".to_string())?;
        }
        match self.error.lock().take() {
            Some(e) => Err(e),
            None => Ok(()),
        }
    }
}

impl Drop for AudioCapture {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

fn open_streams(
    request: &AudioRequest,
    system: &Queue,
    mic: &Queue,
) -> Result<Vec<Stream>, String> {
    let host = cpal::default_host();
    let mut streams = Vec::new();

    if request.system {
        // On WASAPI, an input stream built on an output device is loopback.
        let device = host
            .default_output_device()
            .ok_or("No audio output device to capture system sound from")?;
        let config = device
            .default_output_config()
            .map_err(|e| format!("Could not read the output device format: {e}"))?;
        streams.push(build_stream(&device, config, Arc::clone(system))?);
    }

    if request.microphone {
        let device = pick_microphone(&host, request.mic_device_id.as_deref())?;
        let config = device
            .default_input_config()
            .map_err(|e| format!("Could not read the microphone format: {e}"))?;
        streams.push(build_stream(&device, config, Arc::clone(mic))?);
    }

    for stream in &streams {
        stream
            .play()
            .map_err(|e| format!("Could not start audio capture: {e}"))?;
    }
    Ok(streams)
}

fn pick_microphone(host: &cpal::Host, id: Option<&str>) -> Result<Device, String> {
    if let Some(id) = id {
        let mut devices = host
            .input_devices()
            .map_err(|e| format!("Could not list microphones: {e}"))?;
        return devices
            .find(|d| d.name().is_ok_and(|n| n == id))
            .ok_or_else(|| format!("Microphone \"{id}\" is not available"));
    }
    host.default_input_device()
        .ok_or_else(|| "No microphone found".to_string())
}

fn build_stream(
    device: &Device,
    config: SupportedStreamConfig,
    queue: Queue,
) -> Result<Stream, String> {
    match config.sample_format() {
        SampleFormat::F32 => build_typed::<f32>(device, &config, queue),
        SampleFormat::I16 => build_typed::<i16>(device, &config, queue),
        SampleFormat::U16 => build_typed::<u16>(device, &config, queue),
        other => Err(format!("Unsupported audio sample format: {other:?}")),
    }
}

fn build_typed<T>(
    device: &Device,
    config: &SupportedStreamConfig,
    queue: Queue,
) -> Result<Stream, String>
where
    T: SizedSample + Send + 'static,
    f32: cpal::FromSample<T>,
{
    let channels = usize::from(config.channels());
    let mut resampler = Resampler::new(config.sample_rate().0, OUTPUT_RATE);
    let mut stereo = Vec::new();

    device
        .build_input_stream(
            &config.config(),
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                stereo.clear();
                to_stereo(
                    data.iter().map(|s| cpal::Sample::to_sample::<f32>(*s)),
                    channels,
                    &mut stereo,
                );
                let converted = resampler.process(&stereo);
                let mut queue = queue.lock();
                queue.extend(converted);
                if queue.len() > MAX_QUEUE_SAMPLES {
                    let excess = queue.len() - MAX_QUEUE_SAMPLES;
                    queue.drain(..excess);
                }
            },
            |e| log::warn!("Audio stream error: {e}"),
            None,
        )
        .map_err(|e| format!("Could not open the audio device: {e}"))
}

fn mix_loop(
    stop: &AtomicBool,
    origin: Instant,
    system: &Queue,
    mic: &Queue,
    mut sink: AudioSink,
) -> Result<(), String> {
    let mut sent_frames: u64 = 0;
    while !stop.load(Ordering::Relaxed) {
        thread::sleep(TICK);
        let due = (origin.elapsed().as_secs_f64() * f64::from(OUTPUT_RATE)) as u64;
        if due <= sent_frames {
            continue;
        }
        let frames = (due - sent_frames) as usize;
        let a = take_frames(&mut system.lock(), frames);
        let b = take_frames(&mut mic.lock(), frames);
        sink(&mix_to_pcm16(&a, &b))?;
        sent_frames = due;
    }
    Ok(())
}

/// Collapses any channel layout to interleaved stereo (L, R).
fn to_stereo(input: impl Iterator<Item = f32>, channels: usize, out: &mut Vec<f32>) {
    match channels {
        0 => {}
        1 => out.extend(input.flat_map(|s| [s, s])),
        _ => {
            let mut frame = Vec::with_capacity(channels);
            for sample in input {
                frame.push(sample);
                if frame.len() == channels {
                    out.push(frame[0]);
                    out.push(frame[1]);
                    frame.clear();
                }
            }
        }
    }
}

/// Pops `frames` stereo frames, padding with silence when the device is quiet.
fn take_frames(queue: &mut VecDeque<f32>, frames: usize) -> Vec<f32> {
    let wanted = frames * 2;
    let available = queue.len().min(wanted);
    let mut out: Vec<f32> = queue.drain(..available).collect();
    out.resize(wanted, 0.0);
    out
}

fn mix_to_pcm16(a: &[f32], b: &[f32]) -> Vec<u8> {
    a.iter()
        .zip(b)
        .flat_map(|(x, y)| {
            let mixed = (x + y).clamp(-1.0, 1.0);
            ((mixed * f32::from(i16::MAX)) as i16).to_le_bytes()
        })
        .collect()
}

/// Streaming linear resampler for interleaved stereo.
struct Resampler {
    step: f64,
    position: f64,
    carry: Vec<[f32; 2]>,
}

impl Resampler {
    fn new(input_rate: u32, output_rate: u32) -> Self {
        Self {
            step: f64::from(input_rate) / f64::from(output_rate),
            position: 0.0,
            carry: Vec::new(),
        }
    }

    fn process(&mut self, stereo: &[f32]) -> Vec<f32> {
        if (self.step - 1.0).abs() < f64::EPSILON {
            return stereo.to_vec();
        }
        let mut frames = stereo.iter().copied();
        while let (Some(left), Some(right)) = (frames.next(), frames.next()) {
            self.carry.push([left, right]);
        }

        let mut out = Vec::new();
        while self.position + 1.0 < self.carry.len() as f64 {
            let index = self.position as usize;
            let frac = (self.position - index as f64) as f32;
            let (a, b) = (self.carry[index], self.carry[index + 1]);
            out.push(a[0] + (b[0] - a[0]) * frac);
            out.push(a[1] + (b[1] - a[1]) * frac);
            self.position += self.step;
        }

        let consumed = (self.position as usize).min(self.carry.len());
        self.carry.drain(..consumed);
        self.position -= consumed as f64;
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mono_is_duplicated_and_surround_is_trimmed_to_stereo() {
        let mut out = Vec::new();
        to_stereo([0.1, 0.2].into_iter(), 1, &mut out);
        assert_eq!(out, vec![0.1, 0.1, 0.2, 0.2]);

        out.clear();
        to_stereo([1.0, 2.0, 3.0, 4.0, 5.0, 6.0].into_iter(), 3, &mut out);
        assert_eq!(out, vec![1.0, 2.0, 4.0, 5.0]);
    }

    #[test]
    fn take_frames_pads_with_silence() {
        let mut queue: VecDeque<f32> = [0.5, 0.5].into_iter().collect();
        let out = take_frames(&mut queue, 3);
        assert_eq!(out, vec![0.5, 0.5, 0.0, 0.0, 0.0, 0.0]);
        assert!(queue.is_empty());
    }

    #[test]
    fn mixing_adds_and_clamps() {
        let pcm = mix_to_pcm16(&[0.5, 1.0], &[0.25, 1.0]);
        let samples: Vec<i16> = pcm
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]))
            .collect();
        assert_eq!(samples[1], i16::MAX);
        assert!((i32::from(samples[0]) - 24575).abs() < 2);
    }

    #[test]
    fn resampler_matches_expected_output_length() {
        let mut up = Resampler::new(24_000, 48_000);
        let input = vec![0.0f32; 2 * 480];
        let out = up.process(&input);
        assert!((out.len() as i64 - 2 * 958).abs() <= 4, "got {}", out.len());

        let mut same = Resampler::new(48_000, 48_000);
        assert_eq!(same.process(&[0.1, 0.2]), vec![0.1, 0.2]);

        let mut down = Resampler::new(96_000, 48_000);
        let out = down.process(&vec![0.0f32; 2 * 960]);
        assert!((out.len() as i64 - 2 * 480).abs() <= 4, "got {}", out.len());
    }
}
