use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ProjectError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Invalid project bundle: {0}")]
    InvalidBundle(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedRampSegment {
    pub start_ms: f64,
    pub end_ms: f64,
    pub multiplier: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoomBlock {
    pub id: String,
    pub start_time_ms: f64,
    pub end_time_ms: f64,
    pub target_x: f64,
    pub target_y: f64,
    pub zoom: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub title: String,
    pub duration_ms: f64,
    pub source_res: (u32, u32),
    pub fps: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trim_in_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trim_out_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed_ramps: Option<Vec<SpeedRampSegment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AspectRatio {
    #[serde(rename = "16:9")]
    Widescreen,
    #[serde(rename = "9:16")]
    Portrait,
    #[serde(rename = "1:1")]
    Square,
    #[serde(rename = "4:5")]
    Social,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CanvasBackground {
    #[serde(rename = "mesh_gradient")]
    MeshGradient {
        colors: Vec<String>,
        blur: f64,
        #[serde(default)]
        noise: bool,
    },
    #[serde(rename = "radial_gradient")]
    RadialGradient {
        colors: Vec<String>,
        #[serde(default)]
        noise: bool,
    },
    #[serde(rename = "solid")]
    Solid { color: String },
    #[serde(rename = "blurred_wallpaper")]
    BlurredWallpaper {
        #[serde(default)]
        wallpaper_url: Option<String>,
        blur: f64,
    },
    #[serde(rename = "transparent")]
    Transparent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowChromeConfig {
    pub border_radius: f64,
    pub shadow_radius: f64,
    pub shadow_opacity: f64,
    pub show_chrome: bool,
    #[serde(default = "default_chrome_style")]
    pub chrome_style: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub window_padding: Option<f64>,
}

fn default_chrome_style() -> String {
    "macos".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorConfig {
    pub style: String,
    pub scale: f64,
    pub click_ripple: bool,
    pub smooth_trail: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeystrokeConfig {
    pub enabled: bool,
    pub style: String,
    pub position: String,
    pub duration_ms: u32,
    pub only_shortcuts: bool,
}

impl Default for KeystrokeConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            style: "dark_glass".to_string(),
            position: "bottom_center".to_string(),
            duration_ms: 1500,
            only_shortcuts: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioConfig {
    pub system_audio: bool,
    pub microphone: bool,
    #[serde(default = "default_audio_volume")]
    pub system_volume: f64,
    #[serde(default = "default_audio_volume")]
    pub mic_volume: f64,
    #[serde(default)]
    pub mic_device_id: Option<String>,
}

fn default_audio_volume() -> f64 {
    1.0
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            system_audio: true,
            microphone: true,
            system_volume: 1.0,
            mic_volume: 1.0,
            mic_device_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebcamConfig {
    pub enabled: bool,
    #[serde(default)]
    pub device_id: Option<String>,
    pub shape: String,
    pub position: String,
    pub size: u32,
    pub border_width: u32,
    pub border_color: String,
    pub shadow: bool,
    pub mirror: bool,
    pub auto_dodge: bool,
}

impl Default for WebcamConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            device_id: None,
            shape: "circle".to_string(),
            position: "bottom_right".to_string(),
            size: 180,
            border_width: 2,
            border_color: "#10b981".to_string(),
            shadow: true,
            mirror: true,
            auto_dodge: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleConfig {
    pub enabled: bool,
    pub style: String,
    pub position: String,
    pub font_size: u32,
    pub active_color: String,
    pub text_color: String,
    pub bg_opacity: f64,
}

impl Default for SubtitleConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            style: "word_highlight".to_string(),
            position: "bottom_center".to_string(),
            font_size: 22,
            active_color: "#10b981".to_string(),
            text_color: "#ffffff".to_string(),
            bg_opacity: 0.6,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SpringPhysicsConfig {
    pub mass: f64,
    pub stiffness: f64,
    pub damping: f64,
}

impl Default for SpringPhysicsConfig {
    fn default() -> Self {
        Self {
            mass: 1.0,
            stiffness: 170.0,
            damping: 26.0,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ZoomFocusMode {
    Auto,
    #[default]
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraKeyframe {
    pub t: f64,
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
    #[serde(default)]
    pub mode: ZoomFocusMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraConfig {
    pub mode: String,
    pub spring: SpringPhysicsConfig,
    pub default_zoom: f64,
    pub keyframes: Vec<CameraKeyframe>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasConfig {
    pub aspect_ratio: AspectRatio,
    pub background: CanvasBackground,
    pub window: WindowChromeConfig,
    pub cursor: CursorConfig,
    #[serde(default)]
    pub keystroke: KeystrokeConfig,
    #[serde(default)]
    pub audio: AudioConfig,
    #[serde(default)]
    pub webcam: WebcamConfig,
    #[serde(default)]
    pub subtitles: SubtitleConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub version: String,
    pub meta: ProjectMeta,
    pub canvas: CanvasConfig,
    pub camera: CameraConfig,
}

impl Default for ProjectConfig {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_string(),
            meta: ProjectMeta {
                title: "Untitled Recording".to_string(),
                duration_ms: 0.0,
                source_res: (3840, 2160),
                fps: 60,
                trim_in_ms: None,
                trim_out_ms: None,
                speed_ramps: None,
                created_at: Some(chrono::Utc::now().to_rfc3339()),
            },
            canvas: CanvasConfig {
                aspect_ratio: AspectRatio::Widescreen,
                background: CanvasBackground::MeshGradient {
                    colors: vec![
                        "#064e3b".to_string(),
                        "#059669".to_string(),
                        "#a7f3d0".to_string(),
                    ],
                    blur: 40.0,
                    noise: true,
                },
                window: WindowChromeConfig {
                    border_radius: 16.0,
                    shadow_radius: 48.0,
                    shadow_opacity: 0.35,
                    show_chrome: true,
                    chrome_style: "macos".to_string(),
                    title: Some("Display Capture · 4K 60fps Source".to_string()),
                    window_padding: Some(10.0),
                },
                cursor: CursorConfig {
                    style: "macos_black".to_string(),
                    scale: 1.4,
                    click_ripple: true,
                    smooth_trail: true,
                },
                keystroke: KeystrokeConfig::default(),
                audio: AudioConfig::default(),
                webcam: WebcamConfig::default(),
                subtitles: SubtitleConfig::default(),
            },
            camera: CameraConfig {
                mode: "auto".to_string(),
                spring: SpringPhysicsConfig::default(),
                default_zoom: 1.8,
                keyframes: Vec::new(),
            },
        }
    }
}

/// Helper for managing `.mcam` project bundles on disk.
pub struct McamProjectBundle {
    pub root_dir: PathBuf,
    pub config: ProjectConfig,
}

impl McamProjectBundle {
    /// Create and initialize a new `.mcam` project folder.
    pub fn create<P: AsRef<Path>>(target_path: P, meta: ProjectMeta) -> Result<Self, ProjectError> {
        let root = target_path.as_ref().to_path_buf();
        std::fs::create_dir_all(&root)?;
        std::fs::create_dir_all(root.join("thumbnails"))?;

        let config = ProjectConfig {
            meta,
            ..Default::default()
        };

        let bundle = Self {
            root_dir: root,
            config,
        };
        bundle.save_config()?;
        Ok(bundle)
    }

    /// Load an existing `.mcam` project bundle.
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, ProjectError> {
        let root = path.as_ref().to_path_buf();
        let config_file = root.join("project.json");
        if !config_file.exists() {
            return Err(ProjectError::InvalidBundle(
                "Missing project.json in bundle".to_string(),
            ));
        }

        let file = File::open(config_file)?;
        let reader = BufReader::new(file);
        let config: ProjectConfig = serde_json::from_reader(reader)?;

        Ok(Self {
            root_dir: root,
            config,
        })
    }

    /// Save updated project configuration without mutating raw sources.
    pub fn save_config(&self) -> Result<(), ProjectError> {
        let config_file = self.root_dir.join("project.json");
        let temp_file = self
            .root_dir
            .join(format!("project.json.{}.tmp", uuid::Uuid::new_v4()));
        let file = File::create(&temp_file)?;
        if let Err(error) = serde_json::to_writer_pretty(&file, &self.config) {
            let _ = std::fs::remove_file(&temp_file);
            return Err(error.into());
        }
        file.sync_all()?;
        std::fs::rename(&temp_file, config_file)?;
        Ok(())
    }

    pub fn source_video_path(&self) -> PathBuf {
        self.root_dir.join("source.mp4")
    }

    pub fn cursor_log_path(&self) -> PathBuf {
        self.root_dir.join("cursor.jsonl")
    }

    pub fn audio_path(&self) -> PathBuf {
        self.root_dir.join("audio.wav")
    }

    pub fn webcam_path(&self) -> PathBuf {
        self.root_dir.join("webcam.mp4")
    }

    pub fn transcript_path(&self) -> PathBuf {
        self.root_dir.join("transcript.json")
    }
}
