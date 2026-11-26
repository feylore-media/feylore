export const BOOK_DRAG_TYPE = "book" as const;

export interface BookDragData {
  type: typeof BOOK_DRAG_TYPE;
  subjectType: "book";
  subjectId: string;
  title: string;
}

export interface ShelfDropData {
  type: "shelf";
  shelfId: string;
}

export function isBookDragData(data: unknown): data is BookDragData {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as BookDragData).type === BOOK_DRAG_TYPE &&
    (data as BookDragData).subjectType === "book" &&
    typeof (data as BookDragData).subjectId === "string"
  );
}

export function isShelfDropData(data: unknown): data is ShelfDropData {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as ShelfDropData).type === "shelf" &&
    typeof (data as ShelfDropData).shelfId === "string"
  );
}
