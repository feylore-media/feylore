import { z } from "zod";

/**
 * Profile name cosmetics — the safe, constrained customization surface for a
 * user's display name on their own profile.
 *
 * Modeled as a namespaced cosmetics object (not flat columns) so future
 * cosmetic classes (avatar frames, profile backgrounds, banners) extend the
 * same object without renaming columns. Styles are predefined presentation
 * classes; colors are palette tokens or validated custom hex values.
 *
 * Cosmetic values describe presentation of the prominent display name only.
 * The `@handle` and pronouns are never restyled; cosmetics never alter the
 * canonical identity (`users.display_name`).
 */

export const PROFILE_USERNAME_STYLES = [
  "default",
  "serif",
  "italic",
  "bold",
  "small-caps",
  "gradient",
  "shimmer",
] as const;
export type ProfileUsernameStyle = (typeof PROFILE_USERNAME_STYLES)[number];

/** Styles that render a second color as part of their treatment. */
export const PROFILE_USERNAME_ACCENT_STYLES: ReadonlySet<ProfileUsernameStyle> =
  new Set(["gradient", "shimmer"]);

export const PROFILE_USERNAME_PALETTE_KEYS = [
  "default",
  "accent",
  "rose",
  "gold",
  "mauve",
  "text",
  "muted",
] as const;
export type ProfileUsernamePaletteKey =
  (typeof PROFILE_USERNAME_PALETTE_KEYS)[number];

/**
 * Curated palette. `token` maps to a semantic theme variable that is safe in
 * both dark and light themes; `null` ("default") means theme text color.
 */
export const PROFILE_USERNAME_PALETTE: ReadonlyArray<{
  key: ProfileUsernamePaletteKey;
  token: string | null;
}> = [
  { key: "default", token: null },
  { key: "accent", token: "--color-accent" },
  { key: "rose", token: "--color-accent-rose" },
  { key: "gold", token: "--color-icon-identity-secondary" },
  { key: "mauve", token: "--color-accent-muted" },
  { key: "text", token: "--color-text" },
  { key: "muted", token: "--color-text-muted" },
];

export const PROFILE_USERNAME_COLOR_MAX = 16;

/** WCAG large-text threshold used as the floor for custom name colors. */
export const PROFILE_COLOR_CONTRAST_THRESHOLD = 3;

/**
 * Reference surfaces a custom color must stay readable against. Feylore's
 * profile surfaces are the dark theme paper and the light theme paper.
 */
export const PROFILE_COLOR_CONTRAST_SURFACES = ["#141318", "#f4f2f6"] as const;

export interface ProfileCosmetics {
  usernameStyle: ProfileUsernameStyle;
  usernameColor: string | null;
  usernameAccentColor: string | null;
}

export const DEFAULT_PROFILE_COSMETICS: ProfileCosmetics = {
  usernameStyle: "default",
  usernameColor: null,
  usernameAccentColor: null,
};

/** Parse `#rgb` / `#rrggbb` to RGB channels. Returns null for anything else. */
export function parseHexColor(
  value: string,
): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  let hex = match[1]!;
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((channel) => channel + channel)
      .join("");
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return { r, g, b };
}

/** Expand `#rgb` to `#rrggbb`; returns null for invalid values. */
export function normalizeHexColor(value: string): string | null {
  const parsed = parseHexColor(value);
  if (!parsed) return null;
  const channel = (c: number) => c.toString(16).padStart(2, "0");
  return `#${channel(parsed.r)}${channel(parsed.g)}${channel(parsed.b)}`;
}

function channelLuminance(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(value: string): number | null {
  const rgb = parseHexColor(value);
  if (!rgb) return null;
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/** WCAG contrast ratio between two hex colors (1–21). Null when invalid. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Human-readable failure when a hex color lacks contrast on profile surfaces. */
export function profileColorContrastError(hex: string): string | null {
  const worst = PROFILE_COLOR_CONTRAST_SURFACES.reduce((acc, surface) => {
    const ratio = contrastRatio(hex, surface);
    return ratio === null ? acc : Math.min(acc, ratio);
  }, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(worst) || worst < PROFILE_COLOR_CONTRAST_THRESHOLD) {
    return `Color does not contrast enough against profile backgrounds (${worst.toFixed(1)} < ${PROFILE_COLOR_CONTRAST_THRESHOLD.toFixed(1)}).`;
  }
  return null;
}

const HEX_PATTERN = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

/**
 * A name color is a palette key or a (contrast-validated) custom hex.
 * Palette tokens are deliberately accepted as-is: they are theme-owned
 * display colors, guaranteed safe in dark and light themes.
 */
export const profileUsernameColorSchema = z
  .string()
  .max(PROFILE_USERNAME_COLOR_MAX)
  .transform((value) => value.trim().toLowerCase())
  .superRefine((value, ctx) => {
    const isPaletteKey = PROFILE_USERNAME_PALETTE_KEYS.includes(
      value as ProfileUsernamePaletteKey,
    );
    const isHex = HEX_PATTERN.test(value);
    if (isPaletteKey) return;
    if (isHex) {
      const normalized = normalizeHexColor(value);
      if (normalized) {
        const error = profileColorContrastError(normalized);
        if (error) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
          return;
        }
      }
      return;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Choose a palette color or a hex color like #aab or #aabbcc",
    });
  })
  .transform((value) => {
    if (PROFILE_USERNAME_PALETTE_KEYS.includes(value as ProfileUsernamePaletteKey)) {
      return value;
    }
    return normalizeHexColor(value) ?? value;
  });

export type ProfileUsernameColor = z.infer<typeof profileUsernameColorSchema>;

export const cosmeticsUpdateSchema = z.object({
  usernameStyle: z.enum(PROFILE_USERNAME_STYLES).optional(),
  usernameColor: profileUsernameColorSchema.nullable().optional(),
  usernameAccentColor: profileUsernameColorSchema.nullable().optional(),
});

export type ProfileCosmeticsUpdate = z.infer<typeof cosmeticsUpdateSchema>;

export const cosmeticsSchema = z.object({
  usernameStyle: z.enum(PROFILE_USERNAME_STYLES).default("default"),
  usernameColor: profileUsernameColorSchema.nullable().default(null),
  usernameAccentColor: profileUsernameColorSchema.nullable().default(null),
});

/**
 * Coerce arbitrary stored/input JSON into a well-formed cosmetics object.
 * Unknown fields are dropped and invalid values fall back to defaults, so a
 * bad write can never break profile rendering. Values are not re-validated
 * against the theme here; the update schema enforces that at the boundary.
 */
export function normalizeProfileCosmetics(
  raw: unknown,
): ProfileCosmetics {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_PROFILE_COSMETICS };
  }
  const record = raw as Record<string, unknown>;
  const style = PROFILE_USERNAME_STYLES.includes(
    record.usernameStyle as ProfileUsernameStyle,
  )
    ? (record.usernameStyle as ProfileUsernameStyle)
    : "default";
  const color = normalizeNameColor(record.usernameColor);
  const accent = PROFILE_USERNAME_ACCENT_STYLES.has(style)
    ? normalizeNameColor(record.usernameAccentColor)
    : DEFAULT_PROFILE_COSMETICS.usernameAccentColor;
  return { usernameStyle: style, usernameColor: color, usernameAccentColor: accent };
}

function normalizeNameColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    PROFILE_USERNAME_PALETTE_KEYS.includes(trimmed as ProfileUsernamePaletteKey)
  ) {
    return trimmed.toLowerCase();
  }
  return normalizeHexColor(trimmed);
}