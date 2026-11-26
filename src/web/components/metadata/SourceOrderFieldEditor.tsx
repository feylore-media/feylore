import { useState } from "react";
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
import type { FieldSourceOrderRow } from "./FieldSourceOrderTable";
import styles from "./metadata-settings.module.css";
import { CloseIconButton, DragHandleIcon } from "../icons/UiIconButtons";

interface SourceOrderFieldEditorProps {
  field: FieldSourceOrderRow;
  providerName: (key: string) => string;
  onChange: (field: FieldSourceOrderRow) => void;
}

function SortableSourceRow({
  sourceKey,
  field,
  providerName,
  index,
  total,
  onMove,
  onRemove,
  onChangeSource,
  eligibleSources,
}: {
  sourceKey: string;
  field: FieldSourceOrderRow;
  providerName: (key: string) => string;
  index: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onChangeSource: (newKey: string) => void;
  eligibleSources: string[];
}) {
  const { t } = useTranslation("metadata");
  const sortId = `${field.fieldId}:provider:${sourceKey}:${index}`;

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
      className={`${styles.sourceOrderSortItem} ${isDragging ? styles.sourceOrderSortItemDragging : ""}`}
    >
      <button
        type="button"
        className={styles.sourceOrderDragHandle}
        aria-label={t("dragToReorder", {
          source: providerName(sourceKey),
          field: field.label,
        })}
        {...listeners}
        {...attributes}
      >
        <DragHandleIcon />
      </button>
      <span className={styles.sourceOrderSortRank} aria-hidden>
        {index + 1}
      </span>
      <select
        className={styles.sourceOrderSortSelect}
        value={sourceKey}
        aria-label={t("selectSourceFor", {
          field: field.label,
          rank: index + 1,
        })}
        onChange={(e) => onChangeSource(e.target.value)}
      >
        {eligibleSources.map((key) => (
          <option key={key} value={key}>
            {providerName(key)}
          </option>
        ))}
      </select>
      <div className={styles.sourceOrderSortActions}>
        <button
          type="button"
          className={styles.sourceOrderIconBtn}
          disabled={index === 0}
          aria-label={t("moveUp")}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className={styles.sourceOrderIconBtn}
          disabled={index === total - 1}
          aria-label={t("moveDown")}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <CloseIconButton
          className={styles.sourceOrderIconBtn}
          aria-label={t("removeSource")}
          onClick={onRemove}
        />
      </div>
    </li>
  );
}

export function SourceOrderFieldEditor({
  field,
  providerName,
  onChange,
}: SourceOrderFieldEditorProps) {
  const { t } = useTranslation("metadata");
  const [showAddMenu, setShowAddMenu] = useState(false);
  const sourceOrder = field.providerSourceOrder;
  const unorderedEligible = field.unorderedEligibleProviders;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortIds = sourceOrder.map(
    (key, i) => `${field.fieldId}:provider:${key}:${i}`,
  );

  function eligibleSourcesFor(): string[] {
    return [...sourceOrder, ...unorderedEligible];
  }

  function applyOrder(nextOrder: string[]) {
    const orderedSet = new Set(nextOrder);
    const nextEligible = [
      ...unorderedEligible.filter((k) => !orderedSet.has(k)),
      ...sourceOrder.filter((k) => !nextOrder.includes(k)),
    ];
    onChange({
      ...field,
      providerSourceOrder: nextOrder,
      unorderedEligibleProviders: [...new Set(nextEligible)],
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortIds.indexOf(String(active.id));
    const newIndex = sortIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    applyOrder(arrayMove(sourceOrder, oldIndex, newIndex));
  }

  function moveSource(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sourceOrder.length) return;
    applyOrder(arrayMove(sourceOrder, index, target));
  }

  function changeSourceAt(index: number, newSourceKey: string) {
    const order = [...sourceOrder];
    const previous = order[index]!;
    order[index] = newSourceKey;
    const deduped = order.filter((key, i) => order.indexOf(key) === i);
    const nextEligible = unorderedEligible.filter((k) => k !== newSourceKey);
    if (previous !== newSourceKey && !deduped.includes(previous)) {
      nextEligible.push(previous);
    }
    onChange({
      ...field,
      providerSourceOrder: deduped,
      unorderedEligibleProviders: nextEligible,
    });
  }

  function removeSource(index: number) {
    const order = [...sourceOrder];
    const removed = order.splice(index, 1)[0];
    if (!removed) return;
    const nextEligible = unorderedEligible.includes(removed)
      ? unorderedEligible
      : [...unorderedEligible, removed];
    onChange({
      ...field,
      providerSourceOrder: order,
      unorderedEligibleProviders: nextEligible,
    });
  }

  function addSource(sourceKey: string) {
    if (!sourceKey) return;
    onChange({
      ...field,
      providerSourceOrder: [...sourceOrder, sourceKey],
      unorderedEligibleProviders: unorderedEligible.filter((k) => k !== sourceKey),
    });
    setShowAddMenu(false);
  }

  return (
    <div className={styles.sourceOrderEditor}>
      <p className={styles.sourceOrderEditorTitle}>
        {field.label} — {t("metadataProviders")}
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
          <ul className={styles.sourceOrderSortList}>
            {sourceOrder.map((sourceKey, index) => (
              <SortableSourceRow
                key={sortIds[index]}
                sourceKey={sourceKey}
                field={field}
                providerName={providerName}
                index={index}
                total={sourceOrder.length}
                eligibleSources={eligibleSourcesFor()}
                onMove={(dir) => moveSource(index, dir)}
                onRemove={() => removeSource(index)}
                onChangeSource={(key) => changeSourceAt(index, key)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {unorderedEligible.length > 0 && (
        <div className={styles.sourceOrderAddRow}>
          {showAddMenu ? (
            <div className={styles.sourceOrderAddMenu}>
              <select
                className={styles.sourceOrderSortSelect}
                defaultValue=""
                aria-label={t("addSource")}
                autoFocus
                onChange={(e) => {
                  addSource(e.target.value);
                  e.target.value = "";
                }}
                onBlur={() => setShowAddMenu(false)}
              >
                <option value="" disabled>
                  {t("selectSource")}
                </option>
                {unorderedEligible.map((key) => (
                  <option key={key} value={key}>
                    {providerName(key)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <button
              type="button"
              className={styles.sourceOrderAddBtn}
              onClick={() => setShowAddMenu(true)}
            >
              + {t("addSource")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
