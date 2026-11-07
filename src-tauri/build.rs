fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-search=native=/Library/Developer/CommandLineTools/usr/lib/swift/macosx");
        println!("cargo:rustc-link-search=native=/usr/lib/swift");
        println!("cargo:rustc-link-arg=-Wl,-rpath,/Library/Developer/CommandLineTools/usr/lib/swift/macosx");
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }

    tauri_build::build();
}
