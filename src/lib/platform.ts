/** Operating system the webview is running on; used only for user-facing wording. */
export const isWindows = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

export const osName = isWindows ? "Windows" : "macOS";

export const settingsAppName = isWindows ? "Windows Settings" : "macOS Settings";
