export type CursorEventType = "move" | "down" | "up" | "scroll" | "key";
export type MouseButton = "left" | "right" | "middle" | "other";

export interface CursorEvent {
  t: number; // Elapsed millisecond timestamp
  x: number; // Normalized [0.0, 1.0] relative to display width
  y: number; // Normalized [0.0, 1.0] relative to display height
  type: CursorEventType;
  btn?: MouseButton;
  key?: string;
  modifiers?: string[];
  shortcut?: string;
}

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";

export interface MeshGradientBg {
  type: "mesh_gradient";
  colors: string[];
  blur: number;
  noise?: boolean;
}

export interface RadialGradientBg {
  type: "radial_gradient";
  colors: string[];
  noise?: boolean;
}

export interface SolidBg {
  type: "solid";
  color: string;
}

export interface BlurredWallpaperBg {
  type: "blurred_wallpaper";
  wallpaper_url?: string;
  blur: number;
}

export interface TransparentBg {
  type: "transparent";
}

export type CanvasBackground =
  | MeshGradientBg
  | RadialGradientBg
  | SolidBg
  | BlurredWallpaperBg
  | TransparentBg;

export type WindowChromeStyle = "macos" | "windows" | "minimal";

export interface WindowChromeConfig {
  border_radius: number;
  shadow_radius: number;
  shadow_opacity: number;
  show_chrome: boolean;
  chrome_style: WindowChromeStyle;
  title?: string;
  window_padding?: number;
}

export type CursorStyle =
  | "macos_black"
  | "macos_white"
  | "windows_modern"
  | "neon";

export interface CursorConfig {
  style: CursorStyle;
  scale: number;
  click_ripple: boolean;
  smooth_trail: boolean;
}

export type KeystrokeBadgeStyle = "dark_glass" | "light_glass" | "minimal";
export type KeystrokeBadgePosition = "bottom_center" | "bottom_left" | "top_center";

export interface KeystrokeConfig {
  enabled: boolean;
  style: KeystrokeBadgeStyle;
  position: KeystrokeBadgePosition;
  duration_ms: number;
  only_shortcuts: boolean;
}

export interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

export type PermissionState =
  | "granted"
  | "not_granted"
  | "not_determined"
  | "denied"
  | "restricted"
  | "unsupported"
  | "unknown";

export interface PermissionStatus {
  screen_capture: PermissionState;
  microphone: PermissionState;
}

export interface AudioConfig {
  system_audio: boolean;
  microphone: boolean;
  mic_device_id?: string;
  system_volume: number;
  mic_volume: number;
}

export type WebcamShape = "circle" | "squircle" | "rectangle";
export type WebcamPosition = "bottom_right" | "bottom_left" | "top_right" | "top_left";

export interface WebcamConfig {
  enabled: boolean;
  device_id?: string;
  shape: WebcamShape;
  position: WebcamPosition;
  size: number;
  border_width: number;
  border_color: string;
  shadow: boolean;
  mirror: boolean;
  auto_dodge: boolean;
}

export interface WebcamDeviceInfo {
  id: string;
  name: string;
  is_default: boolean;
}

export interface TranscriptWord {
  word: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
}

export interface SubtitleCue {
  id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  words: TranscriptWord[];
}

export type SubtitleStyle =
  | "word_highlight"
  | "glass_box"
  | "minimal_text"
  | "cinema_caps";

export type SubtitlePosition = "bottom_center" | "middle_center" | "top_center";

export interface SubtitleConfig {
  enabled: boolean;
  style: SubtitleStyle;
  position: SubtitlePosition;
  font_size: number;
  active_color: string;
  text_color: string;
  bg_opacity: number;
}

export interface SpringConfig {
  mass: number;
  stiffness: number;
  damping: number;
}

export interface CameraKeyframe {
  t: number;
  x: number;
  y: number;
  zoom: number;
  mode?: "auto" | "manual";
  duration_ms?: number;
}

export interface ZoomBlock {
  id: string;
  start_time_ms: number;
  end_time_ms: number;
  target_x: number;
  target_y: number;
  zoom: number;
}

export interface SpeedRampSegment {
  start_ms: number;
  end_ms: number;
  multiplier: number;
}

export interface CameraConfig {
  mode: "auto" | "manual";
  spring: SpringConfig;
  default_zoom: number;
  keyframes: CameraKeyframe[];
}

export interface ProjectMeta {
  title: string;
  duration_ms: number;
  source_res: [number, number];
  fps: number;
  trim_in_ms?: number;
  trim_out_ms?: number;
  speed_ramps?: SpeedRampSegment[];
  created_at?: string;
}

export interface CanvasConfig {
  aspect_ratio: AspectRatio;
  background: CanvasBackground;
  window: WindowChromeConfig;
  cursor: CursorConfig;
  keystroke: KeystrokeConfig;
  audio: AudioConfig;
  webcam: WebcamConfig;
  subtitles: SubtitleConfig;
}

export interface ProjectConfig {
  version: string;
  meta: ProjectMeta;
  canvas: CanvasConfig;
  camera: CameraConfig;
}

export interface RecordingSessionState {
  isRecording: boolean;
  isPaused: boolean;
  durationMs: number;
  capturedFrames: number;
  capturedEvents: number;
  outputPath?: string;
}

export interface DisplayInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  scale_factor: number;
  is_primary: boolean;
}

export type ExportPreset =
  | "mp4_4k60"
  | "mp4_1080p60"
  | "gif_optimized"
  | "prores_422"
  | "webm_vp9";

export interface ExportOptions {
  preset: ExportPreset;
  resolution: [number, number];
  fps: number;
  output_path?: string;
  include_audio: boolean;
}

export interface ExportProgress {
  is_exporting: boolean;
  current_frame: number;
  total_frames: number;
  progress_percent: number;
  elapsed_secs: number;
  eta_secs: number;
  output_path?: string;
  error?: string;
}
