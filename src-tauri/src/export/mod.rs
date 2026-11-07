use crate::project::{CameraKeyframe, McamProjectBundle};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ExportError {
    #[error("IO error during export: {0}")]
    Io(#[from] std::io::Error),
    #[error("Export encoding failure: {0}")]
    EncodingFailed(String),
    #[error("Project bundle error: {0}")]
    Bundle(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportPreset {
    #[serde(rename = "mp4_4k60")]
    Mp4_4k60,
    #[serde(rename = "mp4_1080p60")]
    Mp4_1080p60,
    #[serde(rename = "gif_optimized")]
    GifOptimized,
    #[serde(rename = "prores_422")]
    Prores422,
    #[serde(rename = "webm_vp9")]
    WebmVp9,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub preset: ExportPreset,
    pub resolution: (u32, u32),
    pub fps: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    pub include_audio: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportProgress {
    pub is_exporting: bool,
    pub current_frame: u64,
    pub total_frames: u64,
    pub progress_percent: f64,
    pub elapsed_secs: f64,
    pub eta_secs: f64,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

pub struct ActiveExportSession {
    pub current_frame: Arc<AtomicU64>,
    pub total_frames: Arc<AtomicU64>,
    pub is_exporting: Arc<AtomicBool>,
    pub cancel_requested: Arc<AtomicBool>,
    pub start_time: parking_lot::Mutex<Instant>,
    pub final_path: Arc<parking_lot::Mutex<Option<String>>>,
    pub error: Arc<parking_lot::Mutex<Option<String>>>,
}

impl Default for ActiveExportSession {
    fn default() -> Self {
        Self::new()
    }
}

impl ActiveExportSession {
    pub fn new() -> Self {
        Self {
            current_frame: Arc::new(AtomicU64::new(0)),
            total_frames: Arc::new(AtomicU64::new(0)),
            is_exporting: Arc::new(AtomicBool::new(false)),
            cancel_requested: Arc::new(AtomicBool::new(false)),
            start_time: parking_lot::Mutex::new(Instant::now()),
            final_path: Arc::new(parking_lot::Mutex::new(None)),
            error: Arc::new(parking_lot::Mutex::new(None)),
        }
    }

    pub fn get_progress(&self) -> ExportProgress {
        let current = self.current_frame.load(Ordering::Relaxed);
        let total = self.total_frames.load(Ordering::Relaxed).max(1);
        let is_exp = self.is_exporting.load(Ordering::Relaxed);
        let elapsed = self.start_time.lock().elapsed().as_secs_f64();

        let progress_pct = ((current as f64) / (total as f64) * 100.0).clamp(0.0, 100.0);
        let eta = if current > 0 && progress_pct < 100.0 {
            (elapsed / (current as f64)) * ((total - current) as f64)
        } else {
            0.0
        };

        ExportProgress {
            is_exporting: is_exp,
            current_frame: current,
            total_frames: total,
            progress_percent: (progress_pct * 10.0).round() / 10.0,
            elapsed_secs: (elapsed * 10.0).round() / 10.0,
            eta_secs: (eta * 10.0).round() / 10.0,
            output_path: self.final_path.lock().clone(),
            error: self.error.lock().clone(),
        }
    }

    pub fn cancel(&self) {
        self.cancel_requested.store(true, Ordering::SeqCst);
    }
}

pub struct HardwareExportPipeline;

struct ExportRenderSettings {
    preset: ExportPreset,
    fps: u32,
    width: u32,
    height: u32,
    trim_in: f64,
    trim_out: f64,
    total_frames: u64,
    include_audio: bool,
    keyframes: Vec<CameraKeyframe>,
}

impl HardwareExportPipeline {
    /// Render the source video with its camera keyframes and optional embedded audio.
    pub fn start_export<P: AsRef<Path>>(
        bundle_path: P,
        options: ExportOptions,
        session: &ActiveExportSession,
    ) -> Result<String, ExportError> {
        let bundle = McamProjectBundle::open(&bundle_path)
            .map_err(|e| ExportError::Bundle(e.to_string()))?;
        let source = bundle.source_video_path();
        if !source.is_file() || std::fs::metadata(&source)?.len() == 0 {
            return Err(ExportError::Bundle(
                "Project has no playable source video".into(),
            ));
        }
        if session.is_exporting.load(Ordering::SeqCst) {
            return Err(ExportError::EncodingFailed(
                "An export is already running".into(),
            ));
        }

        let duration = bundle.config.meta.duration_ms.max(0.0);
        let trim_in = bundle
            .config
            .meta
            .trim_in_ms
            .unwrap_or(0.0)
            .clamp(0.0, duration);
        let trim_out = bundle
            .config
            .meta
            .trim_out_ms
            .unwrap_or(duration)
            .clamp(trim_in, duration);
        if trim_out - trim_in < 100.0 {
            return Err(ExportError::Bundle(
                "Trim range must be at least 100 ms".into(),
            ));
        }
        let fps = options.fps.clamp(24, 120);
        let total_frames = (((trim_out - trim_in) / 1000.0) * f64::from(fps)).ceil() as u64;
        let width = options.resolution.0.clamp(2, 7680) & !1;
        let height = options.resolution.1.clamp(2, 4320) & !1;
        let extension = match options.preset {
            ExportPreset::GifOptimized => "gif",
            ExportPreset::Prores422 => "mov",
            ExportPreset::WebmVp9 => "webm",
            _ => "mp4",
        };
        let target = if let Some(path) = options.output_path {
            PathBuf::from(path)
        } else {
            let stem = bundle
                .root_dir
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy();
            bundle
                .root_dir
                .parent()
                .unwrap_or(&bundle.root_dir)
                .join(format!("{stem}_render.{extension}"))
        };
        let source_canonical = source.canonicalize()?;
        let target_is_source = target == source
            || target
                .canonicalize()
                .is_ok_and(|target_canonical| target_canonical == source_canonical);
        if target_is_source {
            return Err(ExportError::EncodingFailed(
                "Export cannot overwrite the source recording".into(),
            ));
        }
        if target.exists() {
            return Err(ExportError::EncodingFailed(format!(
                "Output already exists: {}",
                target.display()
            )));
        }
        let parent = target.parent().ok_or_else(|| {
            ExportError::EncodingFailed("Output path has no parent directory".into())
        })?;
        std::fs::create_dir_all(parent)?;

        session.total_frames.store(total_frames, Ordering::SeqCst);
        session.current_frame.store(0, Ordering::SeqCst);
        session.cancel_requested.store(false, Ordering::SeqCst);
        session.is_exporting.store(true, Ordering::SeqCst);
        *session.start_time.lock() = Instant::now();
        *session.error.lock() = None;
        *session.final_path.lock() = Some(target.to_string_lossy().into_owned());

        let current_frame = Arc::clone(&session.current_frame);
        let is_exporting = Arc::clone(&session.is_exporting);
        let cancel_requested = Arc::clone(&session.cancel_requested);
        let final_path = Arc::clone(&session.final_path);
        let error_state = Arc::clone(&session.error);
        let keyframes = bundle.config.camera.keyframes;
        let preset = options.preset;
        let include_audio = options.include_audio;
        let progress_file = std::env::temp_dir().join(format!(
            "motioncam-export-{}.progress",
            uuid::Uuid::new_v4()
        ));
        let output_path = target.clone();
        let returned_path = target.to_string_lossy().into_owned();
        let settings = ExportRenderSettings {
            preset,
            fps,
            width,
            height,
            trim_in,
            trim_out,
            total_frames,
            include_audio,
            keyframes,
        };

        thread::spawn(move || {
            let result = run_ffmpeg_export(
                &source,
                &output_path,
                &progress_file,
                settings,
                &current_frame,
                &cancel_requested,
            );
            match result {
                Ok(()) => log::info!("Export completed: {}", output_path.display()),
                Err(message) => {
                    if output_path.exists() {
                        let _ = std::fs::remove_file(&output_path);
                    }
                    if message != "Export cancelled" {
                        *error_state.lock() = Some(message);
                    } else {
                        *final_path.lock() = None;
                    }
                }
            }
            let _ = std::fs::remove_file(progress_file);
            is_exporting.store(false, Ordering::SeqCst);
        });
        Ok(returned_path)
    }
}

fn run_ffmpeg_export(
    source: &Path,
    target: &Path,
    progress_file: &Path,
    settings: ExportRenderSettings,
    current_frame: &AtomicU64,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let ExportRenderSettings {
        preset,
        fps,
        width,
        height,
        trim_in,
        trim_out,
        total_frames,
        include_audio,
        keyframes,
    } = settings;
    let filter = build_camera_filter(&keyframes, trim_in, fps, width, height);
    let mut command = Command::new("ffmpeg");
    command
        .args(["-hide_banner", "-loglevel", "error", "-nostats", "-n"])
        .arg("-ss")
        .arg(format!("{:.6}", trim_in / 1000.0))
        .arg("-i")
        .arg(source)
        .arg("-t")
        .arg(format!("{:.6}", (trim_out - trim_in) / 1000.0))
        .arg("-r")
        .arg(fps.to_string())
        .arg("-map")
        .arg("0:v:0");
    if include_audio && preset != ExportPreset::GifOptimized {
        command.args(["-map", "0:a:0?"]);
    } else {
        command.arg("-an");
    }
    match preset {
        ExportPreset::Mp4_4k60 | ExportPreset::Mp4_1080p60 => {
            #[cfg(target_os = "macos")]
            command.args(["-c:v", "h264_videotoolbox", "-b:v", "24M"]);
            #[cfg(not(target_os = "macos"))]
            command.args(["-c:v", "libx264", "-preset", "fast", "-crf", "18"]);
            if include_audio {
                command.args(["-c:a", "aac", "-b:a", "192k"]);
            }
        }
        ExportPreset::Prores422 => {
            command.args(["-c:v", "prores_ks", "-profile:v", "3"]);
            if include_audio {
                command.args(["-c:a", "pcm_s16le"]);
            }
        }
        ExportPreset::WebmVp9 => {
            command.args(["-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p"]);
            if include_audio {
                command.args(["-c:a", "libopus"]);
            }
        }
        ExportPreset::GifOptimized => {
            // Keep GIF encoding honest and portable. Palette optimization can be added
            // after the primary transformed-video path is stable on supported FFmpeg builds.
            command.arg("-vf").arg(format!(
                "{filter},fps=30,scale={}:-2:flags=lanczos",
                width.min(1080)
            ));
            command.arg("-loop").arg("0");
        }
    }
    if preset != ExportPreset::GifOptimized {
        command.arg("-vf").arg(&filter);
    }
    command
        .arg("-progress")
        .arg(progress_file)
        .arg(target)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start FFmpeg: {e}"))?;
    loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Export cancelled".into());
        }
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            if !status.success() {
                let output = child.wait_with_output().map_err(|e| e.to_string())?;
                let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
                return Err(if detail.is_empty() {
                    format!("FFmpeg failed with status {status}.")
                } else {
                    detail
                });
            }
            if !target.is_file()
                || std::fs::metadata(target)
                    .map(|meta| meta.len())
                    .unwrap_or(0)
                    == 0
            {
                return Err("FFmpeg exited without producing a non-empty output file".into());
            }
            current_frame.store(total_frames, Ordering::Relaxed);
            return Ok(());
        }
        if let Ok(content) = std::fs::read_to_string(progress_file) {
            if let Some(frame) = content
                .lines()
                .rev()
                .find_map(|line| line.strip_prefix("frame=")?.trim().parse::<u64>().ok())
            {
                current_frame.store(frame.min(total_frames), Ordering::Relaxed);
            }
        }
        thread::sleep(std::time::Duration::from_millis(100));
    }
}

fn build_camera_filter(
    keyframes: &[CameraKeyframe],
    trim_in: f64,
    fps: u32,
    width: u32,
    height: u32,
) -> String {
    let mut points: Vec<_> = keyframes
        .iter()
        .filter(|k| k.t.is_finite() && k.x.is_finite() && k.y.is_finite() && k.zoom.is_finite())
        .cloned()
        .collect();
    points.sort_by(|a, b| a.t.total_cmp(&b.t));
    if points.is_empty() {
        points.push(CameraKeyframe {
            t: trim_in,
            x: 0.5,
            y: 0.5,
            zoom: 1.0,
            mode: Default::default(),
            duration_ms: None,
        });
    }
    let zoom = keyframe_expression(&points, trim_in, fps, |k| k.zoom.clamp(1.0, 8.0));
    let cx = keyframe_expression(&points, trim_in, fps, |k| k.x.clamp(0.0, 1.0));
    let cy = keyframe_expression(&points, trim_in, fps, |k| k.y.clamp(0.0, 1.0));
    format!("scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,zoompan=z='{zoom}':x='max(0,min(iw-iw/zoom,iw*({cx})-iw/(2*zoom)))':y='max(0,min(ih-ih/zoom,ih*({cy})-ih/(2*zoom)))':d=1:s={width}x{height}:fps={fps}")
}

fn keyframe_expression(
    points: &[CameraKeyframe],
    trim_in: f64,
    fps: u32,
    value: impl Fn(&CameraKeyframe) -> f64,
) -> String {
    let frames: Vec<_> = points
        .iter()
        .map(|p| {
            (
                ((p.t - trim_in).max(0.0) / 1000.0) * f64::from(fps),
                value(p),
            )
        })
        .collect();
    let mut expr = format!("{:.6}", frames.last().map(|f| f.1).unwrap_or(1.0));
    for pair in frames.windows(2).rev() {
        let (start, a) = pair[0];
        let (end, b) = pair[1];
        if end <= start {
            continue;
        }
        let u = format!("((on-{start:.6})/{:.6})", end - start);
        let eased = format!("(({u})*({u})*(3-2*({u})))");
        expr = format!("if(lt(on,{end:.6}),({a:.6}+({b:.6}-{a:.6})*{eased}),{expr})");
    }
    if let Some((first, _)) = frames.first() {
        format!("if(lt(on,{first:.6}),{:.6},{expr})", frames[0].1)
    } else {
        expr
    }
}
