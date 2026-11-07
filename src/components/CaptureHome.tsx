import React from "react";
import { Circle, Mic, Monitor, Square, Video, Volume2 } from "lucide-react";
import { DisplayInfo } from "../lib/types";
import { RecordingQuality } from "../lib/recordingPreset";
import { RECORDING_QUALITIES } from "../lib/recordingPreset";

interface CaptureHomeProps {
  isRecording: boolean;
  durationMs: number;
  capturedFrames: number;
  display: DisplayInfo | null;
  microphoneName: string;
  microphoneEnabled: boolean;
  systemAudioEnabled: boolean;
  recordingQuality: RecordingQuality;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

function formatDuration(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export const CaptureHome: React.FC<CaptureHomeProps> = ({
  isRecording,
  durationMs,
  capturedFrames,
  display,
  microphoneName,
  microphoneEnabled,
  systemAudioEnabled,
  recordingQuality,
  onStartRecording,
  onStopRecording,
}) => (
  <main className="flex-1 min-h-0 overflow-auto bg-zinc-950 flex items-center justify-center p-8">
    <section className="w-full max-w-[560px] border border-zinc-800 bg-zinc-900/70 px-8 py-9">
      {isRecording ? (
        <>
          <div className="flex items-center gap-2 text-xs font-medium text-rose-300">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            RECORDING
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-zinc-100">Capture in progress</h1>
          <p className="mt-2 text-sm text-zinc-400">Your recording will open in the editor when you stop.</p>

          <div className="mt-7 grid grid-cols-2 divide-x divide-zinc-800 border-y border-zinc-800 py-4">
            <div className="pr-4">
              <div className="text-xs text-zinc-500">Duration</div>
              <div className="mt-1 font-mono text-lg tabular-nums text-zinc-100">{formatDuration(durationMs)}</div>
            </div>
            <div className="pl-5">
              <div className="text-xs text-zinc-500">Frames</div>
              <div className="mt-1 font-mono text-lg tabular-nums text-zinc-100">{capturedFrames.toLocaleString()}</div>
            </div>
          </div>

          <button
            onClick={onStopRecording}
            className="mt-7 inline-flex h-10 items-center gap-2 bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
          >
            <Square size={14} fill="currentColor" />
            Stop recording
          </button>
        </>
      ) : (
        <>
          <div className="flex h-11 w-11 items-center justify-center border border-zinc-700 bg-zinc-950 text-zinc-300">
            <Monitor size={20} strokeWidth={1.7} />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-zinc-100">Capture a new video</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">
            Choose your display and microphone in the toolbar. MotionCam opens the editor after you finish recording.
          </p>

          <dl className="mt-7 divide-y divide-zinc-800 border-y border-zinc-800">
            <div className="flex min-h-12 items-center justify-between gap-4 py-2">
              <dt className="flex items-center gap-2 text-xs text-zinc-500"><Monitor size={14} /> Screen</dt>
              <dd className="truncate text-right text-sm text-zinc-200">
                {display ? `${display.name} · ${display.width} × ${display.height}` : "Default display"}
              </dd>
            </div>
            <div className="flex min-h-12 items-center justify-between gap-4 py-2">
              <dt className="flex items-center gap-2 text-xs text-zinc-500"><Mic size={14} /> Microphone</dt>
              <dd className="truncate text-right text-sm text-zinc-200">{microphoneEnabled ? microphoneName || "No microphone detected" : "Off"}</dd>
            </div>
            <div className="flex min-h-12 items-center justify-between gap-4 py-2">
              <dt className="flex items-center gap-2 text-xs text-zinc-500"><Volume2 size={14} /> System audio</dt>
              <dd className="text-sm text-zinc-200">{systemAudioEnabled ? "On" : "Off"}</dd>
            </div>
            <div className="flex min-h-12 items-center justify-between gap-4 py-2">
              <dt className="flex items-center gap-2 text-xs text-zinc-500"><Video size={14} /> Quality</dt>
              <dd className="text-right text-sm text-zinc-200">{RECORDING_QUALITIES.find((quality) => quality.id === recordingQuality)?.label}</dd>
            </div>
          </dl>

          <button
            onClick={onStartRecording}
            className="mt-7 inline-flex h-11 items-center gap-2 bg-emerald-600 px-5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <Circle size={14} fill="currentColor" />
            Record screen
          </button>
        </>
      )}
    </section>
  </main>
);
