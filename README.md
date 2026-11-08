# MotionCam

**A free, open-source Screen Studio alternative for macOS.** Record your screen, shape the camera movement in an editor, and export a polished video. The project is early and actively looking for contributors.

> **Current status:** macOS capture requires macOS 15 or newer. Windows capture is a test build (see the Windows download below) and Linux capture is not implemented. Some editor and export features are still incomplete; see [what works and what needs help](#project-status).

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
- Real-hardware validation of Windows recording (a test build exists) and Linux/PipeWire recording.
- Undo/redo, robust project migration, and long-session performance validation.

We want these limitations visible so users can make informed choices and contributors can pick concrete work.

## Get started

### Download for macOS

Download the universal DMG from [GitHub Releases](https://github.com/novitaswebworks/MotionCam/releases/latest). It supports both Apple Silicon and Intel Macs running macOS 15 or newer.

Each macOS build is ad-hoc signed and not notarized. macOS may ask you to approve the app the first time you open it: Control-click MotionCam in Applications, choose **Open**, then confirm. A Developer ID signature and Apple notarization are still needed for a warning-free first launch.

### Download for Windows (test build)

Download `MotionCam_<version>_x64-setup.exe` from the [v0.2.1 pre-release](https://github.com/novitaswebworks/MotionCam/releases/tag/v0.2.1). Pre-releases do not appear under "latest", so use this link. It needs Windows 10 version 2004 or newer.

This build is unsigned, so Windows SmartScreen will warn on first run: choose **More info**, then **Run anyway**. Recording has been built and checked in CI but not yet run on real hardware, so please report what you find.

For social posts, [download the MotionCam promotional artwork](docs/images/motioncam-social.png). The app shown in the artwork is illustrative, not a literal screenshot.

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
- Testing the Windows build on real PCs: multi-monitor, scaled displays, audio sync, and export.

### Reporting bugs

Include your macOS version, device model, steps to reproduce, expected behavior, and what happened instead. Share logs or a small test project only after checking that they contain no private screen or audio content. Do not upload personal recordings by default.

## Roadmap

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the engineering sequence and acceptance checks. The current priorities are trustworthy capture, real-media validation, a shared preview/export renderer, and clearly scoped platform support.

## License

MotionCam is distributed under the [MIT License](LICENSE).
