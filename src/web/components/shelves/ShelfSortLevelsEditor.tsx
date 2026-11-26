import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import {
  SHELF_SORT_FIELDS,
  type ShelfSortFieldId,
  type ShelfSortLevel,
} from "@shared/shelf-sort";
import styles from "./shelf-editor.module.css";
import { CloseIconButton, DragHandleIcon } from "../icons/UiIconButtons";

const MAX_SORT_LEVELS = 5;

interface ShelfSortLevelsEditorProps {
  levels: ShelfSortLevel[];
  fields: ShelfSortFieldId[];
  onChange: (levels: ShelfSortLevel[]) => void;
}

function fieldLabel(fieldId: ShelfSortFieldId): string {
  return SHELF_SORT_FIELDS.find((f) => f.id === fieldId)?.label ?? fieldId;
}

function SortableSortRow({
  level,
  index,
  fields,
  onChange,
  onRemove,
}: {
  level: ShelfSortLevel;
  index: number;
  fields: ShelfSortFieldId[];
  onChange: (level: ShelfSortLevel) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("shelves");
  const sortId = `sort:${index}`;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${styles.sortRow} ${isDragging ? styles.sortRowDragging : ""}`}
    >
      <button
        type="button"
        className={styles.dragHandle}
        aria-label={t("dragSortLevel", {
          field: fieldLabel(level.field),
          index: index + 1,
        })}
        {...listeners}
        {...attributes}
      >
        <DragHandleIcon />
      </button>
      <select
        className={styles.sortSelect}
        value={level.field}
        aria-label={t("sortField")}
        onChange={(e) =>
          onChange({
            ...level,
            field: e.target.value as ShelfSortLevel["field"],
          })
        }
      >
        {fields.map((f) => (
          <option key={f} value={f}>
            {fieldLabel(f)}
          </option>
        ))}
      </select>
      <select
        className={styles.sortSelect}
        value={level.order}
        aria-label={t("sortOrder")}
        onChange={(e) =>
          onChange({
            ...level,
            order: e.target.value as "asc" | "desc",
          })
        }
      >
        <option value="asc">
          {t(`sortOrder_asc_${level.field}`, {
            defaultValue: t("sortOrder_asc_default"),
          })}
        </option>
        <option value="desc">
          {t(`sortOrder_desc_${level.field}`, {
            defaultValue: t("sortOrder_desc_default"),
          })}
        </option>
      </select>
      <CloseIconButton
        className={styles.sortRemove}
        aria-label={t("removeSortLevel", { field: fieldLabel(level.field) })}
        onClick={onRemove}
      />
    </li>
  );
}

export function ShelfSortLevelsEditor({
  levels,
  fields,
  onChange,
}: ShelfSortLevelsEditorProps) {
  const { t } = useTranslation("shelves");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const rows = levels;
  const sortIds = rows.map((_, i) => `sort:${i}`);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortIds.indexOf(String(active.id));
    const newIndex = sortIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(rows, oldIndex, newIndex));
  }

  function addLevel() {
    if (rows.length >= MAX_SORT_LEVELS) return;
    onChange([
      ...rows,
      {
        field: (fields[0] ?? "title") as ShelfSortFieldId,
        order: "asc",
      },
    ]);
  }

  function updateLevel(index: number, level: ShelfSortLevel) {
    const next = [...rows];
    next[index] = level;
    onChange(next);
  }

  function removeLevel(index: number) {
    const next = [...rows];
    next.splice(index, 1);
    onChange(next);
  }

  return (
    <section className={styles.section} aria-labelledby="shelf-sorting-heading">
      <h3 id="shelf-sorting-heading" className={styles.sectionTitle}>
        {t("sectionSorting")}
      </h3>
      <p className={styles.sectionLead}>{t("sortingLead")}</p>

      {rows.length === 0 ? (
        <>
          <p className={styles.emptyState}>{t("noSortLevels")}</p>
          <button type="button" className={styles.addAction} onClick={addLevel}>
            + {t("addSortLevel")}
          </button>
        </>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortIds}
              strategy={verticalListSortingStrategy}
            >
              <ul className={styles.sortList}>
                {rows.map((level, index) => (
                  <SortableSortRow
                    key={sortIds[index]}
                    level={level}
                    index={index}
                    fields={fields}
                    onChange={(updated) => updateLevel(index, updated)}
                    onRemove={() => removeLevel(index)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {rows.length < MAX_SORT_LEVELS && (
            <button
              type="button"
              className={styles.addAction}
              onClick={addLevel}
            >
              + {t("addSortLevel")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
