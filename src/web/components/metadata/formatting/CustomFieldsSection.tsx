import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  CustomFieldDefinitionDto,
  CustomFieldEntityType,
  CustomFieldMediaModule,
} from "@shared/custom-metadata-fields";
import {
  getCustomFieldEntityTypes,
} from "@shared/custom-metadata-fields";
import { PERMISSIONS } from "@shared/permissions";
import { api } from "../../../app/api";
import { usePermission } from "../../../app/auth-context";
import { Button } from "../../primitives";
import styles from "../metadata-settings.module.css";
import fmtStyles from "./formatting.module.css";
import { CustomFieldsTable } from "./CustomFieldsTable";
import { CustomFieldDialog } from "./CustomFieldDialog";
import { CustomFieldDeleteDialog } from "./CustomFieldDeleteDialog";

export function CustomFieldsSection({
  message,
  setMessage,
}: {
  message: { type: "ok" | "err"; text: string } | null;
  setMessage: (msg: { type: "ok" | "err"; text: string } | null) => void;
}) {
  const { t } = useTranslation("admin");
  const canWrite = usePermission(PERMISSIONS.METADATA_FORMATTING_WRITE);
  const [modules, setModules] = useState<CustomFieldMediaModule[]>([]);
  const [mediaModule, setMediaModule] = useState<CustomFieldMediaModule>("global");
  const [entityType, setEntityType] = useState<CustomFieldEntityType>("item");
  const [fields, setFields] = useState<CustomFieldDefinitionDto[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinitionDto | null>(
    null,
  );
  const [deleteField, setDeleteField] = useState<CustomFieldDefinitionDto | null>(
    null,
  );

  const entityTypes = getCustomFieldEntityTypes(mediaModule);

  useEffect(() => {
    if (!entityTypes.includes(entityType)) {
      setEntityType(entityTypes[0] ?? "item");
    }
  }, [mediaModule, entityType, entityTypes]);

  const loadModules = useCallback(async () => {
    const res = await api<{ data: { modules: CustomFieldMediaModule[] } }>(
      "/metadata/formatting/custom-fields/modules",
    );
    setModules(res.data.modules);
    if (res.data.modules.length > 0 && !res.data.modules.includes(mediaModule)) {
      setMediaModule(res.data.modules[0]!);
    }
  }, [mediaModule]);

  const loadFields = useCallback(async () => {
    const res = await api<{ data: CustomFieldDefinitionDto[] }>(
      `/metadata/formatting/custom-fields?mediaModule=${encodeURIComponent(mediaModule)}&entityType=${encodeURIComponent(entityType)}`,
    );
    setFields(res.data);
  }, [mediaModule, entityType]);

  useEffect(() => {
    void loadModules().catch(() =>
      setMessage({ type: "err", text: t("formattingLoadError") }),
    );
  }, [loadModules, setMessage, t]);

  useEffect(() => {
    void loadFields().catch(() =>
      setMessage({ type: "err", text: t("formattingLoadError") }),
    );
  }, [loadFields, setMessage, t]);

  async function handleReorder(orderedIds: string[]) {
    await api("/metadata/formatting/custom-fields/reorder", {
      method: "PUT",
      body: JSON.stringify({ mediaModule, entityType, orderedIds }),
    });
    await loadFields();
    setMessage({ type: "ok", text: t("customFieldsSaveSuccess") });
  }

  async function handleDelete() {
    if (!deleteField) return;
    await api(`/metadata/formatting/custom-fields/${deleteField.id}`, {
      method: "DELETE",
    });
    setDeleteField(null);
    await loadFields();
    setMessage({ type: "ok", text: t("customFieldsDeleteSuccess") });
  }

  function moduleLabel(mod: CustomFieldMediaModule): string {
    if (mod === "global") return t("customFieldsModuleGlobal");
    return t(`customFieldsModule_${mod}`, { defaultValue: mod });
  }

  function entityLabel(type: CustomFieldEntityType): string {
    return t(`customFieldsEntity_${type}`);
  }

  return (
    <section className={fmtStyles.vocabularySection}>
      <h3 className={styles.sectionTitle}>{t("formattingCustomFieldsTitle")}</h3>
      <p className={styles.sectionLead}>{t("formattingCustomFieldsDescription")}</p>

      {message && (
        <p
          className={
            message.type === "ok" ? fmtStyles.messageSuccess : fmtStyles.messageError
          }
          role="status"
        >
          {message.text}
        </p>
      )}

      <nav className={styles.moduleTabs} aria-label={t("customFieldsMediaModule")}>
        {modules.map((mod) => (
          <button
            key={mod}
            type="button"
            className={
              mediaModule === mod ? styles.moduleTabActive : styles.moduleTab
            }
            onClick={() => {
              setMediaModule(mod);
              setMessage(null);
            }}
          >
            {moduleLabel(mod)}
          </button>
        ))}
      </nav>

      {entityTypes.length > 1 && (
        <nav className={styles.moduleTabs} aria-label={t("customFieldsEntityType")}>
          {entityTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={
                entityType === type ? styles.moduleTabActive : styles.moduleTab
              }
              onClick={() => {
                setEntityType(type);
                setMessage(null);
              }}
            >
              {entityLabel(type)}
            </button>
          ))}
        </nav>
      )}

      {fields === null ? (
        <p className={fmtStyles.emptyState}>{t("formattingLoading")}</p>
      ) : (
        <>
          <CustomFieldsTable
            fields={fields}
            canWrite={canWrite}
            onEdit={(field) => {
              setEditingField(field);
              setDialogOpen(true);
            }}
            onDelete={setDeleteField}
            onReorder={(ids) => void handleReorder(ids)}
          />
          {canWrite && (
            <Button
              type="button"
              onClick={() => {
                setEditingField(null);
                setDialogOpen(true);
              }}
            >
              {t("customFieldsAdd")}
            </Button>
          )}
        </>
      )}

      <CustomFieldDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mediaModule={mediaModule}
        entityType={entityType}
        field={editingField}
        onSaved={async () => {
          setDialogOpen(false);
          setEditingField(null);
          await loadFields();
          setMessage({ type: "ok", text: t("customFieldsSaveSuccess") });
        }}
        onError={(text) => setMessage({ type: "err", text })}
      />

      <CustomFieldDeleteDialog
        field={deleteField}
        onOpenChange={(open) => {
          if (!open) setDeleteField(null);
        }}
        onConfirm={() => void handleDelete()}
      />
    </section>
  );
}
