import React, { useState } from "react";
import {
  CanvasConfig,
  AspectRatio,
  SpringConfig,
  WindowChromeStyle,
  CursorStyle,
} from "../../lib/types";
import {
  Monitor,
  Palette,
  Sparkles,
  MousePointer,
  Layers,
  Keyboard,
  Volume2,
  Camera,
  Type,
  FileText,
} from "lucide-react";

interface StylingPanelProps {
  canvasConfig: CanvasConfig;
  springConfig: SpringConfig;
  onCanvasChange: (config: CanvasConfig) => void;
  onSpringChange: (config: SpringConfig) => void;
  onExportSrt?: () => void;
}

const GRADIENT_PRESETS: { name: string; colors: string[] }[] = [
  { name: "Emerald Aurora", colors: ["#064e3b", "#059669", "#a7f3d0"] },
  { name: "Sunset Ember", colors: ["#831843", "#ea580c", "#fde047"] },
  { name: "Cosmic Indigo", colors: ["#1e1b4b", "#4f46e5", "#c084fc"] },
  { name: "Obsidian Slate", colors: ["#0f172a", "#334155", "#64748b"] },
  { name: "Cyber Neon", colors: ["#042f2e", "#0d9488", "#22d3ee"] },
  { name: "Rose Quartz", colors: ["#4c0519", "#e11d48", "#fda4af"] },
];

export const StylingPanel: React.FC<StylingPanelProps> = ({
  canvasConfig,
  springConfig,
  onCanvasChange,
  onSpringChange,
  onExportSrt,
}) => {
  const [activeTab, setActiveTab] = useState<"canvas" | "cursor" | "overlays" | "audio">("canvas");
  const updateWindow = (updates: Partial<typeof canvasConfig.window>) => {
    onCanvasChange({
      ...canvasConfig,
      window: { ...canvasConfig.window, ...updates },
    });
  };

  const updateCursor = (updates: Partial<typeof canvasConfig.cursor>) => {
    onCanvasChange({
      ...canvasConfig,
      cursor: { ...canvasConfig.cursor, ...updates },
    });
  };

  const updateKeystroke = (updates: Partial<typeof canvasConfig.keystroke>) => {
    onCanvasChange({
      ...canvasConfig,
      keystroke: { ...canvasConfig.keystroke, ...updates },
    });
  };

  const updateAudio = (updates: Partial<typeof canvasConfig.audio>) => {
    onCanvasChange({
      ...canvasConfig,
      audio: { ...canvasConfig.audio, ...updates },
    });
  };

  const updateWebcam = (updates: Partial<typeof canvasConfig.webcam>) => {
    onCanvasChange({
      ...canvasConfig,
      webcam: { ...canvasConfig.webcam, ...updates },
    });
  };

  const updateSubtitles = (updates: Partial<typeof canvasConfig.subtitles>) => {
    onCanvasChange({
      ...canvasConfig,
      subtitles: { ...canvasConfig.subtitles, ...updates },
    });
  };

  return (
    <aside className="w-[304px] min-w-[304px] h-full border-l border-zinc-800 bg-zinc-900 flex flex-col select-none">
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Inspector</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">Fine tune your recording</p>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">{canvasConfig.aspect_ratio}</span>
        </div>
        <div role="tablist" aria-label="Inspector sections" className="grid grid-cols-4 border-b border-zinc-800">
          {([
            ["canvas", "Canvas"],
            ["cursor", "Cursor"],
            ["overlays", "Overlays"],
            ["audio", "Audio"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`py-2 text-[11px] border-b-2 transition-colors ${activeTab === id ? "border-emerald-400 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
      {activeTab === "canvas" && <div role="tabpanel" aria-label="Canvas settings" className="space-y-5">
      {/* 1. Canvas Aspect Ratio */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Monitor size={14} /> Aspect Ratio
          </span>
          <span className="font-mono text-zinc-300">{canvasConfig.aspect_ratio}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          {(
            [
              { id: "16:9", label: "16:9", sub: "YouTube" },
              { id: "9:16", label: "9:16", sub: "Reels" },
              { id: "1:1", label: "1:1", sub: "Square" },
              { id: "4:5", label: "4:5", sub: "Social" },
            ] as const
          ).map((preset) => (
            <button
              key={preset.id}
              onClick={() => onCanvasChange({ ...canvasConfig, aspect_ratio: preset.id as AspectRatio })}
              className={`py-1.5 flex flex-col items-center justify-center rounded transition-all ${
                canvasConfig.aspect_ratio === preset.id
                  ? "bg-zinc-800 text-emerald-400 font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span className="font-mono text-xs">{preset.label}</span>
              <span className="text-[9px] text-zinc-500">{preset.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Window Framing & Shadows */}
      <div className="space-y-3 pt-2 border-t border-zinc-800">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Sparkles size={14} /> Window Frame & Depth
          </span>
        </div>

        {/* Chrome Style Selector */}
        <div className="space-y-1.5">
          <span className="text-[11px] text-zinc-400">Window Controls</span>
          <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            {(["macos", "windows", "minimal"] as WindowChromeStyle[]).map((style) => (
              <button
                key={style}
                onClick={() => updateWindow({ chrome_style: style, show_chrome: true })}
                className={`py-1 text-xs capitalize rounded transition-colors ${
                  canvasConfig.window.show_chrome && canvasConfig.window.chrome_style === style
                    ? "bg-zinc-800 text-emerald-400 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        {/* Corner Radius */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Corner Radius</span>
            <span className="font-mono text-zinc-200">{canvasConfig.window.border_radius}px</span>
          </div>
          <input
            type="range"
            min="8"
            max="32"
            value={canvasConfig.window.border_radius}
            onChange={(e) => updateWindow({ border_radius: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>

        {/* Diffuse Shadow Radius */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Diffuse Shadow</span>
            <span className="font-mono text-zinc-200">{canvasConfig.window.shadow_radius}px</span>
          </div>
          <input
            type="range"
            min="10"
            max="120"
            value={canvasConfig.window.shadow_radius}
            onChange={(e) => updateWindow({ shadow_radius: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>

        {/* Shadow Opacity */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Shadow Opacity</span>
            <span className="font-mono text-zinc-200">
              {Math.round(canvasConfig.window.shadow_opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={canvasConfig.window.shadow_opacity}
            onChange={(e) => updateWindow({ shadow_opacity: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>
      </div>

      {/* 3. Studio Backgrounds */}
      <div className="space-y-3 pt-2 border-t border-zinc-800">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Palette size={14} /> Background Studio
          </span>
          <span className="text-[11px] text-zinc-500 capitalize">{canvasConfig.background.type.replace("_", " ")}</span>
        </div>

        {/* Background Presets Grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {GRADIENT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() =>
                onCanvasChange({
                  ...canvasConfig,
                  background: {
                    type: "mesh_gradient",
                    colors: preset.colors,
                    blur: 40,
                    noise: true,
                  },
                })
              }
              className="p-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-950 flex flex-col gap-1 text-left transition-all"
            >
              <div
                className="w-full h-7 rounded border border-white/10"
                style={{
                  background: `linear-gradient(135deg, ${preset.colors.join(", ")})`,
                }}
              />
              <span className="text-[10px] text-zinc-400 truncate">{preset.name}</span>
            </button>
          ))}
        </div>

        {/* Quick Style Modes (Wallpaper Blur, Transparent, Solid) */}
        <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() =>
              onCanvasChange({
                ...canvasConfig,
                background: { type: "blurred_wallpaper", blur: 50 },
              })
            }
            className={`py-1 text-[11px] rounded transition-colors ${
              canvasConfig.background.type === "blurred_wallpaper"
                ? "bg-zinc-800 text-emerald-400 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Wallpaper
          </button>
          <button
            onClick={() =>
              onCanvasChange({
                ...canvasConfig,
                background: { type: "solid", color: "#09090b" },
              })
            }
            className={`py-1 text-[11px] rounded transition-colors ${
              canvasConfig.background.type === "solid"
                ? "bg-zinc-800 text-emerald-400 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Solid
          </button>
          <button
            onClick={() =>
              onCanvasChange({
                ...canvasConfig,
                background: { type: "transparent" },
              })
            }
            className={`py-1 text-[11px] rounded transition-colors ${
              canvasConfig.background.type === "transparent"
                ? "bg-zinc-800 text-emerald-400 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Transparent
          </button>
        </div>

        {/* Noise Texture Toggle */}
        {(canvasConfig.background.type === "mesh_gradient" ||
          canvasConfig.background.type === "radial_gradient") && (
          <div className="flex items-center justify-between text-xs text-zinc-300 pt-1">
            <span className="flex items-center gap-1.5">
              <Layers size={12} className="text-zinc-400" /> Noise Grain Overlay
            </span>
            <input
              type="checkbox"
              checked={Boolean(canvasConfig.background.noise)}
              onChange={(e) => {
                if (
                  canvasConfig.background.type === "mesh_gradient" ||
                  canvasConfig.background.type === "radial_gradient"
                ) {
                  onCanvasChange({
                    ...canvasConfig,
                    background: {
                      ...canvasConfig.background,
                      noise: e.target.checked,
                    },
                  });
                }
              }}
              className="accent-emerald-500 rounded"
            />
          </div>
        )}
      </div>

      </div>}

      {activeTab === "cursor" && <div role="tabpanel" aria-label="Cursor settings" className="space-y-5">
      {/* 4. Synthetic Vector Cursor */}
      <div className="space-y-3 pt-2 border-t border-zinc-800">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
          <span className="flex items-center gap-1.5">
            <MousePointer size={14} /> Synthetic Vector Cursor
          </span>
          <span className="font-mono text-zinc-200">{canvasConfig.cursor.scale}x</span>
        </div>

        {/* Cursor Style Selector */}
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { id: "macos_black", label: "macOS Black" },
              { id: "macos_white", label: "macOS White" },
              { id: "windows_modern", label: "Windows Fluent" },
              { id: "neon", label: "Neon Glow" },
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              onClick={() => updateCursor({ style: c.id as CursorStyle })}
              className={`p-1.5 text-xs rounded border transition-colors ${
                canvasConfig.cursor.style === c.id
                  ? "bg-zinc-800 border-emerald-500/50 text-emerald-300 font-medium"
                  : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Cursor Scale Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Size Scale</span>
            <span className="font-mono text-zinc-200">{canvasConfig.cursor.scale}x</span>
          </div>
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.1"
            value={canvasConfig.cursor.scale}
            onChange={(e) => updateCursor({ scale: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>

        {/* Click Ripple & Smooth Trail Toggles */}
        <div className="space-y-2 pt-1 text-xs text-zinc-300">
          <div className="flex items-center justify-between">
            <span>Expanding Click Ripples</span>
            <input
              type="checkbox"
              checked={canvasConfig.cursor.click_ripple}
              onChange={(e) => updateCursor({ click_ripple: e.target.checked })}
              className="accent-emerald-500 rounded"
            />
          </div>
          <div className="flex items-center justify-between">
            <span>Smooth Motion Trail</span>
            <input
              type="checkbox"
              checked={canvasConfig.cursor.smooth_trail}
              onChange={(e) => updateCursor({ smooth_trail: e.target.checked })}
              className="accent-emerald-500 rounded"
            />
          </div>
        </div>
      </div>

      {/* 5. Kinetic Camera Spring Physics */}
      <div className="space-y-3 pt-2 border-t border-zinc-800">
        <div className="text-xs font-medium text-zinc-400">Kinetic Spring Tuning</div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Stiffness</span>
            <span className="font-mono text-zinc-200">{springConfig.stiffness}</span>
          </div>
          <input
            type="range"
            min="60"
            max="280"
            value={springConfig.stiffness}
            onChange={(e) => onSpringChange({ ...springConfig, stiffness: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Damping</span>
            <span className="font-mono text-zinc-200">{springConfig.damping}</span>
          </div>
          <input
            type="range"
            min="12"
            max="45"
            value={springConfig.damping}
            onChange={(e) => onSpringChange({ ...springConfig, damping: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>
      </div>

      </div>}

      {activeTab === "overlays" && <div role="tabpanel" aria-label="Overlay settings" className="space-y-5">
      {/* 6. Keystroke HUD Overlays */}
      <div className="space-y-3 pt-2 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <Keyboard size={14} className="text-emerald-400" />
            <span>Keystroke Badges</span>
          </div>
          <input
            type="checkbox"
            checked={canvasConfig.keystroke.enabled}
            onChange={(e) => updateKeystroke({ enabled: e.target.checked })}
            className="accent-emerald-500 rounded"
          />
        </div>

        {canvasConfig.keystroke.enabled && (
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <span className="text-xs text-zinc-400">Badge Style</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "dark_glass", label: "Dark Glass" },
                  { id: "light_glass", label: "Light Glass" },
                  { id: "minimal", label: "Minimal" },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() =>
                      updateKeystroke({
                        style: s.id as typeof canvasConfig.keystroke.style,
                      })
                    }
                    className={`py-1 text-[11px] rounded border transition-colors ${
                      canvasConfig.keystroke.style === s.id
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-zinc-400">Position</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "bottom_center", label: "Bottom Center" },
                  { id: "bottom_left", label: "Bottom Left" },
                  { id: "top_center", label: "Top Center" },
                ].map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() =>
                      updateKeystroke({
                        position: pos.id as typeof canvasConfig.keystroke.position,
                      })
                    }
                    className={`py-1 text-[10px] rounded border transition-colors ${
                      canvasConfig.keystroke.position === pos.id
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Shortcuts Only (⌘/⌥/⇧)</span>
              <input
                type="checkbox"
                checked={canvasConfig.keystroke.only_shortcuts}
                onChange={(e) =>
                  updateKeystroke({ only_shortcuts: e.target.checked })
                }
                className="accent-emerald-500 rounded"
              />
            </div>
          </div>
        )}
      </div>

      </div>}

      {activeTab === "audio" && <div role="tabpanel" aria-label="Audio settings" className="space-y-5">
      {/* 7. Audio Studio Mix */}
      <div className="space-y-3 pt-2 border-t border-zinc-800 pb-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
          <Volume2 size={14} className="text-emerald-400" />
          <span>Audio Ingestion & Levels</span>
        </div>
        <div className="space-y-2">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>System Loopback Audio</span>
              <span className="font-mono text-zinc-200">
                {Math.round(canvasConfig.audio.system_volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={canvasConfig.audio.system_volume}
              onChange={(e) =>
                updateAudio({ system_volume: Number(e.target.value) })
              }
              className="w-full accent-emerald-500"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>Microphone Volume</span>
              <span className="font-mono text-zinc-200">
                {Math.round(canvasConfig.audio.mic_volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={canvasConfig.audio.mic_volume}
              onChange={(e) =>
                updateAudio({ mic_volume: Number(e.target.value) })
              }
              className="w-full accent-emerald-500"
            />
          </div>
        </div>
      </div>

      </div>}

      {activeTab === "overlays" && <div role="tabpanel" aria-label="Webcam and caption settings" className="space-y-5">
      {/* 8. Face Cam (Webcam Overlay) */}
      <div className="space-y-3 pt-2 border-t border-zinc-800 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <Camera size={14} className="text-emerald-400" />
            <span>Face Cam (Webcam)</span>
          </div>
          <input
            type="checkbox"
            checked={canvasConfig.webcam.enabled}
            onChange={(e) => updateWebcam({ enabled: e.target.checked })}
            className="accent-emerald-500 rounded"
          />
        </div>

        {canvasConfig.webcam.enabled && (
          <div className="space-y-3 pt-1">
            {/* Shape Selector */}
            <div className="space-y-1.5">
              <span className="text-xs text-zinc-400">Shape</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "circle", label: "Circle" },
                  { id: "squircle", label: "Squircle" },
                  { id: "rectangle", label: "Rectangle" },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() =>
                      updateWebcam({
                        shape: s.id as typeof canvasConfig.webcam.shape,
                      })
                    }
                    className={`py-1 text-[11px] rounded border transition-colors ${
                      canvasConfig.webcam.shape === s.id
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Position Corner Grid */}
            <div className="space-y-1.5">
              <span className="text-xs text-zinc-400">Corner Position</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "top_left", label: "Top Left" },
                  { id: "top_right", label: "Top Right" },
                  { id: "bottom_left", label: "Bottom Left" },
                  { id: "bottom_right", label: "Bottom Right" },
                ].map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() =>
                      updateWebcam({
                        position: pos.id as typeof canvasConfig.webcam.position,
                      })
                    }
                    className={`py-1 text-[11px] rounded border transition-colors ${
                      canvasConfig.webcam.position === pos.id
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Size Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Overlay Size</span>
                <span className="font-mono text-zinc-200">
                  {canvasConfig.webcam.size}px
                </span>
              </div>
              <input
                type="range"
                min="120"
                max="320"
                step="10"
                value={canvasConfig.webcam.size}
                onChange={(e) =>
                  updateWebcam({ size: Number(e.target.value) })
                }
                className="w-full accent-emerald-500"
              />
            </div>

            {/* Border Width & Color */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Border Width</span>
                <span className="font-mono text-zinc-200">
                  {canvasConfig.webcam.border_width}px
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="6"
                  step="1"
                  value={canvasConfig.webcam.border_width}
                  onChange={(e) =>
                    updateWebcam({ border_width: Number(e.target.value) })
                  }
                  className="flex-1 accent-emerald-500"
                />
                <div className="flex items-center gap-1">
                  {[
                    { color: "#10b981", name: "Emerald" },
                    { color: "#ffffff", name: "White" },
                    { color: "#8b5cf6", name: "Violet" },
                    { color: "#f43f5e", name: "Rose" },
                  ].map((c) => (
                    <button
                      key={c.color}
                      onClick={() => updateWebcam({ border_color: c.color })}
                      style={{ backgroundColor: c.color }}
                      className={`w-4 h-4 rounded-full border ${
                        canvasConfig.webcam.border_color === c.color
                          ? "border-emerald-400 scale-110"
                          : "border-transparent opacity-80"
                      }`}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Smart Auto-Dodge */}
            <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
              <div className="flex flex-col">
                <span className="text-zinc-200 font-medium">Smart Auto-Dodge</span>
                <span className="text-[10px] text-zinc-500">
                  Dodge corner when camera zooms in
                </span>
              </div>
              <input
                type="checkbox"
                checked={canvasConfig.webcam.auto_dodge}
                onChange={(e) =>
                  updateWebcam({ auto_dodge: e.target.checked })
                }
                className="accent-emerald-500 rounded"
              />
            </div>

            {/* Mirror Video */}
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Mirror Camera Video</span>
              <input
                type="checkbox"
                checked={canvasConfig.webcam.mirror}
                onChange={(e) => updateWebcam({ mirror: e.target.checked })}
                className="accent-emerald-500 rounded"
              />
            </div>
          </div>
        )}
      </div>

      {/* 9. Dynamic Subtitles & Karaoke Captions */}
      <div className="space-y-3 pt-2 border-t border-zinc-800 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <Type size={14} className="text-emerald-400" />
            <span>Dynamic Subtitles</span>
          </div>
          <input
            type="checkbox"
            checked={canvasConfig.subtitles.enabled}
            onChange={(e) => updateSubtitles({ enabled: e.target.checked })}
            className="accent-emerald-500 rounded"
          />
        </div>

        {canvasConfig.subtitles.enabled && (
          <div className="space-y-3 pt-1">
            {/* Style Picker */}
            <div className="space-y-1.5">
              <span className="text-xs text-zinc-400">Caption Style</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "word_highlight", label: "Word Highlight" },
                  { id: "glass_box", label: "Glass Box" },
                  { id: "minimal_text", label: "Minimal" },
                  { id: "cinema_caps", label: "Cinema Caps" },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() =>
                      updateSubtitles({
                        style: s.id as typeof canvasConfig.subtitles.style,
                      })
                    }
                    className={`py-1 text-[11px] rounded border transition-colors ${
                      canvasConfig.subtitles.style === s.id
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Position Picker */}
            <div className="space-y-1.5">
              <span className="text-xs text-zinc-400">Position</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "bottom_center", label: "Bottom" },
                  { id: "middle_center", label: "Middle" },
                  { id: "top_center", label: "Top" },
                ].map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() =>
                      updateSubtitles({
                        position: pos.id as typeof canvasConfig.subtitles.position,
                      })
                    }
                    className={`py-1 text-[11px] rounded border transition-colors ${
                      canvasConfig.subtitles.position === pos.id
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Font Size</span>
                <span className="font-mono text-zinc-200">
                  {canvasConfig.subtitles.font_size}px
                </span>
              </div>
              <input
                type="range"
                min="16"
                max="36"
                step="1"
                value={canvasConfig.subtitles.font_size}
                onChange={(e) =>
                  updateSubtitles({ font_size: Number(e.target.value) })
                }
                className="w-full accent-emerald-500"
              />
            </div>

            {/* Active Word Highlight Color */}
            <div className="space-y-1.5">
              <span className="text-xs text-zinc-400">Active Spoken Word Accent</span>
              <div className="flex items-center gap-2">
                {[
                  { color: "#10b981", name: "Emerald" },
                  { color: "#facc15", name: "Amber" },
                  { color: "#06b6d4", name: "Cyan" },
                  { color: "#a855f7", name: "Violet" },
                  { color: "#ffffff", name: "White" },
                ].map((c) => (
                  <button
                    key={c.color}
                    onClick={() => updateSubtitles({ active_color: c.color })}
                    style={{ backgroundColor: c.color }}
                    className={`w-5 h-5 rounded-full border transition-transform ${
                      canvasConfig.subtitles.active_color === c.color
                        ? "border-emerald-400 scale-110 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        : "border-transparent opacity-80 hover:opacity-100"
                    }`}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Export Subtitles Button */}
            {onExportSrt && (
              <div className="pt-2">
                <button
                  onClick={onExportSrt}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 text-xs text-zinc-200 font-medium transition-colors"
                >
                  <FileText size={13} className="text-emerald-400" />
                  <span>Export Subtitles (.srt)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>}
      </div>
    </aside>
  );
};
