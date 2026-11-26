import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { api } from "../../app/api";
import {
  BOOK_DRAG_TYPE,
  isBookDragData,
  isShelfDropData,
  type BookDragData,
} from "./dnd-types";
import { ShelfDropPanel } from "./ShelfDropPanel";
import styles from "./shelves.module.css";

interface ShelfOption {
  id: string;
  name: string;
}

interface ShelfDnDContextValue {
  activeBook: BookDragData | null;
}

const ShelfDnDContext = createContext<ShelfDnDContextValue>({
  activeBook: null,
});

export function useShelfDnD() {
  return useContext(ShelfDnDContext);
}

export function ShelfDnDProvider({ children }: { children: ReactNode }) {
  const [activeBook, setActiveBook] = useState<BookDragData | null>(null);
  const [shelves, setShelves] = useState<ShelfOption[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  useEffect(() => {
    if (!activeBook) return;
    void api<{ data: ShelfOption[] }>("/shelves?scope=books").then((r) =>
      setShelves(r.data),
    );
  }, [activeBook]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (isBookDragData(data)) {
      setActiveBook(data);
    }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveBook(null);
    const dragData = event.active.data.current;
    const dropData = event.over?.data.current;
    if (!isBookDragData(dragData) || !isShelfDropData(dropData)) return;

    await api(`/shelves/${dropData.shelfId}/items`, {
      method: "POST",
      body: JSON.stringify({
        subjectType: dragData.subjectType,
        subjectId: dragData.subjectId,
      }),
    });
  }, []);

  return (
    <ShelfDnDContext.Provider value={{ activeBook }}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={(e) => void handleDragEnd(e)}
      >
        {children}
        {activeBook && shelves.length > 0 && (
          <ShelfDropPanel shelves={shelves} />
        )}
        <DragOverlay>
          {activeBook ? (
            <div className={styles.dropTarget}>{activeBook.title}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </ShelfDnDContext.Provider>
  );
}

export { BOOK_DRAG_TYPE };
