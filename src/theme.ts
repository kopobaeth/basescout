export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const THEME_STORAGE_KEY = "basescout.theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "dark" || value === "light";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function updateThemeColor(theme: ResolvedTheme) {
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dark" ? "#000000" : "#f4f7fb"
  );
}

export function applyThemePreference(preference: ThemePreference, forceDark = false) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function apply(systemPrefersDark = media.matches) {
    const resolved = forceDark ? "dark" : resolveTheme(preference, systemPrefersDark);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved;
    updateThemeColor(resolved);
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Theme selection still works for the current page when storage is unavailable.
  }

  apply();

  if (preference !== "system" || forceDark) return () => undefined;

  const handleChange = (event: MediaQueryListEvent) => apply(event.matches);
  media.addEventListener("change", handleChange);
  return () => media.removeEventListener("change", handleChange);
}
