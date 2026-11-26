import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { formatUserHandle } from "@shared/user-identity";
import { api } from "../api";
import { useAuth } from "../auth-context";
import { useInstance } from "../instance-context";
import { UserAvatar } from "../../components/users";
import { ProfileName } from "../../components/profile/ProfileName";
import { ARTIFACT_TYPE_LIST } from "../../components/profile/artifactRegistry";
import profileStyles from "../../components/profile/profile.module.css";
import styles from "./pages.module.css";
import {
  PROFILE_USERNAME_ACCENT_STYLES,
  PROFILE_USERNAME_PALETTE,
  PROFILE_USERNAME_STYLES,
  profileColorContrastError,
  type ProfileArtifactSize,
  type ProfileArtifactType,
  type ProfileCosmetics,
  type ProfileUsernameStyle,
} from "@shared/profile-platform";

type Section = "profile" | "customize" | "appearance" | "guestbook";

const SECTIONS: Section[] = ["profile", "customize", "appearance", "guestbook"];

const COLOR_DEFAULT = "default";

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value);
}

interface ExtendedRow {
  pronouns: string | null;
  bannerFileId: string | null;
  accent: string | null;
  cardStyle: string | null;
  heroTreatment: string | null;
  surfaceTreatment: string | null;
  customCss: string | null;
  cosmetics: ProfileCosmetics;
  guestbookEnabled: boolean;
}

interface ArtifactRow {
  id: string;
  artifactType: ProfileArtifactType;
  config: Record<string, unknown>;
  sortOrder: number;
  size: ProfileArtifactSize;
  isVisible: boolean;
}

interface LinkRow {
  id: string;
  label: string;
  url: string;
  sortOrder: number;
}

export function SettingsProfilePage() {
  const { t } = useTranslation("settings");
  const { customCssEnabled } = useInstance().profiles;
  const [searchParams, setSearchParams] = useSearchParams();
  const [section, setSection] = useState<Section>(() => {
    const next = searchParams.get("section");
    return next && (SECTIONS as string[]).includes(next) ? (next as Section) : "profile";
  });
  const [extended, setExtended] = useState<ExtendedRow | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const next = searchParams.get("section");
    if (next && (SECTIONS as string[]).includes(next)) setSection(next as Section);
  }, [searchParams]);

  const selectSection = (key: Section) => {
    setSection(key);
    setSearchParams(key === "profile" ? {} : { section: key });
  };

  const load = useCallback(async () => {
    const res = await api<{
      data: {
        profile: ExtendedRow;
        links: LinkRow[];
        artifacts: ArtifactRow[];
      };
    }>("/profiles/me/extended");
    setExtended(res.data.profile);
    setLinks(res.data.links);
    setArtifacts(res.data.artifacts.slice().sort((a, b) => a.sortOrder - b.sortOrder));
  }, []);

  useEffect(() => {
    void load().catch(() => setMessage("Could not load profile."));
  }, [load]);

  async function saveExtended(patch: Partial<ExtendedRow>) {
    setMessage(null);
    try {
      const res = await api<{ data: ExtendedRow }>("/profiles/me", {
        method: "PATCH",
        body: JSON.stringify({
          pronouns: patch.pronouns ?? undefined,
          accent: patch.accent ?? undefined,
          cardStyle: patch.cardStyle ?? undefined,
          heroTreatment: patch.heroTreatment ?? undefined,
          surfaceTreatment: patch.surfaceTreatment ?? undefined,
          customCss: patch.customCss ?? undefined,
          cosmetics: patch.cosmetics ?? undefined,
          guestbookEnabled: patch.guestbookEnabled,
        }),
      });
      setExtended(res.data);
      setMessage(t("profileSaved", { defaultValue: "Profile updated." }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save profile.");
    }
  }

  return (
    <div>
      <h2>{t("profileSettings", { defaultValue: "Profile" })}</h2>
      <nav aria-label="Profile sections" style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        {SECTIONS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => selectSection(key)}
            aria-pressed={section === key}
            style={{ fontWeight: section === key ? 700 : 400 }}
          >
            {key}
          </button>
        ))}
      </nav>
      {message && (
        <p role="status" className={styles.settingsMessage}>
          {message}
        </p>
      )}
      {!extended ? (
        <p>Loading…</p>
      ) : (
        <>
          {section === "profile" && (
            <ProfileSection extended={extended} links={links} onReload={() => void load()} onSave={saveExtended} />
          )}
          {section === "customize" && (
            <CustomizeSection artifacts={artifacts} onReload={() => void load()} />
          )}
          {section === "appearance" && (
            <AppearanceSection
              extended={extended}
              onSave={saveExtended}
              customCssEnabled={customCssEnabled}
            />
          )}
          {section === "guestbook" && (
            <GuestbookPrefsSection extended={extended} onSave={saveExtended} />
          )}
        </>
      )}
    </div>
  );
}

function ProfileSection({
  extended,
  links,
  onReload,
  onSave,
}: {
  extended: ExtendedRow;
  links: LinkRow[];
  onReload: () => void;
  onSave: (patch: Partial<ExtendedRow>) => void;
}) {
  const [pronouns, setPronouns] = useState(extended.pronouns ?? "");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    await api("/profiles/me/links", {
      method: "POST",
      body: JSON.stringify({ label: label.trim(), url: url.trim() }),
    });
    setLabel("");
    setUrl("");
    onReload();
  }

  async function deleteLink(id: string) {
    await api(`/profiles/me/links/${id}`, { method: "DELETE" });
    onReload();
  }

  async function moveLink(id: string, direction: -1 | 1) {
    const ordered = links.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((l) => l.id === id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
    const next = ordered.slice();
    const [moved] = next.splice(index, 1);
    next.splice(swapIndex, 0, moved!);
    await api("/profiles/me/links/reorder", {
      method: "PUT",
      body: JSON.stringify({ orderedIds: next.map((l) => l.id) }),
    });
    onReload();
  }

  return (
    <div>
      <p className={styles.lead}>
        Avatar, banner, display name, username, and bio live in account settings and privacy stays authoritative under
        privacy settings. This section holds pronouns and external links.
      </p>
      <div className={styles.settingsField}>
        <label htmlFor="profile-pronouns">Pronouns</label>
        <input
          id="profile-pronouns"
          value={pronouns}
          maxLength={64}
          onChange={(e) => setPronouns(e.target.value)}
          placeholder="she/her"
        />
        <button type="button" onClick={() => onSave({ pronouns: pronouns.trim() || null })}>
          Save pronouns
        </button>
      </div>
      <section>
        <h3>External links</h3>
        <ul className={styles.list}>
          {links.map((link) => (
            <li key={link.id} className={styles.listItem}>
              <strong>{link.label}</strong> · {link.url}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button type="button" onClick={() => void moveLink(link.id, -1)}>
                  Up
                </button>
                <button type="button" onClick={() => void moveLink(link.id, 1)}>
                  Down
                </button>
                <button type="button" onClick={() => void deleteLink(link.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => void addLink(e)}>
          <div className={styles.settingsField}>
            <label htmlFor="link-label">Label</label>
            <input id="link-label" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} />
          </div>
          <div className={styles.settingsField}>
            <label htmlFor="link-url">URL (https)</label>
            <input
              id="link-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://example.com"
            />
          </div>
          <button type="submit">Add link</button>
        </form>
      </section>
    </div>
  );
}

function CustomizeSection({ artifacts, onReload }: { artifacts: ArtifactRow[]; onReload: () => void }) {
  const [newType, setNewType] = useState<ProfileArtifactType>("favorites");
  const [newSize, setNewSize] = useState<ProfileArtifactSize>("medium");

  async function addArtifact() {
    await api("/profiles/me/artifacts", {
      method: "POST",
      body: JSON.stringify({ artifactType: newType, size: newSize, config: defaultConfigFor(newType), isVisible: true }),
    });
    onReload();
  }

  async function toggleVisibility(row: ArtifactRow) {
    await api(`/profiles/me/artifacts/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isVisible: !row.isVisible }),
    });
    onReload();
  }

  async function remove(row: ArtifactRow) {
    await api(`/profiles/me/artifacts/${row.id}`, { method: "DELETE" });
    onReload();
  }

  async function move(row: ArtifactRow, direction: -1 | 1) {
    const ordered = artifacts.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((a) => a.id === row.id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
    const next = ordered.slice();
    const [moved] = next.splice(index, 1);
    next.splice(swapIndex, 0, moved!);
    await api("/profiles/me/artifacts/reorder", {
      method: "PUT",
      body: JSON.stringify({ orderedIds: next.map((a) => a.id) }),
    });
    onReload();
  }

  async function changeSize(row: ArtifactRow, size: ProfileArtifactSize) {
    await api(`/profiles/me/artifacts/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ size }),
    });
    onReload();
  }

  return (
    <div>
      <p className={styles.lead}>
        Preview resembles the actual profile. Add, hide, reorder, resize, and configure artifacts. Mobile collapses by
        artifact order.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "end" }}>
        <label>
          Artifact{" "}
          <select value={newType} onChange={(e) => setNewType(e.target.value as ProfileArtifactType)}>
            {ARTIFACT_TYPE_LIST.map((def) => (
              <option key={def.type} value={def.type}>
                {def.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Size{" "}
          <select value={newSize} onChange={(e) => setNewSize(e.target.value as ProfileArtifactSize)}>
            <option value="small">small</option>
            <option value="medium">medium</option>
            <option value="wide">wide</option>
          </select>
        </label>
        <button type="button" onClick={() => void addArtifact()}>
          Add artifact
        </button>
      </div>
      <div className={profileStyles.profileComposerGrid} aria-label="Artifact preview">
        {artifacts.map((row) => (
          <div
            key={row.id}
            className={`${profileStyles.profileComposerItem} ${profileStyles[`profile-artifact--${row.size}`] ?? ""}`}
          >
            <strong>{row.artifactType}</strong>
            <span> · {row.size} · {row.isVisible ? "visible" : "hidden"}</span>
            <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
              <button type="button" onClick={() => void toggleVisibility(row)}>
                {row.isVisible ? "Hide" : "Show"}
              </button>
              <button type="button" onClick={() => void move(row, -1)}>
                Up
              </button>
              <button type="button" onClick={() => void move(row, 1)}>
                Down
              </button>
              <button type="button" onClick={() => void remove(row)}>
                Remove
              </button>
              {(["small", "medium", "wide"] as ProfileArtifactSize[]).map((size) => (
                <button key={size} type="button" onClick={() => void changeSize(row, size)} disabled={row.size === size}>
                  {size}
                </button>
              ))}
            </div>
            <ArtifactConfigEditor row={row} onReload={onReload} />
          </div>
        ))}
      </div>
    </div>
  );
}

function defaultConfigFor(type: ProfileArtifactType): Record<string, unknown> {
  switch (type) {
    case "favorites":
      return { limit: 6 };
    case "favorite-quote":
      return { quote: "", source: "" };
    case "shelf":
    case "shelf-preview":
      return {};
    case "club":
      return {};
    case "favorite-person":
      return {};
    default:
      return {};
  }
}

function ArtifactConfigEditor({ row, onReload }: { row: ArtifactRow; onReload: () => void }) {
  const [text, setText] = useState(() => JSON.stringify(row.config ?? {}, null, 2));
  useEffect(() => setText(JSON.stringify(row.config ?? {}, null, 2)), [row.id, row.config]);

  async function save() {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      await api(`/profiles/me/artifacts/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ config: parsed }),
      });
      onReload();
    } catch {
      // Invalid JSON: ignore; user can correct.
    }
  }

  if (row.artifactType !== "favorite-quote" && row.artifactType !== "shelf" && row.artifactType !== "shelf-preview" && row.artifactType !== "club" && row.artifactType !== "favorite-person" && row.artifactType !== "favorites") {
    return null;
  }

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <label htmlFor={`config-${row.id}`}>Configuration (JSON)</label>
      <textarea
        id={`config-${row.id}`}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ width: "100%" }}
      />
      <button type="button" onClick={() => void save()}>
        Save config
      </button>
    </div>
  );
}

function AppearanceSection({
  extended,
  onSave,
  customCssEnabled,
}: {
  extended: ExtendedRow;
  onSave: (patch: Partial<ExtendedRow>) => void;
  customCssEnabled: boolean;
}) {
  const { user, profile } = useAuth();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [cosmetics, setCosmetics] = useState<ProfileCosmetics>(() => ({
    usernameStyle: extended.cosmetics.usernameStyle,
    usernameColor: extended.cosmetics.usernameColor ?? null,
    usernameAccentColor: extended.cosmetics.usernameAccentColor ?? null,
  }));
  const [accent, setAccent] = useState(extended.accent ?? "");
  const [cardStyle, setCardStyle] = useState(extended.cardStyle ?? "flat");
  const [heroTreatment, setHeroTreatment] = useState(extended.heroTreatment ?? "banner");
  const [surfaceTreatment, setSurfaceTreatment] = useState(extended.surfaceTreatment ?? "default");
  const [customCss, setCustomCss] = useState(extended.customCss ?? "");

  return (
    <div>
      <p className={styles.lead}>
        Accent, card style, hero, and surface use theme tokens. Advanced CSS is scoped to the profile content root and
        sanitized.
      </p>
      <NameStylePreview
        user={{
          username: user?.username ?? "",
          displayName: user?.displayName ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
        }}
        pronouns={extended.pronouns}
        cosmetics={cosmetics}
        theme={theme}
        onThemeChange={setTheme}
      />
      <NameStyleEditor cosmetics={cosmetics} onChange={setCosmetics} onSave={onSave} />
      <div className={styles.settingsField}>
        <label htmlFor="profile-accent">Accent</label>
        <input id="profile-accent" value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#7c5cff" />
      </div>
      <div className={styles.settingsField}>
        <label htmlFor="profile-card">Card style</label>
        <select id="profile-card" value={cardStyle} onChange={(e) => setCardStyle(e.target.value)}>
          <option value="flat">flat</option>
          <option value="outlined">outlined</option>
          <option value="soft">soft</option>
        </select>
      </div>
      <div className={styles.settingsField}>
        <label htmlFor="profile-hero">Hero treatment</label>
        <select id="profile-hero" value={heroTreatment} onChange={(e) => setHeroTreatment(e.target.value)}>
          <option value="banner">banner</option>
          <option value="minimal">minimal</option>
          <option value="compact">compact</option>
        </select>
      </div>
      <div className={styles.settingsField}>
        <label htmlFor="profile-surface">Surface treatment</label>
        <select id="profile-surface" value={surfaceTreatment} onChange={(e) => setSurfaceTreatment(e.target.value)}>
          <option value="default">default</option>
          <option value="paper">paper</option>
          <option value="contrast">contrast</option>
        </select>
      </div>
      <button
        type="button"
        onClick={() =>
          onSave({
            accent: accent.trim() || null,
            cardStyle,
            heroTreatment,
            surfaceTreatment,
          })
        }
      >
        Save appearance
      </button>
      {customCssEnabled && (
        <div className={styles.settingsField} style={{ marginTop: "1rem" }}>
          <label htmlFor="profile-css">Advanced CSS (scoped to .profile)</label>
          <textarea
            id="profile-css"
            rows={10}
            value={customCss}
            onChange={(e) => setCustomCss(e.target.value)}
            style={{ width: "100%", fontFamily: "monospace" }}
            placeholder={".profile {}\n.profile-hero {}\n.profile-artifact {}"}
          />
          <p className={styles.lead}>
            Existing CSS keeps applying if this editor is disabled instance-wide. Allowed selectors: .profile,
            .profile-hero, .profile-identity, .profile-links, .profile-artifacts, .profile-artifact,
            .profile-artifact--obsessions, .profile-artifact--quote, .profile-artifact--favorites. External resources,
            fixed overlays, and app internals are stripped.
          </p>
          <button type="button" onClick={() => onSave({ customCss: customCss.trim() || null })}>
            Save CSS
          </button>
        </div>
      )}
    </div>
  );
}

function NameStylePreview({
  user,
  pronouns,
  cosmetics,
  theme,
  onThemeChange,
}: {
  user: { username: string; displayName: string | null; avatarUrl: string | null };
  pronouns: string | null;
  cosmetics: ProfileCosmetics;
  theme: "dark" | "light";
  onThemeChange: (theme: "dark" | "light") => void;
}) {
  const { t } = useTranslation("settings");
  const presence = t("nameStylePresence", {
    defaultValue: "Currently reading · The Left Hand of Darkness",
  });
  return (
    <section aria-label="Display name preview" className={styles.nameStylePreviewWrap}>
      <div className={styles.themeToggleRow}>
        <span>{t("nameStylePreview", { defaultValue: "Preview" })}</span>
        <div role="group" aria-label="Preview theme">
          <button
            type="button"
            aria-pressed={theme === "dark"}
            onClick={() => onThemeChange("dark")}
          >
            {t("themeDark", { defaultValue: "Dark" })}
          </button>
          <button
            type="button"
            aria-pressed={theme === "light"}
            onClick={() => onThemeChange("light")}
          >
            {t("themeLight", { defaultValue: "Light" })}
          </button>
        </div>
      </div>
      <div className={styles.nameStylePreview} data-theme={theme}>
        <span className={styles.nameStylePreviewCard}>
          <UserAvatar
            displayName={user.displayName ?? ""}
            username={user.username}
            avatarUrl={user.avatarUrl}
            size="lg"
          />
          <span className={styles.nameStylePreviewText}>
            <span className={styles.nameStylePreviewName}>
              <ProfileName
                user={{ username: user.username, displayName: user.displayName, cosmetics }}
                size="lg"
              />
              {pronouns && (
                <span className={styles.nameStylePronouns}> {pronouns}</span>
              )}
            </span>
            <span className={styles.nameStyleHandle}>{formatUserHandle(user.username)}</span>
            <span className={styles.nameStylePresence}>
              <span className={styles.nameStylePresenceDot} aria-hidden />
              {presence}
            </span>
          </span>
        </span>
      </div>
    </section>
  );
}

function NameStyleEditor({
  cosmetics,
  onChange,
  onSave,
}: {
  cosmetics: ProfileCosmetics;
  onChange: (next: ProfileCosmetics) => void;
  onSave: (patch: Partial<ExtendedRow>) => void;
}) {
  const [style, setStyle] = useState<ProfileUsernameStyle>(cosmetics.usernameStyle);
  const [colorHex, setColorHex] = useState(cosmetics.usernameColor ?? "");
  const [accentHex, setAccentHex] = useState(cosmetics.usernameAccentColor ?? "");

  useEffect(() => {
    setStyle(cosmetics.usernameStyle);
    setColorHex(cosmetics.usernameColor ?? "");
    setAccentHex(cosmetics.usernameAccentColor ?? "");
  }, [cosmetics]);

  const showAccent = PROFILE_USERNAME_ACCENT_STYLES.has(style);
  const color = cosmetics.usernameColor ?? COLOR_DEFAULT;
  const accentColor = cosmetics.usernameAccentColor ?? COLOR_DEFAULT;
  const colorWarning = isHexColor(color) ? profileColorContrastError(color) : null;
  const accentWarning = isHexColor(accentColor) ? profileColorContrastError(accentColor) : null;

  const selectColor = (value: string) =>
    onChange({
      ...cosmetics,
      usernameColor: value === COLOR_DEFAULT ? null : value,
    });
  const selectAccent = (value: string) =>
    onChange({
      ...cosmetics,
      usernameAccentColor: value === COLOR_DEFAULT ? null : value,
    });
  const selectStyle = (value: ProfileUsernameStyle) =>
    onChange({ ...cosmetics, usernameStyle: value });

  return (
    <section>
      <h3>Display name</h3>
      <p className={styles.lead}>
        Style the display name shown at the top of your profile. The @username, pronouns, and other mentions are never
        restyled.
      </p>
      <div className={styles.settingsField}>
        <label>Style</label>
        <div className={styles.styleOptions}>
          {PROFILE_USERNAME_STYLES.map((option) => (
            <button
              key={option}
              type="button"
              className={styles.styleOption}
              aria-pressed={style === option}
              onClick={() => selectStyle(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.settingsField}>
        <label htmlFor="name-color-hex">Color (palette or custom hex)</label>
        <div className={styles.swatchGrid}>
          {PROFILE_USERNAME_PALETTE.map((option) => (
            <button
              key={option.key}
              type="button"
              title={option.key}
              aria-label={option.key}
              aria-pressed={color === option.key}
              className={`${styles.swatch} ${option.token ? "" : styles.swatchDefault}`}
              style={option.token ? { background: `var(${option.token})` } : undefined}
              onClick={() => selectColor(option.key)}
            />
          ))}
        </div>
        <input
          id="name-color-hex"
          value={colorHex}
          maxLength={9}
          placeholder="#aabbcc"
          style={{ marginTop: "var(--space-2)" }}
          onChange={(e) => {
            const value = e.target.value;
            setColorHex(value);
            if (isHexColor(value)) selectColor(value);
          }}
        />
        {colorWarning && <p className={styles.contrastWarning}>{colorWarning}</p>}
      </div>
      {showAccent && (
        <div className={styles.settingsField}>
          <label htmlFor="name-accent-hex">Accent color (for {style})</label>
          <div className={styles.swatchGrid}>
            {PROFILE_USERNAME_PALETTE.map((option) => (
              <button
                key={option.key}
                type="button"
                title={option.key}
                aria-label={option.key}
                aria-pressed={accentColor === option.key}
                className={`${styles.swatch} ${option.token ? "" : styles.swatchDefault}`}
                style={option.token ? { background: `var(${option.token})` } : undefined}
                onClick={() => selectAccent(option.key)}
              />
            ))}
          </div>
          <input
            id="name-accent-hex"
            value={accentHex}
            maxLength={9}
            placeholder="#aabbcc"
            style={{ marginTop: "var(--space-2)" }}
            onChange={(e) => {
              const value = e.target.value;
              setAccentHex(value);
              if (isHexColor(value)) selectAccent(value);
            }}
          />
          {accentWarning && <p className={styles.contrastWarning}>{accentWarning}</p>}
        </div>
      )}
      <button type="button" onClick={() => onSave({ cosmetics })}>
        Save name style
      </button>
    </section>
  );
}

function GuestbookPrefsSection({
  extended,
  onSave,
}: {
  extended: ExtendedRow;
  onSave: (patch: Partial<ExtendedRow>) => void;
}) {
  return (
    <div>
      <p className={styles.lead}>Guestbook is deliberately simple: no threads, attachments, or reactions.</p>
      <label>
        <input
          type="checkbox"
          checked={extended.guestbookEnabled}
          onChange={(e) => onSave({ guestbookEnabled: e.target.checked })}
        />{" "}
        Enable guestbook
      </label>
    </div>
  );
}
