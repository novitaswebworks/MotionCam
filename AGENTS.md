# MotionCam Project Instructions & Engineering Guidelines

> This document establishes the core engineering standards, verification workflows, and architectural rules for developing **MotionCam**. Every AI agent and developer working on this codebase must follow these instructions strictly.

---

## 1. Project Overview & Architecture

- **Application:** MotionCam is a high-performance desktop screen capture & cinematic post-production studio built with **Tauri 2**, a **Rust** backend, and a **React 19 / TypeScript / Tailwind CSS** frontend.
- **Core Principle:** Decouple capture from presentation. We record pristine full-resolution video alongside a parallel microsecond timestamped cursor stream, applying physics-based camera auto-framing and studio canvas styling non-destructively in post.
- **Platform Targets:** macOS (ScreenCaptureKit) and Windows (Windows.Graphics.Capture). Linux support planned via PipeWire.

---

## 2. Technology Stack & Directory Conventions

```
motioncam/
├── src-tauri/                 # Rust backend (Tauri 2)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs            # Application entrypoint & Tauri command registration
│       ├── lib.rs             # Tauri plugin & setup wiring
│       ├── capture/           # ScreenCaptureKit & WGC screen recording
│       │   ├── mod.rs
│       │   ├── macos.rs       # macOS ScreenCaptureKit implementation
│       │   ├── windows.rs     # Windows Graphics Capture implementation
│       │   └── cursor.rs      # Global OS mouse event tap & coordinate normalizer
│       ├── engine/            # Kinetic camera & spring physics solver
│       │   ├── mod.rs
│       │   ├── spring.rs      # Second-order differential spring physics solver
│       │   └── cluster.rs     # Click clustering & focal region detector
│       ├── project/           # .mcam project bundle serialization & file storage
│       └── export/            # FFmpeg & hardware VideoToolbox / NVENC exporter
├── src/                       # Frontend application (React 19 + TypeScript)
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/            # UI components (Timeline, Controls, StylingPanel)
│   │   ├── timeline/          # Scrubber, zoom blocks, playhead
│   │   ├── canvas/            # WebGL / Canvas preview viewport
│   │   └── inspector/         # Aspect ratio, background, shadow controls
│   ├── hooks/                 # Custom React hooks (useSpringPlayback, useTimeline)
│   ├── lib/                   # Utility functions & data models
│   │   ├── types.ts           # Shared TypeScript interfaces matching Rust structs
│   │   └── spring.ts          # Frontend spring physics mirror for live preview
│   └── styles/
│       └── globals.css        # Tailwind CSS v4 design tokens
├── package.json
└── tsconfig.json
```

---

## 3. Engineering Disciplines & Safety Rules

### 3.1 Non-Destructive Invariance
- Never mutate or overwrite raw recording files (`source.mp4`, `cursor.jsonl`).
- All zooms, pans, trims, and backgrounds are stored as metadata in `project.json` and rendered dynamically.

### 3.2 Sub-Pixel & HiDPI Discipline
- Never record cursor coordinates as raw unnormalized screen pixels. Always normalize coordinates to a float range $[0.0, 1.0]$ relative to display resolution.
- Render the cursor as an SVG vector on top of the video canvas so it remains tack-sharp even at $3\times$ zoom levels.

### 3.3 Performance Budgets
- **Preview Canvas:** Must maintain locked 60fps during live playback and scrubbing.
- **Background Recorder:** Must consume $<5\%$ CPU during active 4K 60fps screen recording.
- **Memory Footprint:** Clean up frame buffers immediately; no memory leaks during long recordings.

---

## 4. Verification Workflow

Before reporting any task complete or committing code:

1. **Frontend Check (Root Directory):**
   ```bash
   pnpm run build
   ```
   Must pass with zero TypeScript compiler errors or unresolved imports.

2. **Backend Check (`src-tauri/` Directory):**
   ```bash
   cargo check
   cargo clippy -- -D warnings
   ```
   Must compile cleanly without Clippy warnings.

3. **Format & Hygiene:**
   ```bash
   cargo fmt --check
   pnpm run lint
   ```

4. **Change Review:**
   - Inspect `git status --short` before making changes.
   - Do not stage or commit temporary files, debug `.mp4` recordings, or `.DS_Store`.

---

## 5. Coding Conventions

- **Rust:** Idiomatic, safe Rust. Wrap all OS-level FFI / unsafe blocks (Objective-C or Win32 calls) inside clean, safe Rust abstractions with comprehensive error handling.
- **TypeScript:** Strict type checking (`noImplicitAny: true`, `strictNullChecks: true`). Shared data contracts between Rust and TypeScript should be kept strictly in sync.
- **Styling:** Tailwind CSS v4 using semantic design tokens. Prefer hardware-accelerated CSS transforms (`translate3d`, `scale`) for preview rendering.
