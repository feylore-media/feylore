import type { TypographyPreferences } from "../adapter/types";

const STORAGE_KEY = "feylore.reader.preferences";

export const DEFAULT_TYPOGRAPHY: Required<
  Pick<TypographyPreferences, "fontFamily" | "fontSize" | "lineHeight" | "theme">
> = {
  fontFamily: "Georgia, serif",
  fontSize: 100,
  lineHeight: 1.5,
  theme: "light",
};

export function loadTypographyPreferences(): TypographyPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TYPOGRAPHY };
    const parsed = JSON.parse(raw) as TypographyPreferences;
    return { ...DEFAULT_TYPOGRAPHY, ...parsed };
  } catch {
    return { ...DEFAULT_TYPOGRAPHY };
  }
}

export function saveTypographyPreferences(prefs: TypographyPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
