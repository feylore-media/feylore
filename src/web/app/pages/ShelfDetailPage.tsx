import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ShelfDetail } from "@shared/shelves";
import { api } from "../api";
import { EmptyState, LoadingState } from "../../components/states";
import { SortableShelfGrid } from "../../components/shelves/SortableShelfGrid";
import { ShelfDropZone } from "../../components/shelves/ShelfDropPanel";
import { ShelfVisibilityIndicator } from "../../components/shelves/ShelfVisibilityIndicator";
import { ShelfIcon } from "../../components/icons/ShelfIcon";
import { Button } from "../../components/primitives";
import pageStyles from "./pages.module.css";

export function ShelfDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation(["shelves", "books"]);
  const [detail, setDetail] = useState<ShelfDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    void api<{ data: ShelfDetail }>(`/shelves/${id}`)
      .then((r) => setDetail(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState />;
  if (error || !detail || !id) {
    return (
      <EmptyState
        titleKey="notFound"
        ns="shelves"
        detailKey="backToShelves"
      />
    );
  }

  const hasResolvableItems = detail.items.some(
    (item) => item.book ?? item.work,
  );

  return (
    <ShelfDropZone shelfId={id} className={pageStyles.page}>
      <p>
        <Link to="/shelves">{t("shelves:backToShelves")}</Link>
      </p>
      <h1>
        <ShelfIcon iconId={detail.shelf.icon} identity className={pageStyles.titleIcon} />
        {detail.shelf.name}
        <ShelfVisibilityIndicator
          visibility={detail.shelf.visibility}
          canEdit={detail.canEdit}
          isOwner={detail.shelf.isOwner}
        />
      </h1>
      <p className={pageStyles.lead}>
        {t("shelves:itemCount", { count: detail.items.length })} ·{" "}
        {t(`shelves:scopes.${detail.shelf.scope}`)}
      </p>
      {detail.canEdit && (
        <p>
          <Link to={`/shelves/${id}/edit`}>
            <Button>{t("shelves:editShelf")}</Button>
          </Link>
        </p>
      )}

      {!hasResolvableItems ? (
        <EmptyState
          titleKey="emptyShelf"
          detailKey="emptyShelfDetail"
          ns="shelves"
        />
      ) : (
        <SortableShelfGrid
          shelfId={id}
          items={detail.items}
          canEdit={detail.canEdit}
          onChanged={load}
        />
      )}
    </ShelfDropZone>
  );
}
