import React from "react";
import {
  Circle,
  Square,
  FolderOpen,
  Download,
  Mic,
  Volume2,
  VolumeX,
  Camera,
  Trash2,
  Palette,
  Settings2,
} from "lucide-react";
import { AudioDevice, DisplayInfo, RecordingSessionState, WebcamDeviceInfo } from "../lib/types";
import { APP_THEMES, AppTheme } from "../lib/appTheme";
import { RECORDING_QUALITIES, RecordingQuality } from "../lib/recordingPreset";
import { MotionCamMark } from "./brand/MotionCamMark";

interface ControlsProps {
  session: RecordingSessionState;
  displays: DisplayInfo[];
  selectedDisplayId: number | null;
  onSelectDisplay: (id: number) => void;
  audioDevices?: AudioDevice[];
  selectedMicId?: string | null;
  onSelectMic?: (id: string) => void;
  systemAudioEnabled?: boolean;
  onToggleSystemAudio?: () => void;
  webcams?: WebcamDeviceInfo[];
  selectedWebcamId?: string | null;
  onSelectWebcam?: (id: string) => void;
  webcamEnabled?: boolean;
  onToggleWebcam?: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onOpenFolder?: () => void;
  onOpenExport?: () => void;
  onRequestDelete?: () => void;
  editorMode?: boolean;
  showCaptureAction?: boolean;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  microphoneEnabled: boolean;
  onToggleMicrophone: () => void;
  quality: RecordingQuality;
  onQualityChange: (quality: RecordingQuality) => void;
  onOpenSetup: () => void;
  setupMode?: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  session,
  displays,
  selectedDisplayId,
  onSelectDisplay,
  audioDevices = [],
  selectedMicId = null,
  onSelectMic,
  systemAudioEnabled = true,
  onToggleSystemAudio,
  webcams = [],
  selectedWebcamId = null,
  onSelectWebcam,
  webcamEnabled = false,
  onToggleWebcam,
  onStartRecording,
  onStopRecording,
  onOpenFolder,
  onOpenExport,
  onRequestDelete,
  editorMode = false,
  showCaptureAction = true,
  theme,
  onThemeChange,
  microphoneEnabled,
  onToggleMicrophone,
  quality,
  onQualityChange,
  onOpenSetup,
  setupMode = false,
}) => {
  return (
    <div className="h-14 border-b border-zinc-800 bg-zinc-900 px-5 flex items-center justify-between select-none">
      {/* Brand & Project Status */}
      <div className="flex items-center gap-3">
        <MotionCamMark size={32} className="shrink-0" />
        <div className="flex flex-col">
          <span className="font-semibold text-sm tracking-tight text-zinc-100">
            MotionCam
          </span>
          <span className="text-[11px] text-zinc-500">
            {session.isRecording
              ? "Recording in progress"
              : editorMode && !setupMode ? "Project editor" : setupMode ? "Recording setup" : "Capture setup"}
          </span>
        </div>
      </div>

      {/* Inputs: Display Source, Mic, System Audio & VU Meter */}
      <div className={`${editorMode || setupMode ? "hidden" : "flex"} items-center gap-3`}>
        {/* Display Source Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-400">Display:</span>
          <select
            disabled={session.isRecording}
            value={selectedDisplayId ?? ""}
            onChange={(e) => onSelectDisplay(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
          >
            {displays.map((disp) => (
              <option key={disp.id} value={disp.id}>
                {disp.name} ({disp.width}×{disp.height}
                {disp.is_primary ? " - Main" : ""})
              </option>
            ))}
            {displays.length === 0 && (
              <option value="">Primary Display (Default)</option>
            )}
          </select>
        </div>

        {/* Microphone Selector */}
        {onSelectMic && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleMicrophone}
              disabled={session.isRecording}
              aria-label={microphoneEnabled ? "Mute microphone" : "Enable microphone"}
              aria-pressed={microphoneEnabled}
              title={microphoneEnabled ? "Microphone: Active" : "Microphone: Muted"}
              className={`rounded-md border p-1.5 transition-colors disabled:opacity-50 ${microphoneEnabled ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300"}`}
            >
              <Mic size={13} />
            </button>
            <select
              disabled={session.isRecording}
              value={selectedMicId ?? ""}
              onChange={(e) => onSelectMic(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50 max-w-[130px] truncate"
            >
              <option value="">System Default Microphone</option>
              {audioDevices.map((mic) => (
                <option key={mic.id} value={mic.id}>
                  {mic.name} {mic.is_default ? "(Default)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Webcam Source & 1-Click Face Cam Toggle */}
        {onToggleWebcam && webcams.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggleWebcam}
              disabled={session.isRecording}
              className={`p-1.5 rounded-md border text-xs flex items-center gap-1 transition-colors ${
                webcamEnabled
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                  : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-400"
              }`}
              title={webcamEnabled ? "Face Cam: Enabled" : "Face Cam: Disabled"}
            >
              <Camera size={13} />
            </button>
            {webcamEnabled && onSelectWebcam && webcams.length > 0 && (
              <select
                disabled={session.isRecording}
                value={selectedWebcamId ?? ""}
                onChange={(e) => onSelectWebcam(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50 max-w-[125px] truncate"
              >
                {webcams.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* System Audio Loopback Toggle */}
        {onToggleSystemAudio && (
          <button
            onClick={onToggleSystemAudio}
            disabled={session.isRecording}
            className={`p-1.5 rounded-md border text-xs flex items-center gap-1 transition-colors ${
              systemAudioEnabled
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-400"
            }`}
            title={
              systemAudioEnabled
                ? "System Audio Loopback: Active"
                : "System Audio Loopback: Muted"
            }
          >
            {systemAudioEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
        )}

        {!editorMode && !setupMode && (
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span>Quality</span>
            <select
              aria-label="Recording quality"
              disabled={session.isRecording}
              value={quality}
              onChange={(event) => onQualityChange(event.target.value as RecordingQuality)}
              className="h-8 max-w-[150px] rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              {RECORDING_QUALITIES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        )}

      </div>

      {/* Recording & Export Actions */}
      <div className="flex items-center gap-3">
        {!setupMode && <button type="button" onClick={onOpenSetup} disabled={session.isRecording} className="inline-flex h-8 items-center gap-1.5 px-2 text-xs text-zinc-400 hover:text-zinc-100 disabled:opacity-50" title="Open recording setup">
          <Settings2 size={14} />
          <span className="hidden xl:inline">Setup</span>
        </button>}
        {!setupMode && <label className="flex items-center gap-1.5 text-zinc-400" title="Application theme">
          <Palette size={14} aria-hidden="true" />
          <span className="sr-only">Theme</span>
          <select
            aria-label="Application theme"
            value={theme}
            onChange={(event) => onThemeChange(event.target.value as AppTheme)}
            className="h-8 max-w-[112px] rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none transition-colors focus:border-emerald-500"
          >
            {APP_THEMES.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>}
        {onRequestDelete && editorMode && !setupMode && !session.isRecording && (
          <button
            onClick={onRequestDelete}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-rose-300 transition-colors"
            title="Delete this recording"
          >
            <Trash2 size={13} />
            <span>Delete</span>
          </button>
        )}
        {onOpenExport && editorMode && !setupMode && !session.isRecording && (
          <button
            onClick={onOpenExport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 text-xs font-medium transition-colors"
            title="Open Hardware Exporter"
          >
            <Download size={13} className="text-emerald-400" />
            <span>Export Video</span>
          </button>
        )}

        {showCaptureAction && session.isRecording ? (
          <button
            onClick={onStopRecording}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors shadow-lg shadow-rose-950/40"
          >
            <Square size={13} fill="currentColor" />
            <span>Stop Recording</span>
          </button>
        ) : showCaptureAction && !editorMode ? (
          <button
            onClick={onStartRecording}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-lg shadow-emerald-950/40"
          >
            <Circle size={13} fill="currentColor" />
            <span>Record Screen</span>
          </button>
        ) : null}

        {session.outputPath && onOpenFolder && (
          <button
            onClick={onOpenFolder}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            title="Open .mcam Project Folder"
          >
            <FolderOpen size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
