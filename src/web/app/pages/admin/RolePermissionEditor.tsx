import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/primitives";
import adminStyles from "./admin.module.css";
import { groupPermissions, type PermissionItem } from "./permission-groups";

interface RolePermissionEditorProps {
  roleName: string;
  initialPermissions: string[];
  allPermissions: PermissionItem[];
  canWrite: boolean;
  onSave: (permissions: string[]) => Promise<void>;
}

export function RolePermissionEditor({
  roleName,
  initialPermissions,
  allPermissions,
  canWrite,
  onSave,
}: RolePermissionEditorProps) {
  const { t } = useTranslation("admin");
  const [editPermissions, setEditPermissions] = useState(initialPermissions);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditPermissions(initialPermissions);
  }, [initialPermissions, roleName]);

  const groups = groupPermissions(allPermissions);

  function togglePermission(key: string, checked: boolean) {
    setEditPermissions((prev) => {
      if (checked) return [...new Set([...prev, key])];
      return prev.filter((p) => p !== key);
    });
  }

  async function handleSave() {
    if (!canWrite) return;
    setSaving(true);
    try {
      await onSave(editPermissions);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={adminStyles.adminPanel}>
      <p className={adminStyles.hint}>{t("rolesPermissions")}</p>
      {groups.map((group) => (
        <div key={group.labelKey} className={adminStyles.permissionGroup}>
          <p className={adminStyles.permissionGroupTitle}>
            {t(group.labelKey)}
          </p>
          <div className={adminStyles.permissionGrid}>
            {group.items
              .sort((a, b) => a.key.localeCompare(b.key))
              .map((perm) => (
                <label key={perm.key} className={adminStyles.permissionLabel}>
                  <input
                    type="checkbox"
                    disabled={!canWrite}
                    checked={editPermissions.includes(perm.key)}
                    onChange={(e) =>
                      togglePermission(perm.key, e.target.checked)
                    }
                  />
                  <span>
                    <code>{perm.key}</code>
                    {perm.description ? ` — ${perm.description}` : ""}
                  </span>
                </label>
              ))}
          </div>
        </div>
      ))}
      {canWrite && (
        <p>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {t("rolesSave")}
          </Button>
        </p>
      )}
    </div>
  );
}
