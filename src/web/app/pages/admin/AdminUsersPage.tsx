import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, usePermission } from "../../auth-context";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import { PERMISSIONS, ROLE_NAMES } from "@shared/permissions";
import ingestStyles from "../../../components/ingest/ingest.module.css";
import pageStyles from "../pages.module.css";
import { AdminExpandChevron } from "./AdminExpandChevron";
import { formatRelativeTime } from "./format-relative-time";
import adminStyles from "./admin.module.css";
import type { RoleWithPermissions } from "./permission-groups";
import { UserDetailPanel, type AdminUserSummary } from "./UserDetailPanel";

interface RoleOption {
  name: string;
  description: string | null;
  permissions?: string[];
}

const ALL_ROLE_NAMES = [
  ROLE_NAMES.ADMIN,
  ROLE_NAMES.CURATOR,
  ROLE_NAMES.MEMBER,
  ROLE_NAMES.KID,
];

const emptyCreateForm = {
  email: "",
  username: "",
  displayName: "",
  password: "",
  roleNames: [ROLE_NAMES.MEMBER] as string[],
};

function toggleRole(roleName: string, checked: boolean, target: string[]) {
  if (checked) {
    return [...new Set([...target, roleName])];
  }
  return target.filter((r) => r !== roleName);
}

function UserStatusIndicator({
  disabled,
  activeLabel,
  disabledLabel,
}: {
  disabled: boolean;
  activeLabel: string;
  disabledLabel: string;
}) {
  return (
    <span className={adminStyles.statusIndicator}>
      <span
        className={
          disabled ? adminStyles.statusDotDisabled : adminStyles.statusDotActive
        }
      />
      {disabled ? disabledLabel : activeLabel}
    </span>
  );
}

export function AdminUsersPage() {
  const { t } = useTranslation("admin");
  const { user: currentUser } = useAuth();
  const canWrite = usePermission(PERMISSIONS.USERS_WRITE);
  const canAssignRoles = usePermission(PERMISSIONS.USERS_ROLES_ASSIGN);
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleWarning, setRoleWarning] = useState<string | null>(null);

  const expandedUser = users?.find((u) => u.id === expandedId) ?? null;
  const rolesWithPermissions: RoleWithPermissions[] = roles.map((role) => ({
    name: role.name,
    permissions: role.permissions ?? [],
  }));

  async function loadUsers() {
    try {
      const res = await api<{ data: AdminUserSummary[] }>("/users");
      setUsers(res.data);
      if (expandedId && !res.data.some((u) => u.id === expandedId)) {
        setExpandedId(null);
      }
    } catch {
      setError(t("usersLoadError"));
      setUsers([]);
    }
  }

  useEffect(() => {
    void loadUsers();
    void api<{ data: RoleOption[] }>("/roles")
      .then((res) => setRoles(res.data))
      .catch(() => setRoles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  function toggleExpand(userId: string) {
    setExpandedId((prev) => (prev === userId ? null : userId));
    setMessage(null);
    setError(null);
    setRoleWarning(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setError(null);
    setMessage(null);
    try {
      const res = await api<{
        data: { id: string; warnings?: string[] };
      }>("/users", {
        method: "POST",
        body: JSON.stringify({
          email: createForm.email,
          username: createForm.username,
          displayName: createForm.displayName,
          password: createForm.password || undefined,
          roleNames: createForm.roleNames,
        }),
      });
      setMessage(t("usersCreated"));
      setRoleWarning(res.data.warnings?.[0] ?? null);
      setCreating(false);
      setCreateForm(emptyCreateForm);
      await loadUsers();
      setExpandedId(res.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("usersLoadError"));
    }
  }

  if (users === null) return <p>Loading…</p>;

  return (
    <div>
      <div className={pageStyles.pageHeader}>
        <div>
          <h2>{t("usersTitle")}</h2>
          <p className={ingestStyles.hint}>{t("usersDescription")}</p>
        </div>
        {canWrite && (
          <Button type="button" onClick={() => setCreating((v) => !v)}>
            {t("usersCreate")}
          </Button>
        )}
      </div>

      {message && <p className={pageStyles.settingsMessage}>{message}</p>}
      {error && <p className={adminStyles.error}>{error}</p>}
      {roleWarning && (
        <p className={adminStyles.hint}>{t("usersRoleWarning")}</p>
      )}

      {creating && canWrite && (
        <form className={pageStyles.settingsSection} onSubmit={handleCreate}>
          <h3>{t("usersCreate")}</h3>
          <div className={pageStyles.settingsField}>
            <label htmlFor="create-email">{t("fieldEmail")}</label>
            <input
              id="create-email"
              type="email"
              required
              value={createForm.email}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
          <div className={pageStyles.settingsField}>
            <label htmlFor="create-username">{t("fieldUsername")}</label>
            <input
              id="create-username"
              required
              value={createForm.username}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, username: e.target.value }))
              }
            />
          </div>
          <div className={pageStyles.settingsField}>
            <label htmlFor="create-display">{t("fieldDisplayName")}</label>
            <input
              id="create-display"
              required
              value={createForm.displayName}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, displayName: e.target.value }))
              }
            />
          </div>
          <div className={pageStyles.settingsField}>
            <label htmlFor="create-password">
              {t("fieldPasswordOptional")}
            </label>
            <input
              id="create-password"
              type="password"
              minLength={8}
              value={createForm.password}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, password: e.target.value }))
              }
            />
          </div>
          {canAssignRoles && (
            <fieldset className={pageStyles.settingsField}>
              <legend>{t("usersRoles")}</legend>
              {ALL_ROLE_NAMES.map((roleName) => (
                <label key={roleName} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={createForm.roleNames.includes(roleName)}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        roleNames: toggleRole(
                          roleName,
                          e.target.checked,
                          f.roleNames,
                        ),
                      }))
                    }
                  />{" "}
                  {roleName}
                </label>
              ))}
            </fieldset>
          )}
          <Button type="submit">{t("usersCreate")}</Button>
        </form>
      )}

      {users.length === 0 ? (
        <p className={adminStyles.hint}>{t("usersNoUsers")}</p>
      ) : (
        <div className={adminStyles.adminTableWrap}>
          <table className={adminStyles.adminTable}>
            <thead>
              <tr>
                <th scope="col" className={adminStyles.colChevron} />
                <th scope="col" className={adminStyles.colUser}>
                  {t("colUser")}
                </th>
                <th scope="col" className={adminStyles.colEmail}>
                  {t("colEmail")}
                </th>
                <th scope="col" className={adminStyles.colRoles}>
                  {t("colRoles")}
                </th>
                <th scope="col" className={adminStyles.colStatus}>
                  {t("colStatus")}
                </th>
                <th scope="col" className={adminStyles.colNumeric}>
                  {t("colLastLogin")}
                </th>
                <th scope="col" className={adminStyles.colNumeric}>
                  {t("colMedia")}
                </th>
                <th scope="col" className={adminStyles.colManage}>
                  {t("colManage")}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isExpanded = expandedId === u.id;
                const panelId = `user-detail-${u.id}`;

                return (
                  <Fragment key={u.id}>
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
                      onClick={() => toggleExpand(u.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleExpand(u.id);
                        }
                      }}
                    >
                      <td className={adminStyles.colChevron}>
                        <AdminExpandChevron expanded={isExpanded} />
                      </td>
                      <td>
                        <span className={adminStyles.userCellPrimary}>
                          @{u.username}
                        </span>
                      </td>
                      <td>
                        <span className={adminStyles.cellMuted} title={u.email}>
                          {u.email}
                        </span>
                      </td>
                      <td>
                        <span className={adminStyles.cellRoles}>
                          {u.roleNames.join(", ")}
                        </span>
                      </td>
                      <td>
                        <UserStatusIndicator
                          disabled={Boolean(u.disabledAt)}
                          activeLabel={t("usersStatusActive")}
                          disabledLabel={t("usersStatusDisabled")}
                        />
                      </td>
                      <td className={adminStyles.colNumeric}>
                        <span className={adminStyles.cellMuted}>
                          {formatRelativeTime(
                            u.lastLoginAt,
                            t("lastLoginNever"),
                          )}
                        </span>
                      </td>
                      <td className={adminStyles.colNumeric}>
                        <span className={adminStyles.cellMuted}>
                          {t("mediaNotTracked")}
                        </span>
                      </td>
                      <td className={adminStyles.colManage}>
                        <button
                          type="button"
                          className={adminStyles.manageButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(u.id);
                          }}
                        >
                          {t("usersManage")}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && expandedUser && (
                      <tr className={adminStyles.adminExpandRow}>
                        <td
                          colSpan={8}
                          className={adminStyles.adminExpandCell}
                        >
                          <div
                            id={panelId}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <UserDetailPanel
                              user={expandedUser}
                              roles={roles}
                              rolesWithPermissions={rolesWithPermissions}
                              canWrite={canWrite}
                              canAssignRoles={canAssignRoles}
                              currentUserId={currentUser?.id}
                              onMutated={loadUsers}
                              onMessage={setMessage}
                              onError={setError}
                              onRoleWarning={setRoleWarning}
                            />
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
      )}
    </div>
  );
}
