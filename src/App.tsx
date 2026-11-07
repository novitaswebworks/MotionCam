import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
  CanvasConfig,
  CameraKeyframe,
  CursorEvent,
  DisplayInfo,
  RecordingSessionState,
  SpeedRampSegment,
  SpringConfig,
  AudioDevice,
  WebcamDeviceInfo,
  SubtitleCue,
  ProjectConfig,
  PermissionState,
  PermissionStatus,
} from "./lib/types";
import { DEFAULT_SPRING_CONFIG } from "./lib/spring";
import { useSpringPlayback } from "./hooks/useSpringPlayback";
import { useTimeline } from "./hooks/useTimeline";
import { PreviewCanvas } from "./components/canvas/PreviewCanvas";
import { StylingPanel } from "./components/inspector/StylingPanel";
import { Timeline } from "./components/timeline/Timeline";
import { Controls } from "./components/Controls";
import { ExportModal } from "./components/export/ExportModal";
import { CaptureHome } from "./components/CaptureHome";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { useAppTheme } from "./lib/appTheme";
import { osName, settingsAppName } from "./lib/platform";
import { readRecordingPreset, RecordingPreset, saveRecordingPreset } from "./lib/recordingPreset";

const INITIAL_CANVAS_CONFIG: CanvasConfig = {
  aspect_ratio: "16:9",
  background: {
    type: "mesh_gradient",
    colors: ["#064e3b", "#059669", "#a7f3d0"],
    blur: 40,
    noise: true,
  },
  window: {
    border_radius: 16,
    shadow_radius: 48,
    shadow_opacity: 0.35,
    show_chrome: true,
    chrome_style: "macos",
    title: "Display Capture · 4K 60fps Source",
    window_padding: 10,
  },
  cursor: {
    style: "macos_black",
    scale: 1.4,
    click_ripple: true,
    smooth_trail: true,
  },
  keystroke: {
    enabled: true,
    style: "dark_glass",
    position: "bottom_center",
    duration_ms: 1500,
    only_shortcuts: true,
  },
  audio: {
    system_audio: true,
    microphone: true,
    system_volume: 1.0,
    mic_volume: 1.0,
  },
  webcam: {
    enabled: false,
    shape: "circle",
    position: "bottom_right",
    size: 180,
    border_width: 2,
    border_color: "#10b981",
    shadow: true,
    mirror: true,
    auto_dodge: true,
  },
  subtitles: {
    enabled: true,
    style: "word_highlight",
    position: "bottom_center",
    font_size: 22,
    active_color: "#10b981",
    text_color: "#ffffff",
    bg_opacity: 0.6,
  },
};

export default function App() {
  const { theme, setTheme } = useAppTheme();
  const [recordingPreset, setRecordingPreset] = useState<RecordingPreset>(readRecordingPreset);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => !recordingPreset.onboardingComplete);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null);
  const [displayPermissionMessage, setDisplayPermissionMessage] = useState<string | null>(null);
  const [isRefreshingPermissions, setIsRefreshingPermissions] = useState(false);
  const [isRequestingMicrophone, setIsRequestingMicrophone] = useState(false);
  const [isRequestingScreenAccess, setIsRequestingScreenAccess] = useState(false);
  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig>(() => ({
    ...INITIAL_CANVAS_CONFIG,
    audio: {
      ...INITIAL_CANVAS_CONFIG.audio,
      system_audio: recordingPreset.systemAudioEnabled,
      microphone: recordingPreset.microphoneEnabled,
      mic_device_id: recordingPreset.microphoneDeviceId ?? undefined,
    },
  }));
  const [springConfig, setSpringConfig] = useState<SpringConfig>(DEFAULT_SPRING_CONFIG);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const selectedDisplayId = recordingPreset.displayId;
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const selectedMicId = recordingPreset.microphoneDeviceId;
  const [webcams, setWebcams] = useState<WebcamDeviceInfo[]>([]);
  const [selectedWebcamId, setSelectedWebcamId] = useState<string | null>(null);
  const [keyframes, setKeyframes] = useState<CameraKeyframe[]>([]);
  const keyframeSaveRef = useRef<{ timer: ReturnType<typeof setTimeout>; previousTimeMs: number; keyframe: CameraKeyframe } | null>(null);
  const keyframeWriteQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const projectConfigWriteQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const canvasSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loadedProjectPath, setLoadedProjectPath] = useState<string | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);

  // Trimming & Speed Ramping State
  const [durationMs, setDurationMs] = useState(0);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [selectedZoomTime, setSelectedZoomTime] = useState<number | null>(null);
  const [cursorEvents, setCursorEvents] = useState<CursorEvent[]>([]);
  const [trimInMs, setTrimInMs] = useState<number>(0);
  const [trimOutMs, setTrimOutMs] = useState<number>(0);
  const [speedRamps, setSpeedRamps] = useState<SpeedRampSegment[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingRecording, setIsDeletingRecording] = useState(false);
  const [deleteRecordingError, setDeleteRecordingError] = useState<string | null>(null);

  const [session, setSession] = useState<RecordingSessionState>({
    isRecording: false,
    isPaused: false,
    durationMs: 0,
    capturedFrames: 0,
    capturedEvents: 0,
  });
  const selectedDisplay = displays.find((display) => display.id === selectedDisplayId) ?? null;
  const selectedMicrophoneName = selectedMicId
    ? audioDevices.find((device) => device.id === selectedMicId)?.name ?? "Selected microphone"
    : "System default microphone";

  useEffect(() => {
    const bundlePath = session.outputPath;
    if (!bundlePath || loadedProjectPath !== bundlePath || session.isRecording || isDeletingRecording) return;

    if (canvasSaveTimeoutRef.current) clearTimeout(canvasSaveTimeoutRef.current);
    canvasSaveTimeoutRef.current = setTimeout(() => {
      canvasSaveTimeoutRef.current = null;
      projectConfigWriteQueueRef.current = projectConfigWriteQueueRef.current
        .catch(() => undefined)
        .then(() => invoke("save_editor_settings", { bundlePath, canvasConfig, springConfig }))
        .catch((error) => {
          setRecordingError(`Could not save project styling: ${String(error)}`);
        });
    }, 400);

    return () => {
      if (canvasSaveTimeoutRef.current) {
        clearTimeout(canvasSaveTimeoutRef.current);
        canvasSaveTimeoutRef.current = null;
      }
    };
  }, [canvasConfig, springConfig, isDeletingRecording, loadedProjectPath, session.isRecording, session.outputPath]);

  const refreshPermissionStatus = useCallback(async () => {
    setIsRefreshingPermissions(true);
    try {
      const status = await invoke<PermissionStatus>("get_permission_status");
      setPermissionStatus(status);
      setDisplayPermissionMessage(null);

      if (status.screen_capture !== "granted") {
        setDisplays([]);
        return;
      }

      try {
        const list = await invoke<DisplayInfo[]>("list_displays");
        setDisplays(list);
        if (list.length > 0) {
          const primary = list.find((display) => display.is_primary) || list[0];
          setRecordingPreset((previous) => ({
            ...previous,
            displayId: list.some((display) => display.id === previous.displayId) ? previous.displayId : primary.id,
          }));
        } else {
          setDisplayPermissionMessage(`${osName} reports screen access as granted, but MotionCam cannot see a display yet. Quit and reopen MotionCam, then refresh this status.`);
        }
      } catch (error) {
        setDisplays([]);
        setDisplayPermissionMessage(`${osName} reports screen access as granted, but MotionCam could not list displays. Quit and reopen MotionCam, then refresh. ${String(error)}`);
      }
    } catch (error) {
      setPermissionStatus({ screen_capture: "unknown", microphone: "unknown" });
      setDisplayPermissionMessage(`Could not read ${osName} permission status: ${String(error)}`);
    } finally {
      setIsRefreshingPermissions(false);
    }
  }, []);

  useEffect(() => {
    saveRecordingPreset(recordingPreset);
  }, [recordingPreset]);

  useEffect(() => {
    if (!isOnboardingOpen) return;
    const refreshWhenReturningFromSettings = () => {
      void refreshPermissionStatus();
    };
    window.addEventListener("focus", refreshWhenReturningFromSettings);
    return () => window.removeEventListener("focus", refreshWhenReturningFromSettings);
  }, [isOnboardingOpen, refreshPermissionStatus]);

  useEffect(() => {
    setCanvasConfig((previous) => {
      if (previous.audio.microphone === recordingPreset.microphoneEnabled && previous.audio.system_audio === recordingPreset.systemAudioEnabled && previous.audio.mic_device_id === (recordingPreset.microphoneDeviceId ?? undefined)) return previous;
      return {
        ...previous,
        audio: {
          ...previous.audio,
          microphone: recordingPreset.microphoneEnabled,
          mic_device_id: recordingPreset.microphoneDeviceId ?? undefined,
          system_audio: recordingPreset.systemAudioEnabled,
        },
      };
    });
  }, [recordingPreset.microphoneEnabled, recordingPreset.microphoneDeviceId, recordingPreset.systemAudioEnabled]);

  const {
    currentTimeMs,
    isPlaying,
    seek,
    togglePlay,
    setCurrentTimeMs,
    setIsPlaying,
    getSpeedMultiplierAtTime,
  } = useTimeline({
    durationMs,
    trimInMs,
    trimOutMs,
    speedRamps,
  });

  // Dynamic camera spring state evaluated deterministically along timeline
  const { camera: cameraState, setTarget: setCameraTarget } = useSpringPlayback(springConfig);

  // Follow the most recent zoom target; the playback spring eases each change over time.
  useEffect(() => {
    const active = keyframes.reduce<CameraKeyframe | null>((latest, keyframe) =>
      keyframe.t <= currentTimeMs && (!latest || keyframe.t > latest.t) ? keyframe : latest, null);
    setCameraTarget(active?.x ?? 0.5, active?.y ?? 0.5, active?.zoom ?? 1.0);
  }, [keyframes, currentTimeMs, setCameraTarget]);

  // Fetch permission status and audio devices from Tauri backend
  useEffect(() => {
    async function loadAudioDevices() {
      try {
        const list = await invoke<AudioDevice[]>("list_audio_devices");
        setAudioDevices(list);
        setRecordingPreset((previous) => {
          const selected = list.find((device) => device.id === previous.microphoneDeviceId)
            ?? list.find((device) => device.is_default)
            ?? list[0];
          return selected && selected.id !== previous.microphoneDeviceId
            ? { ...previous, microphoneDeviceId: selected.id }
            : previous;
        });
      } catch {
        setAudioDevices([]);
        setRecordingPreset((previous) => ({ ...previous, microphoneDeviceId: null }));
      }
    }

    async function loadWebcams() {
      try {
        const list = await invoke<WebcamDeviceInfo[]>("list_webcams");
        setWebcams(list);
        const def = list.find((w) => w.is_default) || list[0];
        if (def) setSelectedWebcamId(def.id);
      } catch {
        setWebcams([]);
        setSelectedWebcamId(null);
      }
    }

    void refreshPermissionStatus();
    loadAudioDevices();
    loadWebcams();
  }, [refreshPermissionStatus]);

  useEffect(() => {
    if (!session.isRecording) return;
    let disposed = false;
    const timer = window.setInterval(() => {
      void invoke<{ is_recording: boolean; duration_ms: number; captured_frames: number }>("get_session_state")
        .then(status => { if (!disposed) setSession(previous => ({ ...previous,
          isRecording: status.is_recording, durationMs: status.duration_ms, capturedFrames: status.captured_frames })); })
        .catch(error => { if (!disposed) setRecordingError(String(error)); });
    }, 500);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [session.isRecording]);


  const sampleKeystrokes = useMemo(() => cursorEvents.filter(e => e.type === "key"), [cursorEvents]);

  const activeShortcut = useMemo(() => {
    if (!canvasConfig.keystroke.enabled) return null;
    const evt = sampleKeystrokes.find(
      (k) =>
        currentTimeMs >= k.t &&
        currentTimeMs <= k.t + canvasConfig.keystroke.duration_ms
    );
    return evt?.shortcut ?? null;
  }, [canvasConfig.keystroke, currentTimeMs, sampleKeystrokes]);

  const handleStartRecording = useCallback(async () => {
    setRecordingError(null);
    try {
      const permissions = await invoke<PermissionStatus>("get_permission_status");
      setPermissionStatus(permissions);
      if (permissions.screen_capture === "unsupported") {
        setRecordingError("Screen recording is not available on this system. MotionCam needs macOS 15 or newer, or Windows 10 version 2004 or newer.");
        return;
      }
      if (permissions.screen_capture !== "granted") {
        setIsOnboardingOpen(true);
        setRecordingError(`Screen recording permission is not enabled. Open setup, grant access in ${settingsAppName}, then refresh the permission status.`);
        return;
      }
      if (recordingPreset.microphoneEnabled && permissions.microphone !== "granted") {
        setIsOnboardingOpen(true);
        setRecordingError("Microphone access is not granted. Enable it in setup or turn off microphone recording in your preset.");
        return;
      }
      await invoke("start_recording", {
        displayId: selectedDisplayId,
        captureAudio: recordingPreset.systemAudioEnabled,
        captureMicrophone: recordingPreset.microphoneEnabled,
        micDeviceId: recordingPreset.microphoneEnabled && selectedMicId ? selectedMicId : null,
        captureQuality: recordingPreset.quality,
      });
      setSession((prev) => ({ ...prev, isRecording: true }));
    } catch (error) {
      setRecordingError(String(error));
    }
  }, [selectedDisplayId, selectedMicId, recordingPreset.microphoneEnabled, recordingPreset.quality, recordingPreset.systemAudioEnabled]);

  const handleStopRecording = useCallback(async () => {
    try {
      const resultPath = await invoke<string>("stop_recording");
      setLoadedProjectPath(null);
      setSession((prev) => ({ ...prev, isRecording: false, outputPath: resultPath }));

      // Generate frames from this recording's real cursor stream.
      try {
        const autoKeyframes = await invoke<CameraKeyframe[]>("generate_auto_framing", {
          bundlePath: resultPath,
        });
        setKeyframes(autoKeyframes);
        setRecordingError(null);
      } catch (e) {
        setKeyframes([]);
        setRecordingError(`Recording saved, but auto framing could not be generated: ${String(e)}`);
      }

      const config = await invoke<ProjectConfig>("load_project", { bundlePath: resultPath });
      const [source, events] = await invoke<[string, CursorEvent[]]>("load_recording_media", { bundlePath: resultPath });
      setCanvasConfig({
        ...config.canvas,
        audio: {
          ...config.canvas.audio,
          system_audio: recordingPreset.systemAudioEnabled,
          microphone: recordingPreset.microphoneEnabled,
          mic_device_id: recordingPreset.microphoneDeviceId ?? undefined,
        },
      });
      setSpringConfig(config.camera.spring);
      setLoadedProjectPath(resultPath);
      setIsPlaying(false);
      setDurationMs(config.meta.duration_ms);
      const loadedTrimIn = Math.max(0, Math.min(config.meta.trim_in_ms ?? 0, config.meta.duration_ms));
      const loadedTrimOut = Math.max(loadedTrimIn, Math.min(config.meta.trim_out_ms ?? config.meta.duration_ms, config.meta.duration_ms));
      setTrimInMs(loadedTrimIn);
      setTrimOutMs(loadedTrimOut);
      setCurrentTimeMs(loadedTrimIn);
      setSpeedRamps(config.meta.speed_ramps ?? []);
      setSubtitleCues([]);
      setCursorEvents(events);
      setSourceUrl(convertFileSrc(source));
    } catch (error) {
      setRecordingError(String(error));
      setSession((prev) => ({ ...prev, isRecording: false }));
    }
  }, [recordingPreset, setIsPlaying, setCurrentTimeMs]);

  const handleDeleteRecording = useCallback(async () => {
    const bundlePath = session.outputPath;
    if (!bundlePath || isDeletingRecording) return;

    setDeleteRecordingError(null);
    setIsDeletingRecording(true);
    if (keyframeSaveRef.current) {
      clearTimeout(keyframeSaveRef.current.timer);
      keyframeSaveRef.current = null;
    }
    await keyframeWriteQueueRef.current.catch(() => undefined);
    if (canvasSaveTimeoutRef.current) {
      clearTimeout(canvasSaveTimeoutRef.current);
      canvasSaveTimeoutRef.current = null;
    }
    await projectConfigWriteQueueRef.current.catch(() => undefined);

    const previousSourceUrl = sourceUrl;
    setIsPlaying(false);
    setSourceUrl(null);
    // Unmount the video element before removing its source bundle (needed on platforms that lock open files).
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    try {
      await invoke("delete_recording", { bundlePath });
      setLoadedProjectPath(null);
      setSession({ isRecording: false, isPaused: false, durationMs: 0, capturedFrames: 0, capturedEvents: 0 });
      setKeyframes([]);
      setSelectedZoomTime(null);
      setCursorEvents([]);
      setSubtitleCues([]);
      setSpeedRamps([]);
      setDurationMs(0);
      setTrimInMs(0);
      setTrimOutMs(0);
      setCurrentTimeMs(0);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      setSourceUrl(previousSourceUrl);
      setDeleteRecordingError(String(error));
    } finally {
      setIsDeletingRecording(false);
    }
  }, [isDeletingRecording, session.outputPath, sourceUrl, setIsPlaying, setCurrentTimeMs]);

  const handleToggleSystemAudio = useCallback(() => {
    setRecordingPreset((previous) => ({ ...previous, systemAudioEnabled: !previous.systemAudioEnabled }));
  }, []);

  const handleToggleMicrophone = useCallback(() => {
    setRecordingPreset((previous) => ({ ...previous, microphoneEnabled: !previous.microphoneEnabled }));
  }, []);

  const handleSelectMicrophone = useCallback((id: string) => {
    setRecordingPreset((previous) => ({ ...previous, microphoneDeviceId: id || null }));
  }, []);

  const handleOpenPrivacySettings = useCallback(async (section: "screen" | "microphone") => {
    try {
      await invoke("open_privacy_settings", { section });
    } catch (error) {
      setRecordingError(String(error));
    }
  }, []);

  const handleRequestScreenPermission = useCallback(async () => {
    setIsRequestingScreenAccess(true);
    try {
      await invoke<PermissionState>("request_screen_capture_permission");
      await refreshPermissionStatus();
    } catch (error) {
      setRecordingError(String(error));
    } finally {
      setIsRequestingScreenAccess(false);
    }
  }, [refreshPermissionStatus]);

  const handleRequestMicrophonePermission = useCallback(async () => {
    setIsRequestingMicrophone(true);
    try {
      const status = await invoke<PermissionState>("request_microphone_permission");
      setPermissionStatus((previous) => previous ? { ...previous, microphone: status } : previous);
      await refreshPermissionStatus();
    } catch (error) {
      setRecordingError(String(error));
    } finally {
      setIsRequestingMicrophone(false);
    }
  }, [refreshPermissionStatus]);

  const handleFinishOnboarding = useCallback(() => {
    setRecordingPreset((previous) => ({ ...previous, onboardingComplete: true }));
    setIsOnboardingOpen(false);
  }, []);

  const handleToggleWebcam = useCallback(() => {
    setCanvasConfig((prev) => ({
      ...prev,
      webcam: {
        ...prev.webcam,
        enabled: !prev.webcam.enabled,
      },
    }));
  }, []);

  const handleSelectWebcam = useCallback((id: string) => {
    setSelectedWebcamId(id);
    setCanvasConfig((prev) => ({
      ...prev,
      webcam: {
        ...prev.webcam,
        device_id: id,
      },
    }));
  }, []);

  const handleAutoFrame = useCallback(async () => {
    if (session.outputPath) {
      try {
        const result = await invoke<CameraKeyframe[]>("generate_auto_framing", {
          bundlePath: session.outputPath,
        });
        setKeyframes(result);
        setRecordingError(null);
        return;
      } catch (err) {
        setRecordingError(`Could not generate auto framing: ${String(err)}`);
        return;
      }
    }
    setRecordingError("Record or open a project before generating auto framing.");
  }, [session.outputPath]);

  const handleAddKeyframe = useCallback(
    async (timeMs: number, zoom = 2.0) => {
      const click = cursorEvents.filter(e => e.type === "down").reduce<CursorEvent | null>((best, event) =>
        !best || Math.abs(event.t - timeMs) < Math.abs(best.t - timeMs) ? event : best, null);
      const targetX = click && Math.abs(click.t - timeMs) < 1500 ? click.x : 0.5;
      const targetY = click && Math.abs(click.t - timeMs) < 1500 ? click.y : 0.5;

      const newKeyframe: CameraKeyframe = {
        t: Math.round(timeMs),
        x: targetX,
        y: targetY,
        zoom,
        mode: "manual",
        duration_ms: 1500,
      };
      setSelectedZoomTime(newKeyframe.t);

      if (session.outputPath) {
        try {
          const updated = await invoke<CameraKeyframe[]>("add_keyframe", {
            bundlePath: session.outputPath,
            keyframe: newKeyframe,
          });
          setKeyframes(updated);
          return;
        } catch (err) {
          console.warn("add_keyframe failed:", err);
        }
      }

      setKeyframes((prev) => {
        const filtered = prev.filter((k) => Math.abs(k.t - timeMs) > 100);
        return [...filtered, newKeyframe].sort((a, b) => a.t - b.t);
      });
    },
    [session.outputPath, cursorEvents]
  );

  const handleUpdateKeyframe = useCallback(
    (timeMs: number, updates: Partial<CameraKeyframe>) => {
      const target = keyframes.find((k) => k.t === timeMs) ?? keyframes.find((k) => k.t === selectedZoomTime);
      if (!target) return;
      const originalTime = keyframeSaveRef.current?.previousTimeMs ?? target.t;
      const changed = { ...target, ...updates };
      setKeyframes(keyframes.map((k) => k === target ? changed : k).sort((a, b) => a.t - b.t));
      if (selectedZoomTime === target.t && changed.t !== target.t) setSelectedZoomTime(changed.t);
      // Persist the settled edit, avoiding a project write for every pointer pixel while dragging.
      if (!session.outputPath) return;
      if (keyframeSaveRef.current) clearTimeout(keyframeSaveRef.current.timer);
      const keyframe = changed;
      const previousTimeMs = originalTime;
      const timer = setTimeout(async () => {
        keyframeSaveRef.current = null;
        keyframeWriteQueueRef.current = keyframeWriteQueueRef.current
          .catch(() => undefined)
          .then(() => invoke<CameraKeyframe[]>("update_keyframe", {
            bundlePath: session.outputPath,
            previousTimeMs,
            keyframe,
          }))
          .catch((err) => console.warn("update_keyframe failed:", err));
      }, 180);
      keyframeSaveRef.current = { timer, previousTimeMs, keyframe };
    },
    [keyframes, selectedZoomTime, session.outputPath]
  );

  const handleDeleteKeyframe = useCallback(
    async (timeMs: number) => {
      if (session.outputPath) {
        try {
          const updated = await invoke<CameraKeyframe[]>("delete_keyframe", {
            bundlePath: session.outputPath,
            timeMs,
          });
          setKeyframes(updated);
          return;
        } catch (err) {
          console.warn("delete_keyframe failed:", err);
        }
      }

      setKeyframes((prev) => prev.filter((k) => Math.abs(k.t - timeMs) > 100));
    },
    [session.outputPath]
  );

  const handleTrimChange = useCallback(
    async (inMs: number, outMs: number) => {
      setTrimInMs(inMs);
      setTrimOutMs(outMs);
      if (session.outputPath) {
        try {
          await invoke("set_project_trims", {
            bundlePath: session.outputPath,
            trimInMs: inMs,
            trimOutMs: outMs,
          });
        } catch (e) {
          console.warn("set_project_trims invoke error:", e);
        }
      }
    },
    [session.outputPath]
  );

  const handleToggleSpeedRamp = useCallback(async () => {
    if (speedRamps.length > 0) {
      setSpeedRamps([]);
      if (session.outputPath) {
        void invoke("apply_speed_ramps", {
          bundlePath: session.outputPath,
          ramps: [],
        });
      }
      return;
    }

    if (session.outputPath) {
      try {
        const detected = await invoke<SpeedRampSegment[]>("detect_idle_speed_ramps", {
          bundlePath: session.outputPath,
          minIdleDurationMs: 2000,
          speedMultiplier: 2.5,
        });
        setSpeedRamps(detected);
        return;
      } catch (err) {
        setSpeedRamps([]);
        setRecordingError(`Could not detect speed ramps: ${String(err)}`);
        return;
      }
    }
    setRecordingError("Record or open a project before detecting speed ramps.");
  }, [speedRamps.length, session.outputPath]);

  const handleExportSrt = useCallback(async () => {
    if (session.outputPath) {
      try {
        const srtContent = await invoke<string>("export_subtitles_srt", {
          bundlePath: session.outputPath,
        });
        const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "subtitles.srt";
        a.click();
        URL.revokeObjectURL(url);
        return;
      } catch (e) {
        setRecordingError(`Could not export subtitles: ${String(e)}`);
        return;
      }
    }

    if (subtitleCues.length === 0) {
      setRecordingError("There are no saved subtitle cues to export yet.");
      return;
    }

    // Client-side fallback export
    let srtText = "";
    subtitleCues.forEach((cue, index) => {
      const formatTime = (ms: number) => {
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const mill = Math.floor(ms % 1000);
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(mill).padStart(3, "0")}`;
      };
      srtText += `${index + 1}\n${formatTime(cue.start_ms)} --> ${formatTime(cue.end_ms)}\n${cue.text}\n\n`;
    });
    const blob = new Blob([srtText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subtitles.srt";
    a.click();
    URL.revokeObjectURL(url);
  }, [session.outputPath, subtitleCues]);



  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans select-none">
      {recordingError && <div role="alert" className="bg-rose-950 p-3 text-rose-200">{recordingError}</div>}
      <Controls
        session={session}
        displays={displays}
        selectedDisplayId={selectedDisplayId}
        onSelectDisplay={(id) => setRecordingPreset((previous) => ({ ...previous, displayId: id }))}
        audioDevices={audioDevices}
        selectedMicId={selectedMicId}
        onSelectMic={handleSelectMicrophone}
        systemAudioEnabled={recordingPreset.systemAudioEnabled}
        onToggleSystemAudio={handleToggleSystemAudio}
        microphoneEnabled={recordingPreset.microphoneEnabled}
        onToggleMicrophone={handleToggleMicrophone}
        quality={recordingPreset.quality}
        onQualityChange={(quality) => setRecordingPreset((previous) => ({ ...previous, quality }))}
        onOpenSetup={() => setIsOnboardingOpen(true)}
        setupMode={isOnboardingOpen}
        webcams={webcams}
        selectedWebcamId={selectedWebcamId}
        onSelectWebcam={handleSelectWebcam}
        webcamEnabled={canvasConfig.webcam.enabled}
        onToggleWebcam={handleToggleWebcam}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onOpenExport={() => setIsExportModalOpen(true)}
        onRequestDelete={() => { setDeleteRecordingError(null); setIsDeleteDialogOpen(true); }}
        editorMode={Boolean(sourceUrl)}
        showCaptureAction={false}
        theme={theme}
        onThemeChange={setTheme}
      />

      {isOnboardingOpen ? (
        <OnboardingWizard
          theme={theme}
          onThemeChange={setTheme}
          displays={displays}
          selectedDisplayId={selectedDisplayId}
          onSelectDisplay={(id) => setRecordingPreset((previous) => ({ ...previous, displayId: id }))}
          audioDevices={audioDevices}
          selectedMicId={selectedMicId}
          onSelectMic={handleSelectMicrophone}
          microphoneEnabled={recordingPreset.microphoneEnabled}
          onToggleMicrophone={handleToggleMicrophone}
          systemAudioEnabled={recordingPreset.systemAudioEnabled}
          onToggleSystemAudio={handleToggleSystemAudio}
          quality={recordingPreset.quality}
          onQualityChange={(quality) => setRecordingPreset((previous) => ({ ...previous, quality }))}
          onOpenPrivacySettings={handleOpenPrivacySettings}
          permissionStatus={permissionStatus}
          displayPermissionMessage={displayPermissionMessage}
          isRefreshingPermissions={isRefreshingPermissions}
          isRequestingMicrophone={isRequestingMicrophone}
          isRequestingScreenAccess={isRequestingScreenAccess}
          onRefreshPermissions={refreshPermissionStatus}
          onRequestScreenPermission={handleRequestScreenPermission}
          onRequestMicrophonePermission={handleRequestMicrophonePermission}
          onFinish={handleFinishOnboarding}
        />
      ) : sourceUrl ? <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden" >
          <PreviewCanvas
            canvasConfig={canvasConfig}
            camera={cameraState}
            cursor={cursorEvents.findLast(e => e.t <= currentTimeMs) ?? null}
            activeShortcut={activeShortcut}
            subtitles={subtitleCues}
            currentTimeMs={currentTimeMs}
            media={sourceUrl ? { source: sourceUrl, timeMs: currentTimeMs, playing: isPlaying,
              trimIn: trimInMs, trimOut: trimOutMs, speed: getSpeedMultiplierAtTime(currentTimeMs),
              focus: keyframes.find(k => k.t === selectedZoomTime) ? {x:keyframes.find(k => k.t === selectedZoomTime)!.x,y:keyframes.find(k => k.t === selectedZoomTime)!.y} : undefined,
              onFocusChange: (x,y) => { if (selectedZoomTime !== null) handleUpdateKeyframe(selectedZoomTime,{x,y,mode:"manual"}); },
              onTime: setCurrentTimeMs, onDuration: duration => { setDurationMs(duration); setTrimOutMs(duration); },
              onError: message => { setRecordingError(message); setIsPlaying(false); }
            } : undefined}
          />
          <Timeline
            currentTimeMs={currentTimeMs}
            durationMs={durationMs}
            isPlaying={isPlaying}
            keyframes={keyframes}
            trimInMs={trimInMs}
            trimOutMs={trimOutMs}
            speedRamps={speedRamps}
            subtitles={subtitleCues}
            onSeek={time => { setIsPlaying(false); seek(time); }}
            onTogglePlay={togglePlay}
            onAddKeyframe={handleAddKeyframe}
            onUpdateKeyframe={handleUpdateKeyframe}
            onDeleteKeyframe={handleDeleteKeyframe}
            selectedZoomTime={selectedZoomTime}
            onSelectZoom={kf => { setIsPlaying(false); setSelectedZoomTime(kf.t); seek(kf.t); }}
            onZoomModeChange={mode => {
              if (selectedZoomTime === null) return;
              const frame = keyframes.find(k => k.t === selectedZoomTime);
              if (!frame) return;
              const click = cursorEvents.filter(e => e.type === "down").reduce<CursorEvent | null>((best,event) => !best || Math.abs(event.t-frame.t)<Math.abs(best.t-frame.t)?event:best,null);
              handleUpdateKeyframe(selectedZoomTime, mode === "auto" && click ? {mode,x:click.x,y:click.y} : {mode});
            }}
            onZoomLevelChange={zoom => { if(selectedZoomTime!==null) handleUpdateKeyframe(selectedZoomTime,{zoom}); }}
            onChangeTrim={handleTrimChange}
            onToggleSpeedRamp={handleToggleSpeedRamp}
            onAutoFrame={handleAutoFrame}
          />
        </div>

        <StylingPanel
          canvasConfig={canvasConfig}
          springConfig={springConfig}
          onCanvasChange={setCanvasConfig}
          onSpringChange={setSpringConfig}
          onExportSrt={handleExportSrt}
        />
      </div> : (
        <CaptureHome
          isRecording={session.isRecording}
          durationMs={session.durationMs}
          capturedFrames={session.capturedFrames}
          display={selectedDisplay}
          microphoneName={selectedMicrophoneName}
          microphoneEnabled={recordingPreset.microphoneEnabled}
          systemAudioEnabled={recordingPreset.systemAudioEnabled}
          recordingQuality={recordingPreset.quality}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
        />
      )}

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        bundlePath={session.outputPath}
      />

      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="presentation">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-recording-title"
            className="w-full max-w-md border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
          >
            <h2 id="delete-recording-title" className="text-base font-semibold text-zinc-100">Delete this recording?</h2>
            <p className="mt-2 break-all text-xs text-zinc-400">{session.outputPath?.split(/[\\/]/).pop()}</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              This permanently removes the source video, cursor data, and project settings. This cannot be undone.
            </p>
            {deleteRecordingError && <p role="alert" className="mt-3 text-xs text-rose-300">{deleteRecordingError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                disabled={isDeletingRecording}
                onClick={() => setIsDeleteDialogOpen(false)}
                className="h-9 px-3 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={isDeletingRecording}
                onClick={handleDeleteRecording}
                className="h-9 bg-rose-600 px-3 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {isDeletingRecording ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
