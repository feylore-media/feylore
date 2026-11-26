import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import type { ResolvedShelfItem } from "@shared/shelves";
import { Link } from "react-router";
import { api } from "../../app/api";
import { Button } from "../primitives";
import { BookCover } from "../books/BookCover";
import { bookPath } from "../../routes/paths";
import bookStyles from "../books/books.module.css";
import styles from "./shelves.module.css";
import { DragHandleIcon } from "../icons/UiIconButtons";

interface SortableShelfGridProps {
  shelfId: string;
  items: ResolvedShelfItem[];
  canEdit: boolean;
  onChanged: () => void;
}

function SortableShelfItem({
  item,
  canEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  item: ResolvedShelfItem;
  canEdit: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { t } = useTranslation(["shelves", "books"]);
  const book = item.book;
  const sortId = `${item.subjectType}:${item.subjectId}`;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortId, disabled: !canEdit || !book });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!book) return null;

  const progressPct =
    book.progress?.totalProgression ?? book.progress?.progression;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.shelfItem} ${isDragging ? styles.sortableDragging : ""}`}
    >
      {canEdit && (
        <button
          type="button"
          className={styles.dragHandle}
          aria-label={`Reorder ${book.title}`}
          {...listeners}
          {...attributes}
        >
          <DragHandleIcon />
        </button>
      )}
      <Link to={bookPath(book.slug)} className={bookStyles.card}>
        <BookCover coverFileId={book.coverFileId} title={book.title} />
        <div className={bookStyles.cardTitle}>{book.title}</div>
        {book.authors.length > 0 && (
          <div className={bookStyles.cardMeta}>{book.authors.join(", ")}</div>
        )}
        {progressPct != null && progressPct > 0 && (
          <div className={bookStyles.progressBar} aria-hidden>
            <div
              className={bookStyles.progressFill}
              style={{ width: `${Math.round(progressPct * 100)}%` }}
            />
          </div>
        )}
      </Link>
      {canEdit && (
        <div className={styles.shelfItemActions}>
          <Button type="button" onClick={onRemove}>
            {t("books:removeFromShelf")}
          </Button>
          <Button type="button" disabled={isFirst} onClick={onMoveUp}>
            {t("shelves:moveUp")}
          </Button>
          <Button type="button" disabled={isLast} onClick={onMoveDown}>
            {t("shelves:moveDown")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function SortableShelfGrid({
  shelfId,
  items,
  canEdit,
  onChanged,
}: SortableShelfGridProps) {
  const visibleItems = useMemo(
    () => items.filter((item) => item.book),
    [items],
  );
  const [localItems, setLocalItems] = useState(visibleItems);

  useEffect(() => {
    setLocalItems(visibleItems);
  }, [visibleItems]);

  const sortIds = localItems.map(
    (item) => `${item.subjectType}:${item.subjectId}`,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  async function persistOrder(nextItems: ResolvedShelfItem[]) {
    await api(`/shelves/${shelfId}/items/order`, {
      method: "PATCH",
      body: JSON.stringify({
        items: nextItems.map((item, index) => ({
          subjectType: item.subjectType,
          subjectId: item.subjectId,
          sortOrder: index,
        })),
      }),
    });
    onChanged();
  }

  async function removeItem(item: ResolvedShelfItem) {
    await api(`/shelves/${shelfId}/items`, {
      method: "DELETE",
      body: JSON.stringify({
        subjectType: item.subjectType,
        subjectId: item.subjectId,
      }),
    });
    onChanged();
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= localItems.length) return;
    const next = arrayMove(localItems, index, target);
    setLocalItems(next);
    void persistOrder(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortIds.indexOf(String(active.id));
    const newIndex = sortIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(localItems, oldIndex, newIndex);
    setLocalItems(next);
    void persistOrder(next);
  }

  const grid = (
    <div className={bookStyles.grid}>
      {localItems.map((item, index) => (
        <SortableShelfItem
          key={`${item.subjectType}:${item.subjectId}`}
          item={item}
          canEdit={canEdit}
          onRemove={() => void removeItem(item)}
          onMoveUp={() => moveItem(index, -1)}
          onMoveDown={() => moveItem(index, 1)}
          isFirst={index === 0}
          isLast={index === localItems.length - 1}
        />
      ))}
    </div>
  );

  if (!canEdit) {
    return grid;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortIds} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
    </DndContext>
  );
}
