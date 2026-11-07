# Contributing to MotionCam

Thanks for helping make MotionCam a useful free alternative to Screen Studio. The project is early, and clear reports and careful testing are as valuable as code.

## Before starting

1. Check the [open issues](https://github.com/novitaswebworks/MotionCam/issues) and [implementation plan](IMPLEMENTATION_PLAN.md).
2. For a large change, open an issue first so the scope and acceptance criteria are clear.
3. Do not include recordings, screenshots, logs, or project bundles containing personal information unless you have reviewed and intentionally sanitized them.

## Development setup

```bash
pnpm install
pnpm tauri dev
```

Native screen capture currently requires macOS 15 or newer. Windows and Linux capture are not implemented, so do not present those platforms as supported in a contribution or release note.

## Before opening a pull request

Run the checks that apply to your change:

```bash
pnpm run build
pnpm run lint
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
```

For capture, media, or export changes, include the platform and real-media scenario you verified. Build success alone does not prove recording, audio synchronization, cursor timing, or export correctness. Never overwrite raw source recordings; edits belong in project metadata or rendered outputs.

## Pull request checklist

- Explain the user problem and the behavior changed.
- Link the related issue, if there is one.
- List checks run and any runtime scenarios that remain unverified.
- Add before/after screenshots for user-interface changes when useful.
- Keep each change focused and update documentation when feature status or support changes.

## Code and communication

Use the existing React/TypeScript and Rust patterns, keep Rust and TypeScript project data contracts aligned, and make unsupported behavior explicit. Be respectful, specific, and open to feedback. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
