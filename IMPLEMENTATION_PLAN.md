# MotionCam implementation plan

Deliver in dependency order. Each phase requires build, lint, Rust check, Clippy and formatting checks, plus the acceptance checks below. Source recordings must remain immutable.

1. **Real capture (started)**: native macOS MP4 encoding and finalization, explicit errors, unique bundle directories, correct display bounds, bounded cursor streaming, shared media timestamps, recording status. First native recording path uses macOS 15+; implement an older macOS encoder separately. Windows must return unsupported until WGC is implemented. Acceptance: play a 30-second recording, confirm frame timing, cursor alignment and permission failure behavior.
2. **Real media preview**: load source video and cursor events from the bundle, derive duration from media, synchronize seek/playback/audio, replace synthetic samples with an explicit demo mode. Acceptance: seek beginning/middle/end and compare video and cursor timestamps.
3. **Project persistence**: align Rust/TypeScript schemas including overlays/audio, add version migration and validation, atomic saves, open/recent projects, autosave and undo. Acceptance: save/reopen all editing settings without changing source bytes.
4. **Composited export**: define a shared composition/timing contract before implementing the renderer; render camera, backgrounds and cursor; apply trims and speed maps; mix audio; supervise encoder cancellation/errors; protect source paths. Acceptance: compare preview/export frames at fixed timestamps and verify decodable output and failure reporting.
5. **Audio, webcam and transcription**: format-aware audio conversion, separate mic/system tracks, real device enumeration and webcam recording, offline transcription with explicit model availability. Acceptance: device removal, mute/mix, sync and real speech checks.
6. **Timeline and performance**: stable keyframe IDs and duration semantics, functional trim handles, cached camera trajectories, real peaks/thumbnails, keyboard accessibility, long-recording benchmarks. Acceptance: 60fps profiling, bounded memory, no dropped recording frames; measure CPU rather than claiming a budget.

## Current implementation checkpoint

Native SCRecordingOutput is attached before capture starts and finalization is awaited. Empty placeholder source creation is removed. Start/stop errors appear in the UI. This is the first capture increment; runtime recording, audio correctness, cursor durability and platform coverage remain open.

Validation for this increment: frontend build and lint, cargo check, Clippy with warnings denied, and cargo fmt --check passed. No live screen recording was performed; file decodability and synchronization remain unverified.

## Capture durability and preview increment

Implemented: UUID recording directory names; create-new cursor files; bounded cursor event queue with periodic disk flush, final sync, and overflow/write-error reporting; selected-display logical bounds and native pixel dimensions; unsupported-platform errors; actual frame counts; background start/stop commands; frontend session polling.

Preview now loads the recorded source and cursor events using an explicitly scoped asset URL, plays the MP4, seeks while paused, loops trim bounds, applies playback speed, and uses decoded duration. Default demo captions and zoom keyframes were removed, and canned transcription no longer runs automatically after recording.

Validation: frontend build/lint, Rust compile/Clippy/format checks passed; all 20 Rust unit tests passed, including a new secondary-display normalization case. Live recording was not performed.

Still open before capture/preview acceptance: align cursor timestamps with the first encoded video sample; verify native recording and permission lifecycle; correct separate WAV format conversion; map cursor overlays through video letterboxing; replace remaining synthetic waveforms/device and auto-frame fallbacks; test real recording playback and long-session behavior. Phases 1 and 2 remain in progress. Persistence and export are next after these acceptance gaps.

Native runtime check (2026-11-06): macOS Screen & System Audio Recording access was explicitly enabled for the temporary `MotionCamDev` app, and the app was relaunched. `SCShareableContent.get()` still timed out before recording could start, so no fresh recording or editor handoff was verified. The temporary unsigned wrapper is not a trustworthy substitute for the real Tauri bundle. Building the app bundle is currently blocked because only Command Line Tools are selected and the installed Swift compiler build does not match the macOS SDK; align/install the Xcode toolchain, build the actual `.app`, then repeat the permission and end-to-end recording check.

## Current implementation increment

Mic capture now enables ScreenCaptureKit microphone capture independently from the optional device ID, so the system default microphone works when no explicit device is selected. Zoom blocks can be added by double-clicking the zoom track, selected blocks reveal Manual/Auto focus and zoom level controls, and manual focus can be selected or dragged on the actual video image. Auto focus targets the nearest recorded click. Keyframe focus mode is represented in both project schemas with a backwards-compatible default.

Microphone content still needs runtime verification with spoken input. The previous raw `audio.wav` sidecar and its live meter were removed after runtime inspection showed that system and mic sample buffers were being interleaved into a fixed-format WAV without conversion. ScreenCaptureKit's finalized MP4 remains the recorded audio source. Separate mic/system tracks and a format-aware level meter remain open. Keyframe selection and some focus edits are currently editor-session state; persistence and undo are later work.

Native runtime check (2026-11-07): launched `pnpm tauri dev`, recorded an 18.6-second test session with the default MacBook Air microphone selected and system audio enabled, and opened the resulting project in the editor. The MP4 is non-empty and contains H.264 video plus a 48 kHz stereo AAC audio stream; `cursor.jsonl` was empty because no cursor movement occurred. This proves the app can complete a native recording and produce an MP4 audio stream, but not that spoken microphone audio was audible because no speech was supplied. The generated `audio.wav` sidecar measured about 55.4 seconds for an 18.5-second MP4, confirming the two raw callback streams were incorrectly concatenated. Removed this invalid sidecar path and its dependent meter. Retest audio with spoken input; separate tracks and a format-aware meter remain outstanding.

## Zoom persistence and transformed export increment

Implemented: editing a zoom block now updates its saved keyframe after a short debounce, with writes serialized in the frontend and `project.json` replaced atomically. The exporter now invokes FFmpeg against the source recording, applies project trims and a smooth keyframed camera crop, optionally maps source audio, reports encoder errors/progress, supports cancellation, and refuses to overwrite existing outputs or the source. The export dialog no longer fabricates progress or success paths. Preset copy now identifies VP9 WebM as opaque and GIF as 30fps.

Validation: frontend build/lint, Rust check, Clippy with warnings denied, and formatting passed. Export was not exercised against a fresh recording, so FFmpeg filter behavior, audio retention, and visual preview/export parity remain unverified. Canvas backgrounds, cursor overlays, webcam, speed ramps, and exact spring-physics parity are not included in this export increment; stable zoom IDs, undo, full project autosave/migration, and duration/reset semantics remain open.

## Project styling persistence increment

Implemented: Rust project schema now carries the frontend canvas settings (including audio, webcam, keystroke, subtitle, and window padding options). The editor loads those settings, spring physics, saved trims, and speed ramps from the recording bundle; canvas/spring edits are debounced back to `project.json`. A backend write lock serializes config mutations so settings saves cannot race zoom, trim, or speed-ramp writes. Auto-framing and speed-ramp failure paths no longer fabricate sample results; subtitle commands report when no real transcript is available. Microphone enumeration no longer invents a default device. The VP9 preset is named as opaque WebM rather than transparent.

Validation: frontend build/lint, Rust check, Clippy with warnings denied, and formatting passed. Runtime save/reopen behavior was not exercised. Export still does not render canvas styling, cursor, webcam, subtitles, or speed ramps; full project migration and atomic-write recovery remain open.

## Editor interface cleanup

Implemented: replaced the single long styling inspector with Canvas, Cursor, Overlays, and Audio tabs. Moved Auto frame into the timeline editing toolbar, reducing persistent controls in the capture header. The recording-time audio meter was removed because it depended on interpreting raw ScreenCaptureKit buffers as fixed-format PCM; reintroduce it after format-aware metering is implemented.

Validation: frontend production build and lint passed. The updated tab selection and cursor settings are visible in the running web preview; the preview is not a native Tauri runtime, so OS-bound controls still need checking in the desktop app.

## Capture and editing workflow separation

Implemented: the capture screen now presents the selected display and audio sources with one central Record action. While recording, it shows elapsed time and captured frames with a central Stop action. Once the recording media is loaded, the app switches to the editor; source controls leave the editor toolbar, which keeps Export available. The timeline now labels Zoom, Clip, and Captions tracks and shows an inline hint for adding the first zoom by double-clicking the Zoom track.

Validation: frontend production build and lint passed. The capture screen is visually verified in the web preview; recording and the transition to a real editor project still require the native Tauri runtime and a fresh recording.

## Recording deletion and live camera easing

Implemented: editor toolbar has a Delete action with a confirmation dialog that explains permanent removal. The backend only removes a valid `.mcam` recording bundle that is a direct child of the MotionCam recordings directory, and refuses to delete an active recording. Live preview camera motion now follows the active zoom target through an animation-frame spring, preserving velocity between frames and removing the extra CSS transform transition.

Validation: frontend build/lint and Rust check/Clippy/format passed. The zoom motion and delete flow still need native playback verification with a real project. Export interpolation remains a separate renderer and may not yet match the live spring exactly.
