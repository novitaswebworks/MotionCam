import React from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Plus,
  Trash2,
  Zap,
  Scissors,
  Wand2,
} from "lucide-react";
import { CameraKeyframe, SpeedRampSegment, SubtitleCue } from "../../lib/types";
import { AudioWaveformTrack } from "./AudioWaveformTrack";
import { ZoomBlockTrack } from "./ZoomBlockTrack";
import { TrimHandles } from "./TrimHandles";
import { SubtitleTrack } from "./SubtitleTrack";

interface TimelineProps {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  keyframes: CameraKeyframe[];
  trimInMs: number;
  trimOutMs: number;
  speedRamps: SpeedRampSegment[];
  subtitles?: SubtitleCue[];
  onSeek: (timeMs: number) => void;
  onTogglePlay: () => void;
  onAddKeyframe: (timeMs: number, zoom?: number) => void;
  onUpdateKeyframe: (timeMs: number, updates: Partial<CameraKeyframe>) => void;
  onDeleteKeyframe: (timeMs: number) => void;
  selectedZoomTime: number | null;
  onSelectZoom: (keyframe: CameraKeyframe) => void;
  onZoomModeChange: (mode: "auto" | "manual") => void;
  onZoomLevelChange: (zoom: number) => void;
  onChangeTrim: (trimIn: number, trimOut: number) => void;
  onToggleSpeedRamp?: () => void;
  onAutoFrame?: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  currentTimeMs,
  durationMs,
  isPlaying,
  keyframes,
  trimInMs,
  trimOutMs,
  speedRamps,
  subtitles = [],
  onSeek,
  onTogglePlay,
  onAddKeyframe,
  onUpdateKeyframe,
  onDeleteKeyframe,
  selectedZoomTime,
  onSelectZoom,
  onZoomModeChange,
  onZoomLevelChange,
  onChangeTrim,
  onToggleSpeedRamp,
  onAutoFrame,
}) => {
  const progressPercent = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onSeek((val / 100) * durationMs);
  };

  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const millis = Math.floor((ms % 1000) / 100);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${millis}`;
  };

  const activeKeyframe = keyframes.find(
    (kf) => Math.abs(kf.t - currentTimeMs) < 150
  );

  const hasRamps = speedRamps.length > 0;

  return (
    <div className="h-44 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-md px-6 py-2.5 flex flex-col justify-between select-none">
      {/* Top Header Row */}
      <div className="flex items-center justify-between pb-1 border-b border-zinc-800/60">
        {/* Playback Transport */}
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors shadow-sm"
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            onClick={() => onSeek(trimInMs)}
            className="p-1.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Rewind to Trim In"
          >
            <RotateCcw size={13} />
          </button>
          <div className="font-mono text-xs text-zinc-400 pl-1">
            <span className="text-zinc-100 font-semibold">{formatTime(currentTimeMs)}</span> / {formatTime(durationMs)}
          </div>
        </div>

        {/* Editing Tools (Trimming, Speed Ramping, Keyframing) */}
        <div className="flex items-center gap-2">
          {onAutoFrame && (
            <button
              onClick={onAutoFrame}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-zinc-700/70 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              title="Create zooms from recorded cursor activity"
            >
              <Wand2 size={12} />
              <span>Auto frame</span>
            </button>
          )}
          {selectedZoomTime !== null && (() => {
            const selected = keyframes.find(k => k.t === selectedZoomTime);
            if (!selected) return null;
            return <div className="flex items-center gap-2 text-xs text-zinc-300">
              <span>Focus</span>
              <select aria-label="Zoom focus mode" value={selected.mode ?? "manual"} onChange={e => onZoomModeChange(e.target.value as "auto"|"manual")} className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-1">
                <option value="manual">Manual</option><option value="auto">Auto to click</option>
              </select>
              <label className="flex items-center gap-1">Zoom <input aria-label="Zoom level" type="range" min="1.2" max="4" step="0.1" value={selected.zoom} onChange={e=>onZoomLevelChange(Number(e.target.value))} className="w-20 accent-violet-400"/><span>{selected.zoom.toFixed(1)}×</span></label>
              <span className="text-zinc-500">{selected.mode === "auto" ? "Follows nearest click" : "Drag purple point on preview"}</span>
            </div>;
          })()}
          {/* Smart Speed Ramping Toggle */}
          {onToggleSpeedRamp && (
            <button
              onClick={onToggleSpeedRamp}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors border ${
                hasRamps
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/40"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700/60"
              }`}
              title="Automatically speed up long idle pauses (2.5x)"
            >
              <Zap size={12} className={hasRamps ? "fill-amber-400" : ""} />
              <span>{hasRamps ? "Idle Speedup (2.5x) On" : "Speed Up Idle"}</span>
            </button>
          )}

          {/* Keyframe Operations */}
          {activeKeyframe ? (
            <button
              onClick={() => onDeleteKeyframe(activeKeyframe.t)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs transition-colors"
              title="Delete Zoom Keyframe at Current Time"
            >
              <Trash2 size={12} />
              <span>Delete ({activeKeyframe.zoom}x)</span>
            </button>
          ) : (
            <button
              onClick={() => onAddKeyframe(currentTimeMs, 2.0)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs transition-colors"
              title="Add Zoom Block (2.0x)"
            >
              <Plus size={12} />
              <span>Add Zoom Point</span>
            </button>
          )}

          <div className="flex items-center gap-1 text-[11px] text-zinc-500 font-mono pl-2">
            <Scissors size={12} />
            <span>Trim: {((trimOutMs - trimInMs) / 1000).toFixed(1)}s</span>
          </div>
        </div>
      </div>

      {/* Multi-Track Timeline Viewport */}
      <div className="relative w-full flex flex-col gap-1.5 my-1">
        {/* Track 1: Zoom Blocks with interactive drag handles */}
        <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3">
          <span className="text-[11px] text-zinc-500">Zoom</span>
          <ZoomBlockTrack
            durationMs={durationMs}
            keyframes={keyframes}
            onUpdateKeyframe={onUpdateKeyframe}
            onDeleteKeyframe={onDeleteKeyframe}
            selectedTime={selectedZoomTime}
            onSelectKeyframe={onSelectZoom}
            onAddAtTime={time => onAddKeyframe(time,2.0)}
          />
        </div>

        {/* Track 2: Scrubber Track + Audio Waveform + Trim Boundaries */}
        <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3">
          <span className="text-[11px] text-zinc-500">Clip</span>
          <div className="relative w-full h-8 bg-zinc-950 rounded-md overflow-hidden border border-zinc-800 flex items-center">
          {/* Audio Peaks Background Strip */}
          <AudioWaveformTrack durationMs={durationMs} />

          {/* Speed Ramp Spans */}
          {speedRamps.map((ramp, idx) => {
            const leftPct = (ramp.start_ms / durationMs) * 100;
            const widthPct = ((ramp.end_ms - ramp.start_ms) / durationMs) * 100;
            return (
              <div
                key={`speed-ramp-${idx}`}
                className="absolute top-0 bottom-0 bg-amber-500/20 border-x border-amber-400/50 flex items-center justify-center pointer-events-none"
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              >
                <span className="text-[9px] font-mono font-bold text-amber-300 drop-shadow">
                  {ramp.multiplier}x ⚡
                </span>
              </div>
            );
          })}

          {/* Scrubber Progress Fill */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-emerald-500/15 border-r-2 border-emerald-400 transition-all duration-75 pointer-events-none z-10"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Trimming In / Out Overlay */}
          <TrimHandles
            durationMs={durationMs}
            trimInMs={trimInMs}
            trimOutMs={trimOutMs}
            onChangeTrim={onChangeTrim}
          />

          {/* Transparent Scrubber Input */}
          <input
            type="range"
            min="0"
            max="100"
            step="0.05"
            value={progressPercent}
            onChange={handleScrubberChange}
            className="absolute inset-0 w-full opacity-0 cursor-ew-resize z-30"
          />
          </div>
        </div>

        {/* Track 3: Subtitles & Speech Track */}
        {subtitles.length > 0 && (
          <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3">
            <span className="text-[11px] text-zinc-500">Captions</span>
            <SubtitleTrack
              cues={subtitles}
              durationMs={durationMs}
              currentTimeMs={currentTimeMs}
              onSelectCue={(cue) => onSeek(cue.start_ms)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
