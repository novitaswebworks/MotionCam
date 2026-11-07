//! Locating FFmpeg and picking an H.264 encoder that the installed build has.

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

#[cfg(windows)]
const FFMPEG_EXE: &str = "ffmpeg.exe";
#[cfg(not(windows))]
const FFMPEG_EXE: &str = "ffmpeg";

/// FFmpeg to run: `MOTIONCAM_FFMPEG`, then a copy shipped beside the app,
/// then whatever `ffmpeg` is on PATH.
pub fn ffmpeg_path() -> PathBuf {
    if let Some(path) = std::env::var_os("MOTIONCAM_FFMPEG")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        return path;
    }
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(PathBuf::from))
    {
        for candidate in [dir.join(FFMPEG_EXE), dir.join("resources").join(FFMPEG_EXE)] {
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    PathBuf::from(FFMPEG_EXE)
}

/// A command for FFmpeg that does not flash a console window on Windows.
pub fn ffmpeg_command() -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut command = Command::new(ffmpeg_path());
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }
    #[cfg(not(windows))]
    {
        Command::new(ffmpeg_path())
    }
}

/// Arguments that select the best available H.264 encoder.
pub fn h264_args() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        return &["-c:v", "h264_videotoolbox", "-b:v", "24M"];
    }
    static ENCODERS: OnceLock<String> = OnceLock::new();
    let encoders = ENCODERS.get_or_init(|| {
        ffmpeg_command()
            .args(["-hide_banner", "-encoders"])
            .output()
            .map(|out| String::from_utf8_lossy(&out.stdout).into_owned())
            .unwrap_or_default()
    });
    choose_h264_args(encoders)
}

/// `libx264` gives the best quality but only ships in GPL builds. LGPL builds
/// still have Media Foundation (`h264_mf`) on Windows, so fall back to that.
fn choose_h264_args(encoder_listing: &str) -> &'static [&'static str] {
    if !encoder_listing.contains("libx264") && encoder_listing.contains("h264_mf") {
        &["-c:v", "h264_mf", "-b:v", "24M"]
    } else {
        &["-c:v", "libx264", "-preset", "fast", "-crf", "18"]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_libx264_when_available() {
        let listing = " V....D libx264  H.264\n V....D h264_mf  H264 via MediaFoundation";
        assert_eq!(choose_h264_args(listing)[1], "libx264");
    }

    #[test]
    fn falls_back_to_media_foundation_on_lgpl_builds() {
        let listing = " V....D h264_mf  H264 via MediaFoundation\n V....D h264_nvenc NVIDIA";
        assert_eq!(choose_h264_args(listing)[1], "h264_mf");
    }

    #[test]
    fn defaults_to_libx264_when_listing_is_unreadable() {
        assert_eq!(choose_h264_args("")[1], "libx264");
    }
}
