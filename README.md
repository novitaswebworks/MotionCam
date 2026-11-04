# 🎥 MotionCam

> The open-source, cross-platform Screen Studio alternative. Transform raw screen recordings into cinematic promotional videos with automatic cursor tracking, spring-physics zooms, and studio styling.

---

## ⚡ The Core Philosophy

Traditional screen recorders bake camera cuts and zooms directly into the recording stream. **MotionCam decouples capture from presentation:**

1. **Dual-Stream Ingestion:** Records raw display/window frames at native resolution (4K 60fps) **and** simultaneously logs a high-precision, sub-pixel stream of mouse coordinates `(x, y, timestamp)`, click states, and keyboard focus events.
2. **Non-Destructive Kinetic Framing:** The raw recording is preserved untouched. Camera zooms, pans, device frames, aspect ratios, and background gradients are rendered dynamically on a canvas.
3. **Deterministic Render Pipeline:** The 60fps interactive preview in the editor matches the final exported video file bit-for-bit.

---

## 📁 Repository Structure

```
motioncam/
├── PLAN.md                    # Comprehensive system architecture & 5-phase roadmap
├── ANTIGRAVITY.md             # Engineering guidelines, performance budgets & checks
├── AGENTS.md                  # Agent pair-programming instructions
├── CLAUDE.md                  # Claude Code instructions mirror
└── ...
```

---

## 🗺️ Roadmap & Milestones

- [ ] **Phase 1: Dual-Stream Recording Core** (ScreenCaptureKit/WGC + Microsecond Cursor Tap)
- [ ] **Phase 2: Kinetic Camera & Auto-Framing Engine** (Second-Order Spring Physics)
- [ ] **Phase 3: Studio Canvas & Visual Styling** (Aspect Ratios, Window Chrome, Gradients, Vector Cursor)
- [ ] **Phase 4: Interactive Timeline & Scrubber UI** (60fps Scrubber, Zoom Blocks, Trimming)
- [ ] **Phase 5: Deterministic Hardware Export Pipeline** (VideoToolbox / NVENC / FFmpeg, MP4 & GIF)

For detailed specifications, data contracts, and implementation blueprints, refer to [PLAN.md](PLAN.md) and [ANTIGRAVITY.md](ANTIGRAVITY.md).
