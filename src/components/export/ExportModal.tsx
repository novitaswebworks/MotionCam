import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Cpu,
} from "lucide-react";
import { ExportPreset, ExportOptions, ExportProgress } from "../../lib/types";
import { invoke } from "@tauri-apps/api/core";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  bundlePath?: string;
}

const PRESET_OPTIONS: {
  id: ExportPreset;
  title: string;
  description: string;
  defaultRes: [number, number];
  defaultFps: number;
}[] = [
  {
    id: "mp4_4k60",
    title: "4K 60fps Ultra MP4",
    description: "H.264 MP4 at 3840×2160; hardware encoding when available",
    defaultRes: [3840, 2160],
    defaultFps: 60,
  },
  {
    id: "mp4_1080p60",
    title: "1080p 60fps Social MP4",
    description: "H.264 MP4 at 1920×1080",
    defaultRes: [1920, 1080],
    defaultFps: 60,
  },
  {
    id: "gif_optimized",
    title: "30fps GIF",
    description: "Scaled to a maximum 1080px width",
    defaultRes: [1280, 720],
    defaultFps: 30,
  },
  {
    id: "prores_422",
    title: "Apple ProRes 422",
    description: "Broadcast-quality master file for Premiere & Final Cut",
    defaultRes: [3840, 2160],
    defaultFps: 60,
  },
  {
    id: "webm_vp9",
    title: "WebM (VP9)",
    description: "Standard VP9 video with optional Opus audio",
    defaultRes: [1920, 1080],
    defaultFps: 60,
  },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  bundlePath,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<ExportPreset>("mp4_4k60");
  const [selectedFps, setSelectedFps] = useState<number>(60);
  const [selectedRes, setSelectedRes] = useState<[number, number]>([3840, 2160]);

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [completedPath, setCompletedPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const pollIntervalRef = useRef<number | null>(null);

  // Update defaults when preset changes
  const handleSelectPreset = (presetId: ExportPreset) => {
    setSelectedPreset(presetId);
    const preset = PRESET_OPTIONS.find((p) => p.id === presetId);
    if (preset) {
      setSelectedRes(preset.defaultRes);
      setSelectedFps(preset.defaultFps);
    }
  };

  const handleStartExport = async () => {
    setIsExporting(true);
    setCompletedPath(null);
    setExportError(null);
    setProgress(null);

    const options: ExportOptions = {
      preset: selectedPreset,
      resolution: selectedRes,
      fps: selectedFps,
      include_audio: true,
    };

    try {
      if (!bundlePath) throw new Error("Open a recording project before exporting.");
      await invoke("start_export", {
        bundlePath,
        options,
      });

      // Poll progress every 150ms
      pollIntervalRef.current = window.setInterval(async () => {
        try {
          const prog = await invoke<ExportProgress>("get_export_progress");
          setProgress(prog);

          if (!prog.is_exporting) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
            }
            setIsExporting(false);
            if (prog.error) {
              setExportError(prog.error);
            } else if (prog.output_path && prog.progress_percent >= 100) {
              setCompletedPath(prog.output_path);
            }
          }
        } catch (err) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setIsExporting(false);
          setExportError(`Could not read export progress: ${String(err)}`);
        }
      }, 150);
    } catch (err) {
      setIsExporting(false);
      setExportError(String(err));
    }
  };

  const handleCancelExport = async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    try {
      await invoke("cancel_export");
    } catch {
      // Ignore
    }
    setIsExporting(false);
    setProgress(null);
  };

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="h-14 border-b border-zinc-800 px-6 flex items-center justify-between bg-zinc-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Download size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Hardware Video Exporter
              </h2>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <Cpu size={11} className="text-emerald-400" />
                <span>FFmpeg · hardware encoding when available</span>
              </div>
            </div>
          </div>

          {!isExporting && (
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5">
          {/* Preset Cards */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">
              Export Preset
            </label>
            <div className="grid grid-cols-1 gap-2">
              {PRESET_OPTIONS.map((preset) => (
                <button
                  key={preset.id}
                  disabled={isExporting}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`p-3 rounded-xl border text-left transition-all flex items-start justify-between ${
                    selectedPreset === preset.id
                      ? "bg-zinc-800/90 border-emerald-500/70 shadow-sm"
                      : "bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700"
                  } ${isExporting ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-zinc-100">
                      {preset.title}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {preset.description}
                    </div>
                  </div>
                  {selectedPreset === preset.id && (
                    <CheckCircle2 size={16} className="text-emerald-400 mt-0.5" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution & FPS Settings */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">
                Target Resolution
              </label>
              <select
                disabled={isExporting}
                value={`${selectedRes[0]}x${selectedRes[1]}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split("x").map(Number);
                  setSelectedRes([w, h]);
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="3840x2160">4K Ultra HD (3840 × 2160)</option>
                <option value="2560x1440">1440p QHD (2560 × 1440)</option>
                <option value="1920x1080">1080p Full HD (1920 × 1080)</option>
                <option value="1280x720">720p HD (1280 × 720)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">
                Framerate
              </label>
              <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                {[60, 30].map((fps) => (
                  <button
                    key={fps}
                    disabled={isExporting}
                    onClick={() => setSelectedFps(fps)}
                    className={`py-1 text-xs font-mono rounded transition-colors ${
                      selectedFps === fps
                        ? "bg-zinc-800 text-emerald-400 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Active Export Progress Box */}
          {isExporting && progress && (
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-200 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Rendering Deterministic Frames...
                </span>
                <span className="font-mono text-emerald-400 font-semibold">
                  {progress.progress_percent}%
                </span>
              </div>

              {/* Progress Track */}
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-150"
                  style={{ width: `${progress.progress_percent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                <span>
                  Frames: {progress.current_frame} / {progress.total_frames}
                </span>
                <span>ETA: {progress.eta_secs.toFixed(1)}s</span>
              </div>
            </div>
          )}

          {/* Completion Success Notification */}
          {completedPath && !isExporting && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <div>
                  <div className="text-xs font-semibold text-emerald-300">
                    Export Complete!
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono truncate max-w-sm">
                    {completedPath}
                  </div>
                </div>
              </div>
            </div>
          )}
          {exportError && !isExporting && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 flex gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-400" />
              <span className="break-all">Export failed: {exportError}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="h-16 border-t border-zinc-800 px-6 bg-zinc-900/90 flex items-center justify-between">
          <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <AlertCircle size={13} />
            <span>Camera zoom and trims are rendered. Speed ramps, cursor, webcam, subtitles, and canvas styling are not included yet.</span>
          </div>

          <div className="flex items-center gap-3">
            {isExporting ? (
              <button
                onClick={handleCancelExport}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            ) : completedPath ? (
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                Done
              </button>
            ) : (
              <button
                onClick={handleStartExport}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-lg shadow-emerald-950/40"
              >
                <Download size={14} />
                <span>Start Export</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
