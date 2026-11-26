import { useCallback, useEffect, useState } from "react";
import type { CustomFieldValueDto } from "@shared/custom-metadata-fields";
import { api } from "../../app/api";

export function useBookCustomFieldsEditor(slug: string | undefined) {
  const [fields, setFields] = useState<CustomFieldValueDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editedValues, setEditedValues] = useState<Record<string, unknown>>({});

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    void api<{ data: CustomFieldValueDto[] }>(`/books/${slug}/custom-fields`)
      .then((r) => {
        setFields(r.data);
        setEditedValues({});
      })
      .catch(() => {
        setFields(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const getFieldValue = useCallback(
    (key: string): unknown => {
      if (key in editedValues) return editedValues[key];
      const field = fields?.find((f) => f.key === key);
      return field?.value ?? null;
    },
    [fields, editedValues],
  );

  const editFieldValue = useCallback((key: string, value: unknown) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    if (!slug || Object.keys(editedValues).length === 0) return;
    await api(`/books/${slug}/custom-fields`, {
      method: "PATCH",
      body: JSON.stringify({ values: editedValues }),
    });
    setEditedValues({});
    load();
  }, [slug, editedValues, load]);

  const hasUnsavedChanges = Object.keys(editedValues).length > 0;

  return {
    fields,
    loading,
    getFieldValue,
    editFieldValue,
    save,
    hasUnsavedChanges,
    reload: load,
  };
}
