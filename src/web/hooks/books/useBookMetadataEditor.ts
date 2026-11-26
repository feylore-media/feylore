import { useCallback, useEffect, useMemo, useState } from "react";
import type { BookMetadataEditorData } from "@shared/book-metadata-editor";
import { parseBookFieldValueForSave } from "@shared/book-metadata-field-kinds";
import { api } from "../../app/api";

export function useBookMetadataEditor(slug: string | undefined) {
  const [data, setData] = useState<BookMetadataEditorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [pendingFields, setPendingFields] = useState<
    Record<string, { value: string; sourceKey: string }>
  >({});

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void api<{ data: BookMetadataEditorData }>(`/books/${slug}/metadata/editor`)
      .then((r) => {
        setData(r.data);
        setEditedFields({});
        setPendingFields({});
      })
      .catch((e: Error) => {
        setError(e.message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const sourceLabels = useMemo(() => {
    if (!data) return new Map<string, string>();
    const labels = new Map<string, string>();
    for (const source of data.providerSources) {
      labels.set(source.key, source.label);
    }
    return labels;
  }, [data]);

  const getFieldValue = useCallback(
    (fieldId: string): string => {
      if (pendingFields[fieldId]) return pendingFields[fieldId].value;
      if (editedFields[fieldId] !== undefined) return editedFields[fieldId];
      const field = data?.fields.find((f) => f.id === fieldId);
      return field?.feyloreValue ?? "";
    },
    [data, editedFields, pendingFields],
  );

  const editFieldValue = useCallback((fieldId: string, value: string) => {
    setEditedFields((prev) => ({ ...prev, [fieldId]: value }));
    setPendingFields((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        fields: current.fields.map((f) =>
          f.id === fieldId ? { ...f, feyloreValue: value } : f,
        ),
      };
    });
  }, []);

  const adoptProviderValue = useCallback(
    (fieldId: string, sourceKey: string, value: string) => {
      setPendingFields((prev) => ({
        ...prev,
        [fieldId]: { value, sourceKey },
      }));
      setEditedFields((prev) => {
        if (prev[fieldId] === undefined) return prev;
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          fields: current.fields.map((f) =>
            f.id === fieldId ? { ...f, feyloreValue: value } : f,
          ),
        };
      });
    },
    [],
  );

  const toggleFieldLock = useCallback(
    async (fieldId: string) => {
      if (!slug || !data) return;
      const field = data.fields.find((f) => f.id === fieldId);
      if (!field) return;

      if (field.isLocked) {
        await api(`/books/${slug}/metadata/${fieldId}`, { method: "DELETE" });
      } else {
        const pending = pendingFields[fieldId];
        const edited = editedFields[fieldId];
        const value = pending?.value ?? edited ?? field.feyloreValue;
        const sourceKey = pending?.sourceKey;
        await api(`/books/${slug}/metadata`, {
          method: "PATCH",
          body: JSON.stringify({
            field: fieldId,
            value: parseBookFieldValueForSave(fieldId, value ?? ""),
            ...(sourceKey ? { sourceKey } : {}),
          }),
        });
      }
      load();
    },
    [slug, data, pendingFields, editedFields, load],
  );

  const save = useCallback(async () => {
    if (!slug) return;

    const bulkFields: Record<string, unknown> = {};
    for (const [fieldId, value] of Object.entries(editedFields)) {
      if (pendingFields[fieldId]) continue;
      bulkFields[fieldId] = parseBookFieldValueForSave(fieldId, value);
    }

    if (Object.keys(bulkFields).length > 0) {
      await api(`/books/${slug}/metadata/fields`, {
        method: "PATCH",
        body: JSON.stringify({ fields: bulkFields }),
      });
    }

    for (const [fieldId, { value, sourceKey }] of Object.entries(pendingFields)) {
      await api(`/books/${slug}/metadata`, {
        method: "PATCH",
        body: JSON.stringify({
          field: fieldId,
          value: parseBookFieldValueForSave(fieldId, value),
          sourceKey,
        }),
      });
    }

    setEditedFields({});
    setPendingFields({});
    load();
  }, [slug, editedFields, pendingFields, load]);

  const hasUnsavedChanges =
    Object.keys(editedFields).length > 0 || Object.keys(pendingFields).length > 0;

  return {
    data,
    loading,
    error,
    reload: load,
    sourceLabels,
    getFieldValue,
    editFieldValue,
    adoptProviderValue,
    toggleFieldLock,
    save,
    hasUnsavedChanges,
  };
}
