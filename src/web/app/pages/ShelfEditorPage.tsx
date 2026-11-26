import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { ShelfScopeId } from "@shared/shelf-scopes";
import type { ShelfDetail } from "@shared/shelves";
import { api } from "../api";
import { LoadingState, EmptyState } from "../../components/states";
import { ShelfEditorModal } from "../../components/shelves/ShelfEditorModal";
import { DEFAULT_SHELF_ICON_ID } from "@shared/shelf-icons";
import type { ShelfEditorValues } from "../../components/shelves/ShelfEditorForm";

const defaultValues: ShelfEditorValues = {
  name: "",
  icon: DEFAULT_SHELF_ICON_ID,
  scope: "global",
  visibility: "private",
  membershipExpression: null,
  sortLevels: [],
  editors: [],
  confirmEmptyEditors: false,
  scopeChangeConfirm: false,
};

export function ShelfEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [initial, setInitial] = useState<ShelfEditorValues | null>(
    isNew ? defaultValues : null,
  );
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) return;
    void api<{ data: ShelfDetail }>(`/shelves/${id}`)
      .then((r) => {
        const s = r.data.shelf;
        setInitial({
          name: s.name,
          icon: s.icon,
          scope: s.scope,
          visibility: s.visibility,
          membershipExpression: s.membershipExpression ?? null,
          sortLevels: s.sortLevels,
          editors: r.data.editors,
          confirmEmptyEditors: false,
          scopeChangeConfirm: false,
        });
      })
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const onScopePreview = useCallback(
    async (scope: ShelfScopeId) => {
      if (!id || isNew) return 0;
      const r = await api<{
        data: { incompatibleItems: unknown[] };
      }>(`/shelves/${id}/scope-preview?scope=${encodeURIComponent(scope)}`);
      return r.data.incompatibleItems.length;
    },
    [id, isNew],
  );

  function handleCancel() {
    navigate(isNew ? "/shelves" : `/shelves/${id}`);
  }

  async function handleSubmit(values: ShelfEditorValues) {
    const body = {
      name: values.name,
      icon: values.icon,
      scope: values.scope,
      visibility: values.visibility,
      membershipExpression: values.membershipExpression,
      sortLevels: values.sortLevels,
      editors: values.editors.map((e) => e.userId),
      confirmEmptyEditors: values.confirmEmptyEditors,
      ...(values.scopeChangeConfirm
        ? {
            scopeChange: {
              confirm: true,
              removeIncompatibleManualItems: true,
              pruneIncompatibleExclusions: true,
            },
          }
        : {}),
    };

    if (isNew) {
      const r = await api<{ data: { id: string } }>("/shelves", {
        method: "POST",
        body: JSON.stringify(body),
      });
      navigate(`/shelves/${r.data.id}`);
    } else {
      await api(`/shelves/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      navigate(`/shelves/${id}`);
    }
  }

  if (loading) return <LoadingState />;
  if (!initial) {
    return (
      <EmptyState titleKey="notFound" ns="shelves" detailKey="backToShelves" />
    );
  }

  return (
    <ShelfEditorModal
      isNew={isNew}
      initial={initial}
      shelfId={isNew ? undefined : id}
      onSubmit={handleSubmit}
      onScopePreview={onScopePreview}
      onCancel={handleCancel}
    />
  );
}
