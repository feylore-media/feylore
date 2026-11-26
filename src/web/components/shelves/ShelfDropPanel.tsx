import { useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import type { ShelfDropData } from "./dnd-types";
import styles from "./shelves.module.css";

interface ShelfDropPanelProps {
  shelves: Array<{ id: string; name: string }>;
}

export function ShelfDropPanel({ shelves }: ShelfDropPanelProps) {
  const { t } = useTranslation("shelves");

  return (
    <div className={styles.dropPanel} role="region" aria-label={t("dropHint")}>
      <p className={styles.dropPanelLabel}>{t("dropHint")}</p>
      {shelves.map((shelf) => (
        <ShelfDropTarget key={shelf.id} shelfId={shelf.id} name={shelf.name} />
      ))}
    </div>
  );
}

interface ShelfDropTargetProps {
  shelfId: string;
  name: string;
  className?: string;
}

export function ShelfDropTarget({
  shelfId,
  name,
  className,
}: ShelfDropTargetProps) {
  const { t } = useTranslation("shelves");
  const { isOver, setNodeRef } = useDroppable({
    id: `shelf-drop-${shelfId}`,
    data: { type: "shelf", shelfId } satisfies ShelfDropData,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.dropTarget} ${isOver ? styles.dropTargetActive : ""} ${className ?? ""}`}
      aria-label={`${t("dropHint")}: ${name}`}
    >
      {name}
    </div>
  );
}

interface ShelfDropZoneProps {
  shelfId: string;
  children: React.ReactNode;
  className?: string;
}

export function ShelfDropZone({ shelfId, children, className }: ShelfDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `shelf-zone-${shelfId}`,
    data: { type: "shelf", shelfId } satisfies ShelfDropData,
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.dropZone} ${isOver ? styles.dropZoneActive : ""} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
