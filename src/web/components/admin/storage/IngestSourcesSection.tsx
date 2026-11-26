import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../app/api";
import { usePermission } from "../../../app/auth-context";
import { PERMISSIONS } from "@shared/permissions";
import { Button, TextField } from "../../primitives";
import { EmptyState, LoadingState } from "../../states";
import ingestStyles from "../../ingest/ingest.module.css";
import storageStyles from "../../../app/pages/admin/admin-storage.module.css";

interface IngestRoot {
  id: string;
  name: string;
  enabled: boolean;
  recursive: boolean;
  storageLocationId: string;
  contentTypeHint: string | null;
}

interface StorageOption {
  id: string;
  name: string;
}

interface IngestSourceFormState {
  name: string;
  storageLocationId: string;
  enabled: boolean;
  recursive: boolean;
  contentTypeHint: string;
}

const emptyForm = (storageLocationId = ""): IngestSourceFormState => ({
  name: "",
  storageLocationId,
  enabled: true,
  recursive: true,
  contentTypeHint: "",
});

export function IngestSourcesSection({
  storageLocations,
}: {
  storageLocations: StorageOption[];
}) {
  const { t } = useTranslation("admin");
  const canWrite = usePermission(PERMISSIONS.INGEST_WRITE);
  const [roots, setRoots] = useState<IngestRoot[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<IngestSourceFormState>(() =>
    emptyForm(storageLocations[0]?.id ?? ""),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ data: IngestRoot[] }>("/ingest/roots");
    setRoots(res.data);
  }, []);

  useEffect(() => {
    void load().catch(() => setRoots([]));
  }, [load]);

  useEffect(() => {
    if (!form.storageLocationId && storageLocations[0]) {
      setForm((prev) => ({
        ...prev,
        storageLocationId: storageLocations[0]!.id,
      }));
    }
  }, [form.storageLocationId, storageLocations]);

  function locationName(id: string) {
    return storageLocations.find((l) => l.id === id)?.name ?? id;
  }

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setForm(emptyForm(storageLocations[0]?.id ?? ""));
    setMessage(null);
    setError(null);
  }

  function startEdit(root: IngestRoot) {
    setCreating(false);
    setEditingId(root.id);
    setForm({
      name: root.name,
      storageLocationId: root.storageLocationId,
      enabled: root.enabled,
      recursive: root.recursive,
      contentTypeHint: root.contentTypeHint ?? "",
    });
    setMessage(null);
    setError(null);
  }

  function cancelForm() {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm(storageLocations[0]?.id ?? ""));
    setError(null);
  }

  async function submitForm() {
    setError(null);
    setMessage(null);
    const body = {
      name: form.name.trim(),
      storageLocationId: form.storageLocationId,
      enabled: form.enabled,
      recursive: form.recursive,
      contentTypeHint: form.contentTypeHint.trim() || undefined,
    };

    try {
      if (editingId) {
        await api(`/ingest/roots/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setMessage(t("ingestSourceUpdated"));
      } else {
        await api("/ingest/roots", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setMessage(t("ingestSourceCreated"));
      }
      cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ingestSourceSaveFailed"));
    }
  }

  async function deleteRoot(id: string) {
    if (!window.confirm(t("ingestSourceDeleteConfirm"))) return;
    setError(null);
    try {
      await api(`/ingest/roots/${id}`, { method: "DELETE" });
      setMessage(t("ingestSourceDeleted"));
      if (editingId === id) cancelForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ingestSourceDeleteFailed"));
    }
  }

  const showForm = creating || editingId !== null;

  return (
    <section className={storageStyles.ingestSourcesSection}>
      <p className={storageStyles.footnote}>{t("ingestSourcesDescription")}</p>

      {message ? (
        <p className={storageStyles.notice} role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className={storageStyles.errorNotice} role="alert">
          {error}
        </p>
      ) : null}

      {roots === null ? (
        <LoadingState />
      ) : roots.length === 0 && !showForm ? (
        <EmptyState
          ns="admin"
          titleKey="ingestSourcesEmpty"
          detailKey="ingestSourcesEmptyDetail"
        />
      ) : (
        <ul className={ingestStyles.settingsList}>
          {roots.map((root) => (
            <li key={root.id} className={ingestStyles.settingsRow}>
              <p className={ingestStyles.settingsRowTitle}>{root.name}</p>
              <p className={ingestStyles.settingsRowMeta}>
                {locationName(root.storageLocationId)} ·{" "}
                {root.enabled ? t("ingestSourceEnabled") : t("ingestSourceDisabled")}{" "}
                ·{" "}
                {root.recursive
                  ? t("ingestSourceRecursive")
                  : t("ingestSourceNonRecursive")}
                {root.contentTypeHint ? ` · ${root.contentTypeHint}` : ""}
              </p>
              {canWrite ? (
                <p className={storageStyles.rowActions}>
                  <Button type="button" onClick={() => startEdit(root)}>
                    {t("storageEdit")}
                  </Button>{" "}
                  <Button type="button" onClick={() => void deleteRoot(root.id)}>
                    {t("ingestSourceDelete")}
                  </Button>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canWrite && !showForm ? (
        <p className={storageStyles.sectionActions}>
          <Button
            type="button"
            onClick={startCreate}
            disabled={storageLocations.length === 0}
          >
            {t("ingestSourceAdd")}
          </Button>
        </p>
      ) : null}

      {canWrite && showForm ? (
        <div className={storageStyles.editPanel}>
          <h4 className={storageStyles.formTitle}>
            {editingId ? t("ingestSourceEdit") : t("ingestSourceAdd")}
          </h4>
          <div className={storageStyles.formFields}>
            <TextField
              id="ingest-source-name"
              label={t("ingestSourceName")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <label className={storageStyles.fieldLabel}>
              {t("ingestSourceStorage")}
              <select
                className={storageStyles.select}
                value={form.storageLocationId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, storageLocationId: e.target.value }))
                }
              >
                {storageLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              id="ingest-source-hint"
              label={t("ingestSourceContentHint")}
              value={form.contentTypeHint}
              onChange={(e) =>
                setForm((f) => ({ ...f, contentTypeHint: e.target.value }))
              }
            />
          </div>
          <label className={storageStyles.checkboxRow}>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, enabled: e.target.checked }))
              }
            />
            {t("ingestSourceEnabled")}
          </label>
          <label className={storageStyles.checkboxRow}>
            <input
              type="checkbox"
              checked={form.recursive}
              onChange={(e) =>
                setForm((f) => ({ ...f, recursive: e.target.checked }))
              }
            />
            {t("ingestSourceRecursive")}
          </label>
          <div className={storageStyles.editActions}>
            <Button type="button" onClick={() => void submitForm()}>
              {t("storageSave")}
            </Button>
            <Button type="button" onClick={cancelForm}>
              {t("storageCancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
