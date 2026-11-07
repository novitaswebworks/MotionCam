# MotionCam

**A free, open-source Screen Studio alternative for macOS.** Record your screen, shape the camera movement in an editor, and export a polished video. The project is early and actively looking for contributors.

> **Current status:** macOS capture requires macOS 15 or newer. Windows capture and Linux capture are not implemented. Some editor and export features are still incomplete; see [what works and what needs help](#project-status).

## Why MotionCam?

Screen Studio is a polished, paid screen recording and editing app. MotionCam aims to give people a free alternative they can inspect, improve, and adapt. It records source media first, then applies camera edits in the project so zooms and framing can be changed later.

MotionCam is an independent project and is not affiliated with Screen Studio or its developers.

## Project status

### Available now

- Native macOS screen recording to MP4 with ScreenCaptureKit.
- System audio capture and microphone selection, including the system default device.
- Cursor event capture alongside the source recording.
- An editor with video preview, timeline trimming, and manual or click-targeted zoom points.
- Spring-based camera movement in the preview, project settings persistence, themes, and first-run setup.
- FFmpeg export paths for MP4, ProRes, WebM, and GIF, with trims and camera keyframes.

The native recording flow and MP4 audio stream have been exercised locally. Microphone audibility still needs a spoken-input test, and export formats need broader real-media validation.

### In progress / not implemented

- Preview and exported video do not yet render the same composition. Export currently applies trims and camera keyframes, but does not composite the styled canvas, cursor overlay, webcam, subtitles, or speed ramps.
- Separate microphone and system-audio tracks, a format-aware live audio meter, and reliable audio mixing.
- Real webcam recording, speech-to-text, and recorded audio waveforms. Some of these controls or previews are not functional yet.
- Windows Graphics Capture and Linux/PipeWire recording.
- Undo/redo, robust project migration, and long-session performance validation.

We want these limitations visible so users can make informed choices and contributors can pick concrete work.

## Get started

### Requirements

- macOS 15 or newer for native screen recording.
- Node.js, pnpm, Rust, and Xcode Command Line Tools for development.
- FFmpeg installed and available on `PATH` for export.

### Run from source

```bash
git clone https://github.com/novitaswebworks/MotionCam.git
cd MotionCam
pnpm install
pnpm tauri dev
```

The first recording may prompt macOS for Screen & System Audio Recording and microphone permissions.

### Build and check

```bash
pnpm run build
pnpm run lint
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
```

## Contributing

We welcome bug reports, feature proposals, documentation, design feedback, and code contributions. Start with [CONTRIBUTING.md](CONTRIBUTING.md), browse [open issues](https://github.com/novitaswebworks/MotionCam/issues), or share questions and ideas in [Discussions](https://github.com/novitaswebworks/MotionCam/discussions).

Useful early contributions include:

- Verifying microphone capture with spoken input and improving recording feedback.
- Designing a shared preview/export composition pipeline.
- Replacing synthetic timeline waveforms with peaks from recorded audio.
- Testing project save/reopen, export formats, and long recordings on macOS.
- Building and validating the Windows capture backend.

### Reporting bugs

Include your macOS version, device model, steps to reproduce, expected behavior, and what happened instead. Share logs or a small test project only after checking that they contain no private screen or audio content. Do not upload personal recordings by default.

## Roadmap

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the engineering sequence and acceptance checks. The current priorities are trustworthy capture, real-media validation, a shared preview/export renderer, and clearly scoped platform support.

## License

MotionCam is distributed under the [MIT License](LICENSE).
