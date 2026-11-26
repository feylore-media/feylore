import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { useThemeContext } from "../../theme/ThemeProvider";
import { useEffect, useState, useCallback } from "react";
import { api, fetchSelfProfile, type SelfUserProfile } from "../api";
import { Link } from "react-router";
import { userProfilePath } from "../../routes/paths";
import { PROFILE_VISIBILITY } from "@shared/profile";
import { Button } from "../../components/primitives";
import styles from "./pages.module.css";
import { useAuth } from "../auth-context";
import {
  clearStoredDeviceId,
  getStoredDeviceId,
  setStoredDeviceId,
} from "../device-storage";

export function SettingsLayout() {
  const { t } = useTranslation(["settings", "common"]);
  const links = [
    ["account", "/settings/account"],
    ["profile", "/settings/profile"],
    ["appearance", "/settings/appearance"],
    ["language", "/settings/language"],
    ["privacy", "/settings/privacy"],
    ["notifications", "/settings/notifications"],
    ["devices", "/settings/devices"],
    ["reader", "/settings/reader"],
    ["metadata", "/settings/metadata"],
  ] as const;

  return (
    <div className={styles.settingsShell}>
      <nav className={styles.settingsSidebar} aria-label={t("common:settings")}>
        <div className={styles.settingsSidebarTitle}>
          {t("common:settings")}
        </div>
        {links.map(([key, to]) => (
          <NavLink
            key={key}
            to={to}
            end
            className={({ isActive }) =>
              isActive ? styles.settingsNavActive : undefined
            }
          >
            {t(key)}
          </NavLink>
        ))}
      </nav>
      <div className={styles.settingsContent}>
        <Outlet />
      </div>
    </div>
  );
}

export function SettingsAppearancePage() {
  const { t } = useTranslation("settings");
  const { preference, setPreference } = useThemeContext();
  const { refresh } = useAuth();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onThemeChange(next: "light" | "dark" | "system") {
    setPreference(next);
    setSaving(true);
    setMessage(null);
    try {
      await api("/settings/appearance", {
        method: "PATCH",
        body: JSON.stringify({ theme: next }),
      });
      await refresh();
      setMessage(t("appearanceSaved", { defaultValue: "Appearance saved." }));
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("appearanceSaveError", { defaultValue: "Could not save appearance." }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2>{t("appearance")}</h2>
      <label htmlFor="app-theme">
        {t("theme")}:{" "}
        <select
          id="app-theme"
          value={preference}
          disabled={saving}
          onChange={(e) =>
            void onThemeChange(e.target.value as "light" | "dark" | "system")
          }
        >
          <option value="system">{t("themeSystem")}</option>
          <option value="light">{t("themeLight")}</option>
          <option value="dark">{t("themeDark")}</option>
        </select>
      </label>
      {message && (
        <p className={styles.settingsMessage} role="status">
          {message}
        </p>
      )}
    </div>
  );
}

export function SettingsPrivacyPage() {
  const { t } = useTranslation("settings");
  const [activityVisibility, setActivityVisibility] = useState<
    "private" | "friends" | "public"
  >("private");
  const [profileVisibility, setProfileVisibility] = useState<"public" | "members" | "private">(
    "public",
  );
  const [presenceEnabled, setPresenceEnabled] = useState(true);
  const [presenceVisibility, setPresenceVisibility] = useState<"private" | "friends" | "public">(
    "private",
  );
  const [readerEnabled, setReaderEnabled] = useState(true);
  const [playerEnabled, setPlayerEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api<{
        data: {
          activityVisibility: "private" | "friends" | "public";
          profileVisibility: "public" | "members" | "private";
        };
      }>("/settings/privacy"),
      api<{
        data: {
          enabled: boolean;
          visibility: "private" | "friends" | "public";
          readerEnabled: boolean;
          playerEnabled: boolean;
        };
      }>("/settings/presence"),
    ])
      .then(([privacyRes, presenceRes]) => {
        setActivityVisibility(privacyRes.data.activityVisibility);
        setProfileVisibility(privacyRes.data.profileVisibility);
        setPresenceEnabled(presenceRes.data.enabled);
        setPresenceVisibility(presenceRes.data.visibility);
        setReaderEnabled(presenceRes.data.readerEnabled);
        setPlayerEnabled(presenceRes.data.playerEnabled);
      })
      .catch(() => {
        setActivityVisibility("private");
        setProfileVisibility("public");
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveActivity(next: "private" | "friends" | "public") {
    setActivityVisibility(next);
    setSaving(true);
    setMessage(null);
    try {
      await api("/settings/privacy", {
        method: "PATCH",
        body: JSON.stringify({ activityVisibility: next }),
      });
      setMessage(t("privacySaved", { defaultValue: "Privacy settings saved." }));
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("privacySaveError", { defaultValue: "Could not save privacy settings." }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveProfileVisibility(next: "public" | "members" | "private") {
    setProfileVisibility(next);
    setSaving(true);
    setMessage(null);
    try {
      await api("/settings/privacy", {
        method: "PATCH",
        body: JSON.stringify({ profileVisibility: next }),
      });
      setMessage(t("privacySaved", { defaultValue: "Privacy settings saved." }));
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("privacySaveError", { defaultValue: "Could not save privacy settings." }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function savePresence(patch: {
    enabled?: boolean;
    visibility?: "private" | "friends" | "public";
    readerEnabled?: boolean;
    playerEnabled?: boolean;
  }) {
    setSaving(true);
    setMessage(null);
    try {
      await api("/settings/presence", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setMessage(t("privacySaved", { defaultValue: "Privacy settings saved." }));
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("privacySaveError", { defaultValue: "Could not save privacy settings." }),
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h2>{t("privacy")}</h2>
        <p>{t("loading", { defaultValue: "Loading…" })}</p>
      </div>
    );
  }

  return (
    <div>
      <h2>{t("privacy")}</h2>
      <p className={styles.lead}>
        {t("privacyProfileHelp", {
          defaultValue:
            "Profile visibility is authoritative here. Public means any signed-in Feylore user; club members only means shared club members; private means only you.",
        })}
      </p>
      <div className={styles.settingsField}>
        <label htmlFor="profile-visibility-authoritative">{t("profileVisibility")}</label>
        <select
          id="profile-visibility-authoritative"
          value={profileVisibility}
          disabled={saving}
          onChange={(e) =>
            void saveProfileVisibility(e.target.value as "public" | "members" | "private")
          }
        >
          <option value="public">{t("visibilityPublic", { defaultValue: "Public" })}</option>
          <option value="members">{t("visibilityMembers", { defaultValue: "Club members only" })}</option>
          <option value="private">{t("visibilityPrivate", { defaultValue: "Private" })}</option>
        </select>
      </div>
      <p className={styles.lead}>{t("privacyActivityHelp")}</p>
      <div className={styles.settingsField}>
        <label htmlFor="activity-visibility">{t("activityVisibility")}</label>
        <select
          id="activity-visibility"
          value={activityVisibility}
          disabled={saving}
          onChange={(e) =>
            void saveActivity(e.target.value as "private" | "friends" | "public")
          }
        >
          <option value="private">{t("activityVisibilityPrivate")}</option>
          <option value="friends">{t("activityVisibilityFriends")}</option>
          <option value="public">{t("activityVisibilityPublic")}</option>
        </select>
      </div>
      {message && (
        <p className={styles.settingsMessage} role="status">
          {message}
        </p>
      )}
      <h3>{t("presenceTitle", { defaultValue: "Presence" })}</h3>
      <p className={styles.lead}>
        {t("presenceHelp", {
          defaultValue:
            "Show what you are reading, listening to, or watching on your profile. Enforced server-side.",
        })}
      </p>
      <div className={styles.settingsField}>
        <label>
          <input
            type="checkbox"
            checked={presenceEnabled}
            disabled={saving}
            onChange={(e) => {
              setPresenceEnabled(e.target.checked);
              void savePresence({ enabled: e.target.checked });
            }}
          />{" "}
          {t("presenceEnabled", { defaultValue: "Show my media activity" })}
        </label>
      </div>
      <div className={styles.settingsField}>
        <label htmlFor="presence-visibility">
          {t("presenceVisibility", { defaultValue: "Visibility" })}
        </label>
        <select
          id="presence-visibility"
          value={presenceVisibility}
          disabled={saving || !presenceEnabled}
          onChange={(e) => {
            const next = e.target.value as "private" | "friends" | "public";
            setPresenceVisibility(next);
            void savePresence({ visibility: next });
          }}
        >
          <option value="private">{t("activityVisibilityPrivate")}</option>
          <option value="friends">{t("activityVisibilityFriends")}</option>
          <option value="public">{t("activityVisibilityPublic")}</option>
        </select>
      </div>
      <div className={styles.settingsField}>
        <label>
          <input
            type="checkbox"
            checked={readerEnabled}
            disabled={saving || !presenceEnabled}
            onChange={(e) => {
              setReaderEnabled(e.target.checked);
              void savePresence({ readerEnabled: e.target.checked });
            }}
          />{" "}
          {t("presenceReader", { defaultValue: "Feylore Reader" })}
        </label>
      </div>
      <div className={styles.settingsField}>
        <label>
          <input
            type="checkbox"
            checked={playerEnabled}
            disabled={saving || !presenceEnabled}
            onChange={(e) => {
              setPlayerEnabled(e.target.checked);
              void savePresence({ playerEnabled: e.target.checked });
            }}
          />{" "}
          {t("presencePlayer", { defaultValue: "Feylore Player" })}
        </label>
      </div>
    </div>
  );
}

export function SettingsPlaceholderPage({ title }: { title: string }) {
  return <p>{title} settings are reserved for a future update.</p>;
}

export function SettingsAccountPage() {
  const { t } = useTranslation(["settings", "auth"]);
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<SelfUserProfile | null>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState("");
  const [profileVisibility, setProfileVisibility] = useState<
    SelfUserProfile["profileVisibility"]
  >(PROFILE_VISIBILITY.PUBLIC);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [methods, setMethods] = useState<{
    internal: boolean;
    oidc: boolean;
    recovery?: boolean;
    passwordReset?: boolean;
  } | null>(null);
  const [identities, setIdentities] = useState<
    Array<{
      id: string;
      providerKey: string;
      issuer: string;
      email: string | null;
      displayName: string | null;
      linkedAt: string;
      lastLoginAt: string | null;
    }>
  >([]);

  const loadIdentities = useCallback(async () => {
    try {
      const res = await api<{
        data: Array<{
          id: string;
          providerKey: string;
          issuer: string;
          email: string | null;
          displayName: string | null;
          linkedAt: string;
          lastLoginAt: string | null;
        }>;
      }>("/auth/identities");
      setIdentities(res.data);
    } catch {
      setIdentities([]);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetchSelfProfile();
      setProfile(res.data);
      setDisplayName(res.data.displayName);
      setUsername(res.data.username);
      setBio(res.data.bio ?? "");
      setProfileVisibility(res.data.profileVisibility);
      setAvatarUrl(res.data.avatarUrl);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
    setUsername(user?.username ?? "");
  }, [user?.displayName, user?.username]);

  useEffect(() => {
    void api<{ data: { internal: boolean; oidc: boolean; recovery?: boolean; passwordReset?: boolean } }>("/auth/methods")
      .then((res) => setMethods(res.data))
      .catch(() => setMethods({ internal: true, oidc: false }));
    void loadIdentities();
  }, [loadIdentities]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProfileMessage(null);
    try {
      await api("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName,
          bio: bio.trim() || null,
          profileVisibility,
        }),
      });
      await refresh();
      await loadProfile();
      setProfileMessage(t("profileSaved", { defaultValue: "Profile updated." }));
    } catch (err) {
      setProfileMessage(
        err instanceof Error ? err.message : t("profileSaveError", { defaultValue: "Could not save profile." }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveUsername(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setUsernameMessage(null);
    try {
      await api("/auth/me/username", {
        method: "PATCH",
        body: JSON.stringify({ username }),
      });
      await refresh();
      await loadProfile();
      setUsernameMessage(t("usernameSaved", { defaultValue: "Username updated." }));
    } catch (err) {
      setUsernameMessage(
        err instanceof Error ? err.message : t("usernameSaveError", { defaultValue: "Could not update username." }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    setSaving(true);
    setProfileMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api<{
        data: { avatarUrl?: string; profile: SelfUserProfile };
      }>("/auth/me/avatar", { method: "POST", body: form });
      setAvatarUrl(res.data.avatarUrl);
      setProfile(res.data.profile);
      setProfileMessage(t("avatarSaved", { defaultValue: "Avatar updated." }));
    } catch (err) {
      setProfileMessage(
        err instanceof Error ? err.message : t("avatarSaveError", { defaultValue: "Could not upload avatar." }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setPasswordMessage(null);
    try {
      const body: { newPassword: string; currentPassword?: string } = {
        newPassword,
      };
      if (user?.hasPassword) {
        body.currentPassword = currentPassword;
      }
      await api("/auth/password", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCurrentPassword("");
      setNewPassword("");
      await refresh();
      setPasswordMessage(
        user?.hasPassword
          ? t("passwordSaved", { defaultValue: "Password updated." })
          : t("passwordSet", { defaultValue: "Password set." }),
      );
    } catch (err) {
      setPasswordMessage(
        err instanceof Error ? err.message : t("passwordSaveError", { defaultValue: "Could not change password." }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function linkOidc() {
    setIdentityMessage(null);
    try {
      const res = await api<{ data: { url: string } }>("/auth/oidc/link", {
        method: "POST",
        body: JSON.stringify({}),
      });
      window.location.href = res.data.url;
    } catch (err) {
      setIdentityMessage(
        err instanceof Error
          ? err.message
          : t("identityLinkError", { defaultValue: "Could not start account linking." }),
      );
    }
  }

  async function unlinkOidc(providerKey: string) {
    setIdentityMessage(null);
    try {
      await api("/auth/oidc/link", {
        method: "DELETE",
        body: JSON.stringify({ providerKey }),
      });
      await loadIdentities();
      setIdentityMessage(
        t("identityUnlinked", { defaultValue: "OIDC identity unlinked." }),
      );
    } catch (err) {
      setIdentityMessage(
        err instanceof Error
          ? err.message
          : t("identityUnlinkError", { defaultValue: "Could not unlink identity." }),
      );
    }
  }

  if (!user) return null;

  return (
    <div>
      <h2>{t("account")}</h2>
      <section className={styles.settingsSection}>
        <form onSubmit={(e) => void saveProfile(e)}>
          <div className={styles.settingsField}>
            <label htmlFor="account-email">{t("email", { defaultValue: "Email" })}</label>
            <input id="account-email" value={user.email} disabled />
          </div>
          <div className={styles.settingsField}>
            <label htmlFor="account-username">{t("username", { defaultValue: "Username" })}</label>
            <p className={styles.lead}>@{profile?.username ?? user.username}</p>
            <p className={styles.profileUrlPreview}>
              {t("profileUrl", { defaultValue: "Your profile" })}:{" "}
              <Link to={userProfilePath(profile?.username ?? user.username)}>
                {userProfilePath(profile?.username ?? user.username)}
              </Link>{" "}
              · <Link to="/settings/profile">{t("editProfileLayout", { defaultValue: "Customize profile" })}</Link>
            </p>
          </div>
          <div className={styles.settingsField}>
            <label htmlFor="account-avatar">{t("avatar", { defaultValue: "Avatar" })}</label>
            {avatarUrl && (
              <img src={avatarUrl} alt="" className={styles.avatarPreview} />
            )}
            <input
              id="account-avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAvatar(file);
              }}
            />
          </div>
          <div className={styles.settingsField}>
            <label htmlFor="account-display-name">{t("displayName", { defaultValue: "Display name" })}</label>
            <input
              id="account-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className={styles.settingsField}>
            <label htmlFor="account-bio">{t("bio", { defaultValue: "Bio" })}</label>
            <textarea
              id="account-bio"
              value={bio}
              rows={4}
              maxLength={500}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
          <div className={styles.settingsField}>
            <label htmlFor="profile-visibility">{t("profileVisibility", { defaultValue: "Profile visibility" })}</label>
            <select
              id="profile-visibility"
              value={profileVisibility}
              onChange={(e) =>
                setProfileVisibility(
                  e.target.value as SelfUserProfile["profileVisibility"],
                )
              }
            >
              <option value={PROFILE_VISIBILITY.PUBLIC}>
                {t("visibilityPublic", { defaultValue: "Public" })}
              </option>
              <option value={PROFILE_VISIBILITY.MEMBERS}>
                {t("visibilityMembers", { defaultValue: "Club members only" })}
              </option>
              <option value={PROFILE_VISIBILITY.PRIVATE}>
                {t("visibilityPrivate", { defaultValue: "Private" })}
              </option>
            </select>
          </div>
          <Button type="submit" variant="primary" disabled={saving}>
            {t("save")}
          </Button>
          {profileMessage && (
            <p className={styles.settingsMessage} role="status">
              {profileMessage}
            </p>
          )}
        </form>
      </section>
      <section className={styles.settingsSection}>
        <h3>{t("changeUsername", { defaultValue: "Change username" })}</h3>
        <form onSubmit={(e) => void saveUsername(e)}>
          <div className={styles.settingsField}>
            <label htmlFor="new-username">{t("username", { defaultValue: "Username" })}</label>
            <input
              id="new-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <Button type="submit" variant="primary" disabled={saving}>
            {t("saveUsername", { defaultValue: "Save username" })}
          </Button>
          {usernameMessage && (
            <p className={styles.settingsMessage} role="status">
              {usernameMessage}
            </p>
          )}
        </form>
      </section>
      {methods?.oidc && (
        <section className={styles.settingsSection}>
          <h3>{t("linkedAccounts", { defaultValue: "Linked accounts" })}</h3>
          {identities.length === 0 ? (
            <p className={styles.lead}>
              {t("noLinkedAccounts", {
                defaultValue: "No OIDC identity is linked to this account.",
              })}
            </p>
          ) : (
            <ul className={styles.list}>
              {identities.map((identity) => (
                <li key={identity.id} className={styles.listItem}>
                  <strong>
                    {identity.displayName ?? identity.email ?? identity.issuer}
                  </strong>
                  <p className={styles.lead}>{identity.issuer}</p>
                  <Button
                    type="button"
                    onClick={() => void unlinkOidc(identity.providerKey)}
                  >
                    {t("unlinkAccount", { defaultValue: "Unlink" })}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {identities.length === 0 && (
            <Button type="button" variant="primary" onClick={() => void linkOidc()}>
              {t("linkOidc", { defaultValue: "Link OIDC account" })}
            </Button>
          )}
          {identityMessage && (
            <p className={styles.settingsMessage} role="status">
              {identityMessage}
            </p>
          )}
        </section>
      )}
      {(methods?.internal || user.hasPassword) && (
      <section className={styles.settingsSection}>
        <h3>
          {user.hasPassword
            ? t("changePassword", { defaultValue: "Change password" })
            : t("setPassword", { defaultValue: "Set password" })}
        </h3>
        <form onSubmit={(e) => void changePassword(e)}>
          {user.hasPassword && (
          <div className={styles.settingsField}>
            <label htmlFor="current-password">{t("currentPassword", { defaultValue: "Current password" })}</label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          )}
          <div className={styles.settingsField}>
            <label htmlFor="new-password">{t("newPassword", { defaultValue: "New password" })}</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={saving}>
            {t("save")}
          </Button>
          {passwordMessage && (
            <p className={styles.settingsMessage} role="status">
              {passwordMessage}
            </p>
          )}
        </form>
      </section>
      )}
      {(methods?.oidc || methods?.passwordReset || methods?.recovery) && (
        <section className={styles.settingsSection}>
          <h3>{t("recoveryMethods", { defaultValue: "Account recovery" })}</h3>
          <ul className={styles.list}>
            {methods?.oidc && (
              <li className={styles.listItem}>
                {t("recoveryOidc", {
                  defaultValue: "Sign in with your identity provider.",
                })}
              </li>
            )}
            {methods?.passwordReset && (
              <li className={styles.listItem}>
                {t("recoveryPasswordReset", {
                  defaultValue:
                    "Reset your password by email when SMTP is configured.",
                })}{" "}
                <Link to="/login">{t("auth:forgotPassword", { defaultValue: "Forgot password?" })}</Link>
              </li>
            )}
            {methods?.recovery && (
              <li className={styles.listItem}>
                {t("recoveryBreakGlass", {
                  defaultValue:
                    "Password sign-in remains available as a break-glass option when internal login is disabled.",
                })}
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "en-GB", label: "English (UK)" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
] as const;

export function SettingsLanguagePage() {
  const { t, i18n } = useTranslation("settings");
  const { user, refresh } = useAuth();
  const [locale, setLocale] = useState(user?.locale ?? i18n.language ?? "en");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.locale) setLocale(user.locale);
  }, [user?.locale]);

  async function save(nextLocale: string) {
    setSaving(true);
    setMessage(null);
    try {
      await i18n.changeLanguage(nextLocale);
      await api("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ locale: nextLocale }),
      });
      await refresh();
      setMessage(t("languageSaved", { defaultValue: "Language preference saved." }));
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : t("languageSaveError", { defaultValue: "Could not save language." }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2>{t("language")}</h2>
      <p className={styles.lead}>
        {t("languageIncompleteNote", {
          defaultValue: "French and German translations are not yet complete. English is used as fallback.",
        })}
      </p>
      <div className={styles.settingsField}>
        <label htmlFor="locale-select">{t("language")}</label>
        <select
          id="locale-select"
          value={locale}
          disabled={saving}
          onChange={(e) => {
            const next = e.target.value;
            setLocale(next);
            void save(next);
          }}
        >
          {LOCALE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {message && (
        <p className={styles.settingsMessage} role="status">
          {message}
        </p>
      )}
    </div>
  );
}

interface DeviceRow {
  id: string;
  name: string;
  userAgent: string | null;
  settingsJson?: Record<string, unknown>;
  lastSeenAt: string;
  createdAt: string;
}

interface SessionRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceId: string | null;
  deviceName: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export function SettingsDevicesPage() {
  const { t } = useTranslation("settings");
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [deviceRes, sessionRes] = await Promise.all([
      api<{ data: DeviceRow[] }>("/devices"),
      api<{ data: SessionRow[] }>("/auth/sessions"),
    ]);
    setDevices(deviceRes.data);
    setSessions(sessionRes.data);
    setEditingNames(
      Object.fromEntries(deviceRes.data.map((d) => [d.id, d.name])),
    );
  }, []);

  useEffect(() => {
    void load().catch(() => {
      setDevices([]);
      setSessions([]);
    });
  }, [load]);

  async function registerDevice(e: React.FormEvent) {
    e.preventDefault();
    if (!deviceName.trim()) return;
    setMessage(null);
    try {
      const res = await api<{ data: { id: string } }>("/devices", {
        method: "POST",
        body: JSON.stringify({ name: deviceName.trim() }),
      });
      setStoredDeviceId(res.data.id);
      setDeviceName("");
      await load();
      setMessage(t("deviceRegistered", { defaultValue: "Device registered." }));
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : t("deviceError", { defaultValue: "Device action failed." }),
      );
    }
  }

  async function renameDevice(id: string) {
    const name = editingNames[id]?.trim();
    if (!name) return;
    setMessage(null);
    try {
      await api(`/devices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      await load();
      setMessage(t("deviceRenamed", { defaultValue: "Device updated." }));
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : t("deviceError", { defaultValue: "Device action failed." }),
      );
    }
  }

  async function revokeDevice(id: string) {
    setMessage(null);
    try {
      await api(`/devices/${id}`, { method: "DELETE" });
      if (getStoredDeviceId() === id) {
        clearStoredDeviceId();
      }
      await load();
      setMessage(
        t("deviceRevoked", {
          defaultValue: "Device revoked. Any sessions linked to it were signed out.",
        }),
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : t("deviceError", { defaultValue: "Device action failed." }),
      );
    }
  }

  async function revokeSession(id: string) {
    setMessage(null);
    try {
      await api(`/auth/sessions/${id}`, { method: "DELETE" });
      await load();
      setMessage(t("sessionRevoked", { defaultValue: "Session signed out." }));
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("sessionError", { defaultValue: "Session action failed." }),
      );
    }
  }

  async function revokeOtherSessions() {
    setMessage(null);
    try {
      await api("/auth/sessions?others=true", { method: "DELETE" });
      await load();
      setMessage(
        t("sessionsRevoked", { defaultValue: "Other sessions signed out." }),
      );
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("sessionError", { defaultValue: "Session action failed." }),
      );
    }
  }

  return (
    <div>
      <h2>{t("devices")}</h2>
      <p className={styles.lead}>
        {t("devicesHelp", {
          defaultValue:
            "Device settings apply only to the selected device. Account-wide preferences are under Appearance, Reader, and other settings sections.",
        })}
      </p>
      <form onSubmit={(e) => void registerDevice(e)} className={styles.settingsSection}>
        <div className={styles.settingsField}>
          <label htmlFor="device-name">{t("deviceName", { defaultValue: "Device name" })}</label>
          <input
            id="device-name"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
          />
        </div>
        <Button type="submit" variant="primary">
          {t("registerDevice", { defaultValue: "Register device" })}
        </Button>
      </form>
      {devices === null ? (
        <p>Loading…</p>
      ) : (
        <ul className={styles.list}>
          {devices.map((device) => (
            <li key={device.id} className={styles.listItem}>
              <div className={styles.settingsField}>
                <label htmlFor={`device-name-${device.id}`}>
                  {t("deviceName", { defaultValue: "Device name" })}
                </label>
                <input
                  id={`device-name-${device.id}`}
                  value={editingNames[device.id] ?? device.name}
                  onChange={(e) =>
                    setEditingNames((prev) => ({
                      ...prev,
                      [device.id]: e.target.value,
                    }))
                  }
                />
              </div>
              {device.userAgent && (
                <p className={styles.lead}>{device.userAgent}</p>
              )}
              <p className={styles.lead}>
                {t("lastSeen", { defaultValue: "Last seen" })}:{" "}
                {new Date(device.lastSeenAt).toLocaleString()}
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <Button type="button" onClick={() => void renameDevice(device.id)}>
                  {t("saveDevice", { defaultValue: "Save device" })}
                </Button>
                <Button type="button" onClick={() => void revokeDevice(device.id)}>
                  {t("revokeDevice", { defaultValue: "Revoke" })}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <section className={styles.settingsSection}>
        <h3>{t("sessions")}</h3>
        <p className={styles.lead}>{t("sessionsHelp")}</p>
        {sessions === null ? (
          <p>{t("loading", { defaultValue: "Loading…" })}</p>
        ) : sessions.length === 0 ? (
          <p className={styles.lead}>—</p>
        ) : (
          <>
            <ul className={styles.list}>
              {sessions.map((session) => (
                <li key={session.id} className={styles.listItem}>
                  <p>
                    {session.deviceName ??
                      session.userAgent ??
                      t("sessions", { defaultValue: "Session" })}
                    {session.isCurrent && (
                      <> ({t("currentSession", { defaultValue: "This device" })})</>
                    )}
                  </p>
                  {session.ipAddress && (
                    <p className={styles.lead}>{session.ipAddress}</p>
                  )}
                  <p className={styles.lead}>
                    {new Date(session.createdAt).toLocaleString()}
                  </p>
                  {!session.isCurrent && (
                    <Button
                      type="button"
                      onClick={() => void revokeSession(session.id)}
                    >
                      {t("revokeSession", { defaultValue: "Sign out" })}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {sessions.some((s) => !s.isCurrent) && (
              <Button type="button" onClick={() => void revokeOtherSessions()}>
                {t("revokeOtherSessions", {
                  defaultValue: "Sign out everywhere else",
                })}
              </Button>
            )}
          </>
        )}
      </section>
      {message && (
        <p className={styles.settingsMessage} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
