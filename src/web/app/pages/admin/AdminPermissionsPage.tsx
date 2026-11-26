import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api } from "../../api";
import ingestStyles from "../../../components/ingest/ingest.module.css";
import pageStyles from "../pages.module.css";
import { groupPermissions } from "./permission-groups";

export function AdminPermissionsPage() {
  const { t } = useTranslation("admin");
  const [permissions, setPermissions] = useState<
    { key: string; description: string | null }[]
  >([]);

  useEffect(() => {
    void api<{ data: { key: string; description: string | null }[] }>(
      "/permissions",
    )
      .then((res) => setPermissions(res.data))
      .catch(() => setPermissions([]));
  }, []);

  const groups = groupPermissions(permissions);

  return (
    <div>
      <h2>{t("permissionsTitle")}</h2>
      <p className={ingestStyles.hint}>{t("permissionsDescription")}</p>
      <p>
        <Link to="/admin/access/roles">{t("permissionsViewRoles")}</Link>
      </p>

      {groups.map((group) => (
        <section key={group.labelKey} className={pageStyles.settingsSection}>
          <h3>{t(group.labelKey)}</h3>
          <ul className={ingestStyles.settingsList}>
            {group.items
              .sort((a, b) => a.key.localeCompare(b.key))
              .map((perm) => (
                <li key={perm.key} className={ingestStyles.settingsRow}>
                  <p className={ingestStyles.settingsRowTitle}>
                    <code>{perm.key}</code>
                  </p>
                  {perm.description && (
                    <p className={ingestStyles.settingsRowMeta}>
                      {perm.description}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
