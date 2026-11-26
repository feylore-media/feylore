import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { usePermission } from "../../auth-context";
import { useRefreshInstance } from "../../instance-context";
import { PERMISSIONS } from "@shared/permissions";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import { DEFAULT_FAVICON_SRC, DEFAULT_LOGO_SRC } from "../../../components/brand/defaults";
import styles from "../pages.module.css";

interface AppearanceData {
  logoFileId: string | null;
  faviconFileId: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
}

interface ProfilePolicyData {
  customCssEnabled: boolean;
}

export function AdminAppearancePage() {
  const { t } = useTranslation("admin");
  const canRead = usePermission(PERMISSIONS.SYSTEM_SETTINGS_READ);
  const canWrite = usePermission(PERMISSIONS.SYSTEM_SETTINGS_WRITE);
  const refreshInstance = useRefreshInstance();
  const [appearance, setAppearance] = useState<AppearanceData | null>(null);
  const [profilePolicy, setProfilePolicy] = useState<ProfilePolicyData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canRead) return;
    void api<{ data: AppearanceData }>("/admin/system/appearance")
      .then((res) => setAppearance(res.data))
      .catch(() => setAppearance(null));
  }, [canRead]);

  useEffect(() => {
    if (!canRead) return;
    void api<{ data: ProfilePolicyData }>("/admin/system/profiles")
      .then((res) => setProfilePolicy(res.data))
      .catch(() => setProfilePolicy(null));
  }, [canRead]);

  async function upload(kind: "logo" | "favicon", file: File) {
    if (!canWrite) return;
    setUploading(kind);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api<{ data: AppearanceData }>(
        `/admin/system/appearance/${kind}`,
        { method: "POST", body: form },
      );
      setAppearance(res.data);
      await refreshInstance();
      setMessage(t("appearanceSaved"));
    } catch {
      setMessage(t("appearanceSaveFailed"));
    } finally {
      setUploading(null);
    }
  }

  async function clear(kind: "logo" | "favicon") {
    if (!canWrite) return;
    setUploading(kind);
    setMessage(null);
    try {
      const res = await api<{ data: AppearanceData }>(
        `/admin/system/appearance/${kind}`,
        { method: "DELETE" },
      );
      setAppearance(res.data);
      await refreshInstance();
      setMessage(t("appearanceCleared"));
    } catch {
      setMessage(t("appearanceSaveFailed"));
    } finally {
      setUploading(null);
    }
  }

  async function setProfileCssEnabled(enabled: boolean) {
    if (!canWrite) return;
    setMessage(null);
    try {
      const res = await api<{ data: ProfilePolicyData }>(
        "/admin/system/profiles",
        { method: "PATCH", body: JSON.stringify({ customCssEnabled: enabled }) },
      );
      setProfilePolicy(res.data);
      setMessage(t("profileCssSaved"));
    } catch {
      setMessage(t("appearanceSaveFailed"));
    }
  }

  if (!canRead) {
    return <p>{t("appearancePermissionDenied")}</p>;
  }

  if (!appearance) return <p>{t("appearanceLoading")}</p>;

  return (
    <div>
      <h2 className={styles.adminPageTitle}>{t("appearanceTitle")}</h2>
      <p className={styles.adminPageDescription}>{t("appearanceDescription")}</p>
      <p className={styles.lead}>
        {t("appearanceThemeNote")}{" "}
        <Link to="/admin/system/configuration">{t("configuration")}</Link>.
      </p>

      <section className={styles.settingsSection}>
        <h3>{t("appearanceLogoTitle")}</h3>
        <div className={styles.appearancePreview}>
          <img
            src={appearance.logoUrl ?? DEFAULT_LOGO_SRC}
            alt={t("appearanceLogoPreview")}
            className={styles.appearanceLogoPreview}
          />
        </div>
        {canWrite && (
          <>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload("logo", file);
                e.target.value = "";
              }}
            />
            <div className={styles.buttonRow}>
              <Button
                type="button"
                variant="primary"
                disabled={uploading === "logo"}
                onClick={() => logoInputRef.current?.click()}
              >
                {t("appearanceUploadLogo")}
              </Button>
              {appearance.logoFileId && (
                <Button
                  type="button"
                  variant="default"
                  disabled={uploading === "logo"}
                  onClick={() => void clear("logo")}
                >
                  {t("appearanceResetLogo")}
                </Button>
              )}
            </div>
          </>
        )}
      </section>

      <section className={styles.settingsSection}>
        <h3>{t("appearanceFaviconTitle")}</h3>
        <div className={styles.appearancePreview}>
          <img
            src={appearance.faviconUrl ?? DEFAULT_FAVICON_SRC}
            alt={t("appearanceFaviconPreview")}
            className={styles.appearanceFaviconPreview}
          />
        </div>
        {canWrite && (
          <>
            <input
              ref={faviconInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload("favicon", file);
                e.target.value = "";
              }}
            />
            <div className={styles.buttonRow}>
              <Button
                type="button"
                variant="primary"
                disabled={uploading === "favicon"}
                onClick={() => faviconInputRef.current?.click()}
              >
                {t("appearanceUploadFavicon")}
              </Button>
              {appearance.faviconFileId && (
                <Button
                  type="button"
                  variant="default"
                  disabled={uploading === "favicon"}
                  onClick={() => void clear("favicon")}
                >
                  {t("appearanceResetFavicon")}
                </Button>
              )}
            </div>
          </>
        )}
      </section>

      <section className={styles.settingsSection}>
        <h3>{t("appearanceHeaderPreviewTitle")}</h3>
        <div className={styles.appearanceHeaderPreview}>
          <img
            src={appearance.logoUrl ?? DEFAULT_LOGO_SRC}
            alt={t("appearanceLogoPreview")}
            className={styles.appearanceLogoPreview}
          />
        </div>
      </section>

      <section className={styles.settingsSection}>
        <h3>{t("profileCustomizationTitle")}</h3>
        <p className={styles.adminPageDescription}>{t("profileCustomizationDescription")}</p>
        {profilePolicy !== null && (
          <label className={styles.settingsField}>
            <input
              type="checkbox"
              checked={profilePolicy.customCssEnabled}
              disabled={!canWrite}
              onChange={(e) => void setProfileCssEnabled(e.target.checked)}
            />{" "}
            {t("profileCssEnabledLabel")}
          </label>
        )}
        <p className={styles.lead}>{t("profileCssToggleNote")}</p>
      </section>

      {message && <p role="status">{message}</p>}
    </div>
  );
}
