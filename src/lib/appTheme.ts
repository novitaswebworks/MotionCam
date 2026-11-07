import { useEffect, useState } from "react";

export const APP_THEMES = [
  { id: "midnight", label: "Midnight" },
  { id: "paper", label: "Paper" },
  { id: "graphite", label: "Graphite" },
  { id: "forest", label: "Forest" },
] as const;

export type AppTheme = (typeof APP_THEMES)[number]["id"];

const STORAGE_KEY = "motioncam.app-theme";

function isAppTheme(value: string | null): value is AppTheme {
  return APP_THEMES.some((theme) => theme.id === value);
}

function readInitialTheme(): AppTheme {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // The default theme still works when local storage is unavailable.
  }

  const theme = isAppTheme(saved) ? saved : "midnight";
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function useAppTheme() {
  const [theme, setTheme] = useState<AppTheme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Theme selection remains active for the current session.
    }
  }, [theme]);

  return { theme, setTheme };
}
