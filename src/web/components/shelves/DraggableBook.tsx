import { useDraggable } from "@dnd-kit/core";
import type { BookListItem } from "@shared/books";
import { BookCard } from "../books/BookCard";
import { BookListRow } from "../books/BookListRow";
import { BOOK_DRAG_TYPE, type BookDragData } from "./dnd-types";
import styles from "./shelves.module.css";
import { DragHandleIcon } from "../icons/UiIconButtons";

interface DraggableBookCardProps {
  book: BookListItem;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: (id: string) => void;
  disabled?: boolean;
}

export function DraggableBookCard({
  book,
  disabled,
  ...props
}: DraggableBookCardProps) {
  const dragData: BookDragData = {
    type: BOOK_DRAG_TYPE,
    subjectType: "book",
    subjectId: book.id,
    title: book.title,
  };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `book-drag-${book.id}`,
    data: dragData,
    disabled: disabled || props.selectionMode,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.draggable} ${isDragging ? styles.sortableDragging : ""}`}
    >
      {!props.selectionMode && !disabled && (
        <button
          type="button"
          className={styles.dragHandle}
          aria-label={`Drag ${book.title}`}
          {...listeners}
          {...attributes}
        >
          <DragHandleIcon />
        </button>
      )}
      <BookCard book={book} {...props} />
    </div>
  );
}

export function DraggableBookListRow({
  book,
  disabled,
  selected,
  selectionMode,
  onToggleSelect,
}: DraggableBookCardProps) {
  const dragData: BookDragData = {
    type: BOOK_DRAG_TYPE,
    subjectType: "book",
    subjectId: book.id,
    title: book.title,
  };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `book-drag-row-${book.id}`,
    data: dragData,
    disabled: disabled || selectionMode,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.draggable} ${isDragging ? styles.sortableDragging : ""}`}
      style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
    >
      {!disabled && !selectionMode && (
        <button
          type="button"
          className={styles.dragHandle}
          aria-label={`Drag ${book.title}`}
          {...listeners}
          {...attributes}
        >
          <DragHandleIcon />
        </button>
      )}
      <div style={{ flex: 1 }}>
        <BookListRow
          book={book}
          selected={selected}
          selectionMode={selectionMode}
          onToggleSelect={onToggleSelect}
        />
      </div>
    </div>
  );
}
