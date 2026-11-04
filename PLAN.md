# 🎥 MotionCam — Project Plan & Technical Specification

> **Tagline:** The open-source, cross-platform Screen Studio alternative. Transform raw screen recordings into cinematic promotional videos with automatic cursor tracking, spring-physics zooms, and studio styling.

---

## 1. Executive Summary & Core Philosophy

Traditional screen recorders bake camera cuts and zooms directly into the recording stream. **MotionCam decouples capture from presentation:**
1. **Raw Dual-Stream Ingestion:** Records raw display/window frames at native resolution (e.g. 4K 60fps) **and** simultaneously logs a high-precision, sub-pixel stream of mouse coordinates `(x, y, timestamp)`, click states, and keyboard focus events.
2. **Non-Destructive Kinetic Framing:** The raw recording is preserved. Camera zooms, pans, device frames, aspect ratios, and background gradients are rendered dynamically on a canvas.
3. **Deterministic Render Pipeline:** The 60fps interactive preview in the editor matches the final exported video file bit-for-bit.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MotionCam Engine                               │
└─────────────────────────────────────────────────────────────────────────────┘

 [ScreenCaptureKit / WGC / PipeWire] ──► Raw Video (NV12 / H.264) ──┐
                                                                    ├─► Project Bundle (.mcam)
 [OS Global Event Tap (CGEvent/Win32)] ─► Cursor Log (events.jsonl) ─┘
                                                │
                                                ▼
                                    [Kinetic Camera Engine]
                               • Velocity analysis & dwell detection
                               • Second-order spring-damper physics
                               • Auto-zoom to click bounding boxes
                                                │
                                                ▼
                                    [Studio Canvas Preview]
                               • Aspect Ratios: 16:9, 9:16, 1:1, 4:5
                               • macOS window chrome & diffuse shadow
                               • Mesh gradients / wallpaper blur
                               • Interpolated 120Hz SVG vector cursor
                                                │
                                                ▼
                                  [Deterministic Hardware Exporter]
                               • Frame-by-frame offscreen render pass
                               • Rust + VideoToolbox / NVENC / FFmpeg
                               • Export: 4K MP4 / Optimized 60fps GIF
```

---

## 3. Data Specifications

### 3.1 Project Bundle (`.mcam`)
An `.mcam` project is a directory (or zipped container) containing:
```
my-recording.mcam/
├── project.json       # Project configuration, styling, and keyframes
├── source.mp4         # Pristine 60fps screen recording
├── cursor.jsonl       # High-frequency timestamped cursor & click events
├── audio.wav          # System + microphone audio tracks (lossless PCM)
└── thumbnails/        # Timeline scrubber preview frames
```

### 3.2 Cursor Event Log (`cursor.jsonl`)
Events are streamed with microsecond precision:
```json
{"t": 1420.5, "x": 0.4521, "y": 0.3120, "type": "move"}
{"t": 1450.2, "x": 0.4525, "y": 0.3120, "type": "down", "btn": "left"}
{"t": 1520.0, "x": 0.4525, "y": 0.3120, "type": "up", "btn": "left"}
```
*Note: Coordinates are normalized $(0.0 \to 1.0)$ relative to the captured display to handle Retina DPI scaling seamlessly.*

### 3.3 Project Configuration (`project.json`)
```json
{
  "version": "1.0.0",
  "meta": {
    "title": "Quick Demo",
    "duration_ms": 12400,
    "source_res": [3840, 2160],
    "fps": 60
  },
  "canvas": {
    "aspect_ratio": "16:9",
    "background": {
      "type": "mesh_gradient",
      "colors": ["#163e31", "#059669", "#d3ed97"],
      "blur": 40
    },
    "window": {
      "border_radius": 20,
      "shadow_radius": 48,
      "shadow_opacity": 0.35,
      "show_chrome": true
    },
    "cursor": {
      "style": "macos_black",
      "scale": 1.4,
      "click_ripple": true,
      "smooth_trail": true
    }
  },
  "camera": {
    "mode": "auto",
    "spring": {
      "mass": 1.0,
      "stiffness": 170.0,
      "damping": 26.0
    },
    "default_zoom": 1.8,
    "keyframes": []
  }
}
```

---

## 4. Phased Milestone Roadmap

### Phase 1: Dual-Stream Recording Core (Rust Backend)
* **Objective:** Capture zero-lag screen frames and raw cursor events simultaneously.
* **Tasks:**
  - [ ] Implement macOS screen capture using `ScreenCaptureKit` (AVFoundation fallback for macOS < 13).
  - [ ] Implement Windows screen capture using `Windows.Graphics.Capture`.
  - [ ] Implement OS global mouse event tap (`CGEventTap` on macOS, `SetWindowsHookEx` on Windows).
  - [ ] Normalize coordinates for Retina/HiDPI scaling.
  - [ ] Implement `.mcam` project serializer saving `source.mp4` and `cursor.jsonl`.
* **Verification:** Record a 30-second session; verify zero frame drops and accurate cursor coordinate alignment on playback.

### Phase 2: Kinetic Camera & Auto-Framing Engine (Rust / TS)
* **Objective:** Transform raw cursor coordinates into fluid, physics-based camera motions.
* **Tasks:**
  - [ ] Cluster clicks and dwell periods within a temporal window (e.g. 500ms).
  - [ ] Compute target bounding boxes centered around points of interest with edge margin safety.
  - [ ] Implement second-order spring physics solver for camera $(x, y, \text{zoom})$:
    - Rapid mouse transit across display $\to$ zoom zooms out to $1.0\times$.
    - Linger / typing / clicks $\to$ camera zooms in to $1.8\times - 2.5\times$.
  - [ ] Velocity-adaptive damping (prevent disorienting camera snaps on sudden movements).
* **Verification:** Run test event logs; verify that camera movements feel cinematic, smooth, and keep the cursor within safe margins.

### Phase 3: Studio Canvas & Visual Presentation Layer (Frontend)
* **Objective:** Build the styling engine that makes recordings look like high-end product launches.
* **Tasks:**
  - [ ] Canvas aspect-ratio presets: 16:9 (YouTube), 9:16 (Shorts/Reels), 1:1 (Social), 4:5.
  - [ ] Window framing: customizable corner radius, drop shadow blur/spread, and synthetic macOS window controls.
  - [ ] Background library: interactive mesh gradients, solid colors, blurred desktop wallpaper, or alpha transparent.
  - [ ] Vector cursor engine: render crisp vector SVG cursors over the video with sub-pixel interpolation and click ripple rings.
* **Verification:** Visual QA across all aspect ratios with crisp 60fps rendering in the preview canvas.

### Phase 4: Interactive Timeline & Scrubber UI (Tauri / React)
* **Objective:** Give users effortless, non-linear editing control.
* **Tasks:**
  - [ ] High-performance timeline scrubber displaying video thumbnails and audio waveforms.
  - [ ] Zoom blocks on timeline: visualize automatic zoom segments with drag handles to extend, shorten, or delete.
  - [ ] Manual keyframe creation: click to add custom zoom focus points.
  - [ ] Trim in/out handles to snip dead time at start and end.
  - [ ] Speed ramping: 1-click option to speed up ($2\times - 4\times$) long static idle stretches.
* **Verification:** Real-time scrubbing at 60fps without desync between timeline, cursor, and video.

### Phase 5: Deterministic Hardware Export Pipeline
* **Objective:** Export the final framed composition to production-ready video files.
* **Tasks:**
  - [ ] Deterministic frame-by-frame renderer stepping through time $t$ from $0 \to T$.
  - [ ] Offscreen canvas / framebuffer rendering with full anti-aliasing.
  - [ ] Hardware-accelerated encoding:
    - macOS: Apple VideoToolbox (H.264 / HEVC / ProRes).
    - Windows: NVENC / Media Foundation.
    - Software fallback: FFmpeg.
  - [ ] Two-pass optimized GIF generation with palette quantization.
  - [ ] WebM export with alpha transparency.
* **Verification:** Verify that exported MP4 matches the editor preview frame-for-frame with audio in perfect sync.

---

## 5. Non-Negotiable Engineering Rules
1. **Never mutate the raw source:** All edits, trims, and camera keyframes must be non-destructive.
2. **Deterministic rendering:** The preview at timestamp $t$ MUST produce the identical frame during final export.
3. **Sub-pixel vector cursor:** Never bake the OS cursor into the video frame; render the synthetic vector cursor independently for 4K crispness at any zoom level.
4. **Offline first:** Zero cloud dependencies, zero external network requests, zero telemetry. Runs 100% locally.
