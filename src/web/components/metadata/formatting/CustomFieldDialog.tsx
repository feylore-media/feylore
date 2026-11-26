import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  CustomFieldDefinitionDto,
  CustomFieldEntityType,
  CustomFieldMediaModule,
  CustomFieldOption,
} from "@shared/custom-metadata-fields";
import { CUSTOM_FIELD_TYPES } from "@shared/metadata-fields";
import { api } from "../../../app/api";
import { Button, TextField } from "../../primitives";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/Dialog";
import fmtStyles from "./formatting.module.css";

type OptionDraft = { key: string; label: string };

export function CustomFieldDialog({
  open,
  onOpenChange,
  mediaModule,
  entityType,
  field,
  onSaved,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaModule: CustomFieldMediaModule;
  entityType: CustomFieldEntityType;
  field: CustomFieldDefinitionDto | null;
  onSaved: () => void | Promise<void>;
  onError: (text: string) => void;
}) {
  const { t } = useTranslation("admin");
  const isEdit = field !== null;
  const [key, setKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [type, setType] = useState<(typeof CUSTOM_FIELD_TYPES)[number]>("text");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (field) {
      setKey(field.key);
      setDisplayName(field.displayName);
      setType(field.type);
      setDescription(field.description ?? "");
      setOptions(field.options.map((o) => ({ key: o.key, label: o.label })));
    } else {
      setKey("");
      setDisplayName("");
      setType("text");
      setDescription("");
      setOptions([{ key: "", label: "" }]);
    }
  }, [open, field]);

  const needsOptions = type === "select" || type === "multi_select";

  async function handleSave() {
    setSaving(true);
    try {
      const optionPayload: CustomFieldOption[] = options
        .filter((o) => o.key.trim() && o.label.trim())
        .map((o, i) => ({ key: o.key.trim(), label: o.label.trim(), sortOrder: i }));

      if (isEdit && field) {
        await api(`/metadata/formatting/custom-fields/${field.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            displayName,
            description: description || null,
            ...(needsOptions ? { options: optionPayload } : {}),
          }),
        });
      } else {
        await api("/metadata/formatting/custom-fields", {
          method: "POST",
          body: JSON.stringify({
            mediaModule,
            entityType,
            key,
            displayName,
            type,
            description: description || undefined,
            ...(needsOptions ? { options: optionPayload } : {}),
          }),
        });
      }
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("formattingSaveError"));
    } finally {
      setSaving(false);
    }
  }

  function updateOption(index: number, patch: Partial<OptionDraft>) {
    setOptions((prev) =>
      prev.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("customFieldsEdit") : t("customFieldsAdd")}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className={fmtStyles.customFieldForm}>
            <TextField
              id="cf-key"
              label={t("customFieldsColKey")}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={isEdit}
            />
            <TextField
              id="cf-display-name"
              label={t("customFieldsColField")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <label className={fmtStyles.formLabel}>
              {t("customFieldsColType")}
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as (typeof CUSTOM_FIELD_TYPES)[number])
                }
                disabled={isEdit}
              >
                {CUSTOM_FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {ft}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              id="cf-description"
              label={t("customFieldsDescription")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {needsOptions && (
              <fieldset className={fmtStyles.optionsFieldset}>
                <legend>{t("customFieldsOptions")}</legend>
                {options.map((opt, index) => (
                  <div key={index} className={fmtStyles.optionRow}>
                    <TextField
                      id={`cf-opt-key-${index}`}
                      label={t("customFieldsOptionKey")}
                      value={opt.key}
                      onChange={(e) => updateOption(index, { key: e.target.value })}
                    />
                    <TextField
                      id={`cf-opt-label-${index}`}
                      label={t("customFieldsOptionLabel")}
                      value={opt.label}
                      onChange={(e) => updateOption(index, { label: e.target.value })}
                    />
                    <Button
                      type="button"
                      onClick={() =>
                        setOptions((prev) => prev.filter((_, i) => i !== index))
                      }
                      disabled={options.length <= 1}
                    >
                      {t("formattingDelete")}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  onClick={() => setOptions((prev) => [...prev, { key: "", label: "" }])}
                >
                  {t("customFieldsAddOption")}
                </Button>
              </fieldset>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("formattingCancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={saving || !displayName || (!isEdit && !key)}
            onClick={() => void handleSave()}
          >
            {t("formattingSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
