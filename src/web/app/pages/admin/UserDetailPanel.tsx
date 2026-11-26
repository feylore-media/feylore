import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import { ROLE_NAMES } from "@shared/permissions";
import pageStyles from "../pages.module.css";
import adminStyles from "./admin.module.css";
import {
  computeEffectivePermissions,
  groupPermissions,
  type RoleWithPermissions,
} from "./permission-groups";

const ALL_ROLE_NAMES = [
  ROLE_NAMES.ADMIN,
  ROLE_NAMES.CURATOR,
  ROLE_NAMES.MEMBER,
  ROLE_NAMES.KID,
];

export interface AdminUserSummary {
  id: string;
  email: string;
  username: string;
  displayName: string;
  disabledAt: string | null;
  roleNames: string[];
  lastLoginAt: string | null;
}

interface RoleOption {
  name: string;
  description: string | null;
}

interface UserDetail extends AdminUserSummary {
  hasPassword: boolean;
  oidcIdentityCount: number;
}

interface UserDetailPanelProps {
  user: AdminUserSummary;
  roles: RoleOption[];
  rolesWithPermissions: RoleWithPermissions[];
  canWrite: boolean;
  canAssignRoles: boolean;
  currentUserId: string | undefined;
  onMutated: () => Promise<void>;
  onMessage: (message: string | null) => void;
  onError: (error: string | null) => void;
  onRoleWarning: (warning: string | null) => void;
}

function toggleRole(roleName: string, checked: boolean, target: string[]) {
  if (checked) {
    return [...new Set([...target, roleName])];
  }
  return target.filter((r) => r !== roleName);
}

export function UserDetailPanel({
  user,
  roles,
  rolesWithPermissions,
  canWrite,
  canAssignRoles,
  currentUserId,
  onMutated,
  onMessage,
  onError,
  onRoleWarning,
}: UserDetailPanelProps) {
  const { t } = useTranslation("admin");
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [editForm, setEditForm] = useState({
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    password: "",
  });
  const [editRoles, setEditRoles] = useState(user.roleNames);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    setEditForm({
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      password: "",
    });
    setEditRoles(user.roleNames);
    setDeleteConfirm("");
    void api<{ data: UserDetail }>(`/users/${user.id}`)
      .then((res) => setDetail(res.data))
      .catch(() => setDetail(null));
  }, [user]);

  const effectivePermissions = computeEffectivePermissions(
    user.roleNames,
    rolesWithPermissions,
  );
  const effectiveGroups = groupPermissions(
    effectivePermissions.map((key) => ({ key, description: null })),
  );

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    onError(null);
    onMessage(null);
    try {
      await api(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          email: editForm.email,
          username: editForm.username,
          displayName: editForm.displayName,
          password: editForm.password || undefined,
        }),
      });
      onMessage(t("usersSaved"));
      await onMutated();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("usersLoadError"));
    }
  }

  async function handleSaveRoles() {
    if (!canAssignRoles) return;
    onError(null);
    onMessage(null);
    try {
      const res = await api<{
        data: { warnings?: string[] };
      }>(`/users/${user.id}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleNames: editRoles }),
      });
      onMessage(t("usersRolesSaved"));
      onRoleWarning(res.data.warnings?.[0] ?? null);
      await onMutated();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("usersLoadError"));
    }
  }

  async function handleToggleDisabled() {
    if (!canWrite) return;
    const disabled = !user.disabledAt;
    if (
      disabled &&
      !window.confirm(
        `Disable ${user.username}? They will be logged out immediately.`,
      )
    ) {
      return;
    }
    onError(null);
    onMessage(null);
    try {
      await api(`/users/${user.id}/disable`, {
        method: "POST",
        body: JSON.stringify({ disabled }),
      });
      onMessage(disabled ? t("usersDisabled") : t("usersEnabled"));
      await onMutated();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("usersLoadError"));
    }
  }

  async function handleDelete() {
    if (!canWrite || deleteConfirm !== user.username) return;
    onError(null);
    onMessage(null);
    try {
      await api(`/users/${user.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      onMessage(t("usersDeleted"));
      await onMutated();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("usersLoadError"));
    }
  }

  return (
    <div className={adminStyles.adminPanel}>
      <section className={adminStyles.adminPanelSection}>
        <h4 className={adminStyles.adminPanelSectionTitle}>
          {t("sectionProfile")}
        </h4>
        <form onSubmit={handleSaveEdit}>
          <div className={pageStyles.settingsField}>
            <label htmlFor={`edit-display-${user.id}`}>
              {t("fieldDisplayName")}
            </label>
            <input
              id={`edit-display-${user.id}`}
              required
              disabled={!canWrite}
              value={editForm.displayName}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, displayName: e.target.value }))
              }
            />
          </div>
          <div className={pageStyles.settingsField}>
            <label htmlFor={`edit-email-${user.id}`}>{t("fieldEmail")}</label>
            <input
              id={`edit-email-${user.id}`}
              type="email"
              required
              disabled={!canWrite}
              value={editForm.email}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
          <div className={pageStyles.settingsField}>
            <label htmlFor={`edit-username-${user.id}`}>
              {t("fieldUsername")}
            </label>
            <input
              id={`edit-username-${user.id}`}
              required
              disabled={!canWrite}
              value={editForm.username}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, username: e.target.value }))
              }
            />
          </div>
          {canWrite && <Button type="submit">{t("usersSave")}</Button>}
        </form>
      </section>

      {canWrite && (
        <section className={adminStyles.adminPanelSection}>
          <h4 className={adminStyles.adminPanelSectionTitle}>
            {t("sectionPassword")}
          </h4>
          <div className={pageStyles.settingsField}>
            <label htmlFor={`edit-password-${user.id}`}>
              {t("fieldPasswordReset")}
            </label>
            <input
              id={`edit-password-${user.id}`}
              type="password"
              minLength={8}
              value={editForm.password}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, password: e.target.value }))
              }
            />
          </div>
        </section>
      )}

      <section className={adminStyles.adminPanelSection}>
        <h4 className={adminStyles.adminPanelSectionTitle}>
          {t("sectionAccountStatus")}
        </h4>
        {detail && (
          <p className={adminStyles.hint}>
            {detail.hasPassword
              ? t("accountHasPassword")
              : t("accountNoPassword")}
            {detail.oidcIdentityCount > 0
              ? ` ${t("accountOidcCount", { count: detail.oidcIdentityCount })}`
              : ""}
          </p>
        )}
        {canWrite && user.id !== currentUserId && (
          <Button type="button" onClick={() => void handleToggleDisabled()}>
            {user.disabledAt ? t("usersEnable") : t("usersDisable")}
          </Button>
        )}
      </section>

      {canAssignRoles && (
        <section className={adminStyles.adminPanelSection}>
          <h4 className={adminStyles.adminPanelSectionTitle}>
            {t("usersRoles")}
          </h4>
          {ALL_ROLE_NAMES.map((roleName) => (
            <label key={roleName} style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={editRoles.includes(roleName)}
                onChange={(e) =>
                  setEditRoles((prev) =>
                    toggleRole(roleName, e.target.checked, prev),
                  )
                }
              />{" "}
              {roles.find((r) => r.name === roleName)?.description ?? roleName}
            </label>
          ))}
          <p>
            <Button type="button" onClick={() => void handleSaveRoles()}>
              {t("usersSaveRoles")}
            </Button>
          </p>
        </section>
      )}

      <section className={adminStyles.adminPanelSection}>
        <h4 className={adminStyles.adminPanelSectionTitle}>
          {t("sectionEffectivePermissions")}
        </h4>
        <p className={adminStyles.hint}>
          {t("effectivePermissionsCount", {
            count: effectivePermissions.length,
          })}
        </p>
        {effectiveGroups.map((group) => (
          <div key={group.labelKey} className={adminStyles.permissionGroup}>
            <p className={adminStyles.permissionGroupTitle}>
              {t(group.labelKey)}
            </p>
            <ul className={adminStyles.effectivePermissionList}>
              {group.items
                .sort((a, b) => a.key.localeCompare(b.key))
                .map((perm) => (
                  <li
                    key={perm.key}
                    className={adminStyles.effectivePermissionTag}
                  >
                    {perm.key}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      {canWrite && user.id !== currentUserId && (
        <section
          className={`${adminStyles.adminPanelSection} ${adminStyles.dangerSection}`}
        >
          <h4 className={adminStyles.adminPanelSectionTitle}>
            {t("sectionDangerZone")}
          </h4>
          <p className={adminStyles.hint}>{t("usersDeletePrompt")}</p>
          <div className={pageStyles.settingsField}>
            <label htmlFor={`delete-confirm-${user.id}`}>
              {t("usersDeleteConfirm")}
            </label>
            <input
              id={`delete-confirm-${user.id}`}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={user.username}
            />
          </div>
          <Button
            type="button"
            disabled={deleteConfirm !== user.username}
            onClick={() => void handleDelete()}
          >
            {t("usersDelete")}
          </Button>
        </section>
      )}
    </div>
  );
}
