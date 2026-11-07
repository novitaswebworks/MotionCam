# Changelog

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
