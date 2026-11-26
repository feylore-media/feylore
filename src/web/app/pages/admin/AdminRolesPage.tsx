import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { usePermission } from "../../auth-context";
import { api } from "../../api";
import { PERMISSIONS, ROLE_NAMES } from "@shared/permissions";
import ingestStyles from "../../../components/ingest/ingest.module.css";
import pageStyles from "../pages.module.css";
import { AdminExpandChevron } from "./AdminExpandChevron";
import adminStyles from "./admin.module.css";
import { RolePermissionEditor } from "./RolePermissionEditor";

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
}

interface PermissionRow {
  id: string;
  key: string;
  description: string | null;
}

export function AdminRolesPage() {
  const { t } = useTranslation("admin");
  const canWrite = usePermission(PERMISSIONS.ROLES_WRITE);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionRow[]>([]);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expandedRole = roles.find((r) => r.name === expandedName) ?? null;
  const isAdminRole = expandedName === ROLE_NAMES.ADMIN;

  async function loadRoles() {
    const res = await api<{ data: RoleRow[] }>("/roles");
    setRoles(res.data);
    if (expandedName && !res.data.some((r) => r.name === expandedName)) {
      setExpandedName(null);
    }
  }

  useEffect(() => {
    void loadRoles().catch(() => setRoles([]));
    void api<{ data: PermissionRow[] }>("/permissions")
      .then((res) => setAllPermissions(res.data))
      .catch(() => setAllPermissions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  function toggleExpand(roleName: string) {
    setExpandedName((prev) => (prev === roleName ? null : roleName));
    setMessage(null);
    setError(null);
  }

  async function handleSavePermissions(permissions: string[]) {
    if (!canWrite || !expandedName || isAdminRole) return;
    setError(null);
    setMessage(null);
    try {
      await api(`/roles/${expandedName}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions }),
      });
      setMessage(t("rolesSaved"));
      await loadRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      throw err;
    }
  }

  return (
    <div>
      <h2>{t("rolesTitle")}</h2>
      <p className={ingestStyles.hint}>{t("rolesDescription")}</p>
      <p>
        <Link to="/admin/access/permissions">{t("rolesViewPermissions")}</Link>
      </p>
      {message && <p className={pageStyles.settingsMessage}>{message}</p>}
      {error && <p className={adminStyles.error}>{error}</p>}

      <div className={adminStyles.adminTableWrap}>
        <table className={adminStyles.adminTable}>
          <thead>
            <tr>
              <th scope="col" className={adminStyles.colChevron} />
              <th scope="col" className={adminStyles.colRole}>
                {t("colRole")}
              </th>
              <th scope="col" className={adminStyles.colDescription}>
                {t("colDescription")}
              </th>
              <th scope="col" className={adminStyles.colPermissionCount}>
                {t("colPermissions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const isExpanded = expandedName === role.name;
              const panelId = `role-detail-${role.name}`;

              return (
                <Fragment key={role.id}>
                  <tr
                    className={
                      isExpanded
                        ? adminStyles.adminRowExpanded
                        : adminStyles.adminRow
                    }
                    tabIndex={0}
                    role="button"
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    onClick={() => toggleExpand(role.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpand(role.name);
                      }
                    }}
                  >
                    <td className={adminStyles.colChevron}>
                      <AdminExpandChevron expanded={isExpanded} />
                    </td>
                    <td>
                      <span className={adminStyles.userCellPrimary}>
                        {role.name}
                      </span>
                    </td>
                    <td>
                      <span className={adminStyles.cellMuted}>
                        {role.description ?? "—"}
                      </span>
                    </td>
                    <td className={adminStyles.colPermissionCount}>
                      <span className={adminStyles.cellMuted}>
                        {role.permissions.length}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && expandedRole && (
                    <tr className={adminStyles.adminExpandRow}>
                      <td
                        colSpan={4}
                        className={adminStyles.adminExpandCell}
                      >
                        <div
                          id={panelId}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isAdminRole ? (
                            <div className={adminStyles.adminPanel}>
                              <p className={adminStyles.hint}>
                                {t("rolesAdminReadOnly")}
                              </p>
                            </div>
                          ) : (
                            <RolePermissionEditor
                              roleName={expandedRole.name}
                              initialPermissions={expandedRole.permissions}
                              allPermissions={allPermissions}
                              canWrite={canWrite}
                              onSave={handleSavePermissions}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
