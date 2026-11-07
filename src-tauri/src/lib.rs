pub mod capture;
pub mod engine;
pub mod export;
pub mod project;

use capture::{ActiveRecordingSession, DisplayInfo, RecordingError};
use engine::{evaluate_camera_at_time, ClusterDetector};
use parking_lot::Mutex;
use project::{
    CameraKeyframe, CanvasConfig, McamProjectBundle, ProjectConfig, ProjectMeta,
    SpringPhysicsConfig,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

static PROJECT_CONFIG_WRITE_LOCK: Mutex<()> = Mutex::new(());

pub struct AppState {
    pub active_session: Mutex<Option<ActiveRecordingSession>>,
    pub last_project_path: Mutex<Option<PathBuf>>,
    pub export_session: Arc<export::ActiveExportSession>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            active_session: Mutex::new(None),
            last_project_path: Mutex::new(None),
            export_session: Arc::new(export::ActiveExportSession::new()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionStatus {
    pub is_recording: bool,
    pub duration_ms: f64,
    pub captured_frames: u64,
    pub project_path: Option<String>,
}

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn list_displays() -> Result<Vec<DisplayInfo>, String> {
        ActiveRecordingSession::list_displays().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_permission_status() -> capture::PermissionStatus {
        ActiveRecordingSession::permission_status()
    }

    #[tauri::command]
    pub fn request_screen_capture_permission() -> capture::PermissionState {
        ActiveRecordingSession::request_screen_capture_permission()
    }

    #[tauri::command]
    pub async fn request_microphone_permission() -> Result<capture::PermissionState, String> {
        tauri::async_runtime::spawn_blocking(ActiveRecordingSession::request_microphone_permission)
            .await
            .map_err(|error| error.to_string())?
    }

    #[tauri::command]
    pub fn open_privacy_settings(section: String) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            let anchor = match section.as_str() {
                "screen" => "Privacy_ScreenCapture",
                "microphone" => "Privacy_Microphone",
                _ => return Err("Unsupported privacy settings section".into()),
            };
            let url = format!("x-apple.systempreferences:com.apple.preference.security?{anchor}");
            std::process::Command::new("open")
                .args(["-b", "com.apple.systempreferences", &url])
                .spawn()
                .map_err(|error| format!("Could not open macOS Privacy & Security: {error}"))?;
            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = section;
            Err("Open privacy permissions from your operating system settings".into())
        }
    }

    #[tauri::command]
    pub fn list_audio_devices() -> Vec<capture::AudioDeviceInfo> {
        ActiveRecordingSession::list_audio_devices()
    }

    #[tauri::command]
    pub fn list_webcams() -> Vec<capture::WebcamDeviceInfo> {
        ActiveRecordingSession::list_webcams()
    }

    #[tauri::command]
    pub async fn start_recording(
        state: State<'_, Arc<AppState>>,
        display_id: Option<u32>,
        capture_audio: Option<bool>,
        capture_microphone: Option<bool>,
        mic_device_id: Option<String>,
        capture_quality: Option<capture::CaptureQuality>,
    ) -> Result<String, String> {
        let state = Arc::clone(state.inner());
        tauri::async_runtime::spawn_blocking(move || {
            let mut session_lock = state.active_session.lock();
            if session_lock.is_some() {
                return Err(RecordingError::AlreadyRecording.to_string());
            }

            // Generate output .mcam directory in home Movies / recordings directory
            let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
            let home_dir = dirs::video_dir()
                .or_else(dirs::home_dir)
                .unwrap_or_else(|| PathBuf::from("/tmp"));
            let project_dir = home_dir.join("MotionCam Recordings").join(format!(
                "Recording_{}_{}.mcam",
                timestamp,
                uuid::Uuid::new_v4()
            ));

            let session = ActiveRecordingSession::start(
                &project_dir,
                display_id,
                capture_audio.unwrap_or(true),
                capture_microphone.unwrap_or_else(|| mic_device_id.is_some()),
                mic_device_id,
                capture_quality.unwrap_or_default(),
            )
            .map_err(|e| e.to_string())?;

            let path_str = project_dir.to_string_lossy().to_string();
            *session_lock = Some(session);

            log::info!("Started dual-stream recording session at: {}", path_str);
            Ok(path_str)
        })
        .await
        .map_err(|error| error.to_string())?
    }

    #[tauri::command]
    pub async fn stop_recording(state: State<'_, Arc<AppState>>) -> Result<String, String> {
        let state = Arc::clone(state.inner());
        tauri::async_runtime::spawn_blocking(move || {
            let mut session_lock = state.active_session.lock();
            let session = session_lock
                .take()
                .ok_or_else(|| RecordingError::NotRecording.to_string())?;

            let capture_res = (session.capture_width, session.capture_height);
            let capture_fps = session.capture_fps;
            let (project_dir, captured_frames, duration_ms) =
                session.stop().map_err(|e| e.to_string())?;

            // Create and save project.json in .mcam container
            let meta = ProjectMeta {
                title: project_dir
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Recording".to_string()),
                duration_ms,
                source_res: capture_res,
                fps: capture_fps,
                trim_in_ms: Some(0.0),
                trim_out_ms: Some(duration_ms),
                speed_ramps: Some(Vec::new()),
                created_at: Some(chrono::Utc::now().to_rfc3339()),
            };

            let bundle =
                McamProjectBundle::create(&project_dir, meta).map_err(|e| e.to_string())?;

            // Auto-run kinetic cluster detector on the recorded cursor.jsonl to pre-populate zoom keyframes
            let cursor_path = bundle.cursor_log_path();
            if cursor_path.exists() {
                if let Ok(events) = ClusterDetector::read_events_from_jsonl(&cursor_path) {
                    let detector = ClusterDetector::default();
                    let keyframes = detector.generate_camera_keyframes(&events);
                    if !keyframes.is_empty() {
                        let mut updated_bundle = bundle;
                        updated_bundle.config.camera.keyframes = keyframes;
                        let _ = updated_bundle.save_config();
                    }
                }
            }

            log::info!(
                "Saved .mcam project bundle to {:?} (captured {} frames, {:.1}ms)",
                project_dir,
                captured_frames,
                duration_ms
            );

            let path_str = project_dir.to_string_lossy().to_string();
            *state.last_project_path.lock() = Some(project_dir);

            Ok(path_str)
        })
        .await
        .map_err(|error| error.to_string())?
    }

    #[tauri::command]
    pub fn get_session_state(state: State<'_, Arc<AppState>>) -> SessionStatus {
        let session_lock = state.active_session.lock();
        if let Some(session) = session_lock.as_ref() {
            SessionStatus {
                is_recording: true,
                duration_ms: session.start_instant.elapsed().as_secs_f64() * 1000.0,
                captured_frames: session.frame_count(),
                project_path: Some(session.project_dir.to_string_lossy().to_string()),
            }
        } else {
            let last = state.last_project_path.lock();
            SessionStatus {
                is_recording: false,
                duration_ms: 0.0,
                captured_frames: 0,
                project_path: last.as_ref().map(|p| p.to_string_lossy().to_string()),
            }
        }
    }

    #[tauri::command]
    pub fn load_project(bundle_path: String) -> Result<ProjectConfig, String> {
        let bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        Ok(bundle.config)
    }

    #[tauri::command]
    pub fn delete_recording(
        bundle_path: String,
        state: State<'_, Arc<AppState>>,
    ) -> Result<(), String> {
        let recordings_dir = dirs::video_dir()
            .or_else(dirs::home_dir)
            .ok_or_else(|| "Could not locate the recordings folder".to_string())?
            .join("MotionCam Recordings")
            .canonicalize()
            .map_err(|error| error.to_string())?;
        let bundle_path = PathBuf::from(bundle_path)
            .canonicalize()
            .map_err(|error| error.to_string())?;

        if bundle_path.parent() != Some(recordings_dir.as_path())
            || bundle_path
                .extension()
                .and_then(|extension| extension.to_str())
                != Some("mcam")
        {
            return Err("Only MotionCam recording bundles can be deleted here".into());
        }

        let bundle = McamProjectBundle::open(&bundle_path).map_err(|error| error.to_string())?;
        if !bundle.source_video_path().is_file() {
            return Err("This project does not contain a source recording".into());
        }

        if state
            .active_session
            .lock()
            .as_ref()
            .is_some_and(|session| session.project_dir == bundle_path)
        {
            return Err("Stop the active recording before deleting it".into());
        }

        std::fs::remove_dir_all(&bundle_path).map_err(|error| error.to_string())?;
        let mut last_project = state.last_project_path.lock();
        if last_project
            .as_ref()
            .is_some_and(|path| path == &bundle_path)
        {
            *last_project = None;
        }
        Ok(())
    }

    #[tauri::command]
    pub fn load_recording_media(
        app: tauri::AppHandle,
        bundle_path: String,
    ) -> Result<(String, Vec<capture::cursor::CursorEvent>), String> {
        use tauri::Manager;
        let bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        let source = bundle
            .source_video_path()
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let root = bundle.root_dir.canonicalize().map_err(|e| e.to_string())?;
        if source.parent() != Some(root.as_path()) {
            return Err("Source video must be inside the project bundle".into());
        }
        app.asset_protocol_scope()
            .allow_file(&source)
            .map_err(|e| e.to_string())?;
        let events = ClusterDetector::read_events_from_jsonl(bundle.cursor_log_path())
            .map_err(|e| e.to_string())?;
        Ok((source.to_string_lossy().into_owned(), events))
    }

    #[tauri::command]
    pub fn save_project(config: ProjectConfig, bundle_path: String) -> Result<(), String> {
        let _write_guard = PROJECT_CONFIG_WRITE_LOCK.lock();
        let mut bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        bundle.config = config;
        bundle.save_config().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn save_editor_settings(
        canvas_config: CanvasConfig,
        spring_config: SpringPhysicsConfig,
        bundle_path: String,
    ) -> Result<(), String> {
        let _write_guard = PROJECT_CONFIG_WRITE_LOCK.lock();
        let mut bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        bundle.config.canvas = canvas_config;
        bundle.config.camera.spring = spring_config;
        bundle.save_config().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn generate_auto_framing(bundle_path: String) -> Result<Vec<CameraKeyframe>, String> {
        let _write_guard = PROJECT_CONFIG_WRITE_LOCK.lock();
        let bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        let cursor_path = bundle.cursor_log_path();
        let events = ClusterDetector::read_events_from_jsonl(&cursor_path)
            .map_err(|e| format!("Failed to read cursor stream: {}", e))?;

        let detector = ClusterDetector::default();
        let keyframes = detector.generate_camera_keyframes(&events);

        let mut updated = bundle;
        updated.config.camera.keyframes = keyframes.clone();
        updated.save_config().map_err(|e| e.to_string())?;

        Ok(keyframes)
    }

    #[tauri::command]
    pub fn add_keyframe(
        bundle_path: String,
        keyframe: CameraKeyframe,
    ) -> Result<Vec<CameraKeyframe>, String> {
        let _write_guard = PROJECT_CONFIG_WRITE_LOCK.lock();
        let mut bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        // Remove any keyframe within 50ms of the target time
        bundle
            .config
            .camera
            .keyframes
            .retain(|k| (k.t - keyframe.t).abs() > 50.0);

        bundle.config.camera.keyframes.push(keyframe);
        bundle
            .config
            .camera
            .keyframes
            .sort_by(|a, b| a.t.partial_cmp(&b.t).unwrap_or(std::cmp::Ordering::Equal));

        bundle.save_config().map_err(|e| e.to_string())?;
        Ok(bundle.config.camera.keyframes)
    }

    #[tauri::command]
    pub fn delete_keyframe(
        bundle_path: String,
        time_ms: f64,
    ) -> Result<Vec<CameraKeyframe>, String> {
        let _write_guard = PROJECT_CONFIG_WRITE_LOCK.lock();
        let mut bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        bundle
            .config
            .camera
            .keyframes
            .retain(|k| (k.t - time_ms).abs() > 100.0);

        bundle.save_config().map_err(|e| e.to_string())?;
        Ok(bundle.config.camera.keyframes)
    }

    #[tauri::command]
    pub fn update_keyframe(
        bundle_path: String,
        previous_time_ms: f64,
        keyframe: CameraKeyframe,
    ) -> Result<Vec<CameraKeyframe>, String> {
        if !previous_time_ms.is_finite() || !keyframe.t.is_finite() {
            return Err("Zoom keyframe time must be finite".into());
        }
        let _write_guard = PROJECT_CONFIG_WRITE_LOCK.lock();
        let mut bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        let frames = &mut bundle.config.camera.keyframes;
        let Some(index) = frames
            .iter()
            .position(|frame| (frame.t - previous_time_ms).abs() < 1.0)
        else {
            return Err("Zoom keyframe no longer exists".into());
        };
        frames[index] = keyframe;
        frames.sort_by(|a, b| a.t.total_cmp(&b.t));
        bundle.save_config().map_err(|e| e.to_string())?;
        Ok(bundle.config.camera.keyframes)
    }

    #[tauri::command]
    pub fn evaluate_camera_frame(
        bundle_path: String,
        time_ms: f64,
    ) -> Result<(f64, f64, f64), String> {
        let bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        let config = &bundle.config.camera.spring;
        let coords = evaluate_camera_at_time(&bundle.config.camera.keyframes, config, time_ms);
        Ok(coords)
    }

    #[tauri::command]
    pub fn set_project_trims(
        bundle_path: String,
        trim_in_ms: f64,
        trim_out_ms: f64,
    ) -> Result<(), String> {
        let _write_guard = PROJECT_CONFIG_WRITE_LOCK.lock();
        let mut bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        bundle.config.meta.trim_in_ms = Some(trim_in_ms);
        bundle.config.meta.trim_out_ms = Some(trim_out_ms);
        bundle.save_config().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn detect_idle_speed_ramps(
        bundle_path: String,
        min_idle_duration_ms: Option<f64>,
        speed_multiplier: Option<f64>,
    ) -> Result<Vec<project::SpeedRampSegment>, String> {
        let _write_guard = PROJECT_CONFIG_WRITE_LOCK.lock();
        let bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        let cursor_path = bundle.cursor_log_path();
        let events = ClusterDetector::read_events_from_jsonl(&cursor_path)
            .map_err(|e| format!("Failed to read cursor events: {}", e))?;

        let detector = ClusterDetector::default();
        let ramps = detector.detect_idle_speed_ramps(
            &events,
            min_idle_duration_ms.unwrap_or(2000.0),
            speed_multiplier.unwrap_or(2.5),
        );

        let mut updated = bundle;
        updated.config.meta.speed_ramps = Some(ramps.clone());
        updated.save_config().map_err(|e| e.to_string())?;

        Ok(ramps)
    }

    #[tauri::command]
    pub fn apply_speed_ramps(
        bundle_path: String,
        ramps: Vec<project::SpeedRampSegment>,
    ) -> Result<(), String> {
        let _write_guard = PROJECT_CONFIG_WRITE_LOCK.lock();
        let mut bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        bundle.config.meta.speed_ramps = Some(ramps);
        bundle.save_config().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub fn start_export(
        state: State<'_, Arc<AppState>>,
        bundle_path: String,
        options: export::ExportOptions,
    ) -> Result<String, String> {
        export::HardwareExportPipeline::start_export(&bundle_path, options, &state.export_session)
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_export_progress(state: State<'_, Arc<AppState>>) -> export::ExportProgress {
        state.export_session.get_progress()
    }

    #[tauri::command]
    pub fn cancel_export(state: State<'_, Arc<AppState>>) {
        state.export_session.cancel();
    }

    #[tauri::command]
    pub fn generate_subtitles(bundle_path: String) -> Result<Vec<engine::SubtitleCue>, String> {
        let bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        let transcript_file = bundle.transcript_path();
        if !transcript_file.exists() {
            return Err("No transcript is saved for this project yet. Speech-to-text is not available in this build.".into());
        }
        engine::SubtitleEngine::read_transcript(&transcript_file).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn save_subtitles(
        bundle_path: String,
        cues: Vec<engine::SubtitleCue>,
    ) -> Result<(), String> {
        let bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        engine::SubtitleEngine::save_transcript(bundle.transcript_path(), &cues)
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn export_subtitles_srt(bundle_path: String) -> Result<String, String> {
        let bundle = McamProjectBundle::open(&bundle_path).map_err(|e| e.to_string())?;
        if !bundle.transcript_path().exists() {
            return Err(
                "No saved subtitle cues to export. Speech-to-text is not available in this build."
                    .into(),
            );
        }
        let cues = engine::SubtitleEngine::read_transcript(bundle.transcript_path())
            .map_err(|e| e.to_string())?;
        Ok(engine::SubtitleEngine::export_srt(&cues))
    }
}

pub fn run() {
    let app_state = Arc::new(AppState::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::list_displays,
            commands::get_permission_status,
            commands::request_screen_capture_permission,
            commands::request_microphone_permission,
            commands::open_privacy_settings,
            commands::list_audio_devices,
            commands::list_webcams,
            commands::start_recording,
            commands::stop_recording,
            commands::get_session_state,
            commands::load_project,
            commands::delete_recording,
            commands::load_recording_media,
            commands::save_project,
            commands::save_editor_settings,
            commands::generate_auto_framing,
            commands::add_keyframe,
            commands::delete_keyframe,
            commands::update_keyframe,
            commands::evaluate_camera_frame,
            commands::set_project_trims,
            commands::detect_idle_speed_ramps,
            commands::apply_speed_ramps,
            commands::start_export,
            commands::get_export_progress,
            commands::cancel_export,
            commands::generate_subtitles,
            commands::save_subtitles,
            commands::export_subtitles_srt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MotionCam application");
}
