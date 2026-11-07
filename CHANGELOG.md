# Changelog

## v0.2.1

First Windows build of MotionCam. It is a test release: recording has been built and checked in CI but not yet run on a real Windows PC.

### Included

- Windows installer (x64) with FFmpeg bundled for export.
- Screen recording through Windows Graphics Capture, saved as H.264 without the cursor baked in.
- System sound and microphone recording, mixed into the video.
- Mouse and keystroke capture for cursor overlays and zoom targeting.
- Windows wording and Settings links in first-run setup.
- Export finds FFmpeg beside the app and uses Windows' built-in H.264 encoder when the FFmpeg build has no libx264.

### Known limitations

- The installer is not code-signed, so Windows SmartScreen will warn on first run.
- Windows records at the display's native resolution; the Full HD presets only change the frame rate.
- Recording and audio sync still need validation on real hardware, including multi-monitor and scaled displays.
- The macOS app is unchanged from v0.2.0.

## v0.2.0

First public universal macOS release of MotionCam.

### Included

- Universal macOS app bundle for Apple Silicon and Intel, with macOS 15 as the minimum supported version.
- Screen recording with system audio and selectable microphone input.
- Cursor capture, editor preview, timeline trimming, and manual or click-targeted zoom points with spring movement.
- First-run setup, multiple themes, and recording quality controls.
- MP4, ProRes, WebM, and GIF export paths.
- Public contributor workflow with CI, issue templates, and GitHub Discussions.

### Known limitations

- This release is ad-hoc signed and not notarized. Gatekeeper may require users to approve the first launch manually.
- Microphone audibility needs broader spoken-input validation.
- Preview and export do not yet share a complete composition renderer; styling, cursor overlay, webcam, subtitles, and speed ramps are not all present in exported video.
- Webcam capture, transcription, real audio waveforms, Windows capture, and Linux capture are not available yet.
