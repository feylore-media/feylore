import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../api";
import {
  BINGO_MODE_DOMAINS,
  type BingoCondition,
  type BingoDraft,
  type BingoMode,
  type SquareDraft,
} from "./bingo-utils";
import editorStyles from "./bingo.module.css";
import styles from "./goals.module.css";

type RuleField = {
  id: string;
  label: string;
  domains: readonly string[];
  operators: readonly string[];
};

type CapabilitiesResponse = {
  operators: string[];
  ruleFields: RuleField[];
};

function SquareRow({
  square,
  index,
  total,
  fields,
  operators,
  disabled,
  onPatch,
  onMove,
}: {
  square: SquareDraft;
  index: number;
  total: number;
  fields: RuleField[];
  operators: string[];
  disabled: boolean;
  onPatch: (patch: Partial<SquareDraft>) => void;
  onMove: (from: number, to: number) => void;
}) {
  const { t } = useTranslation("challenges");
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: square.key, disabled });
  const domains = BINGO_MODE_DOMAINS[square.mode];

  function patchCondition(i: number, patch: Partial<BingoCondition>) {
    onPatch({
      conditions: square.conditions.map((condition, j) =>
        j === i ? { ...condition, ...patch } : condition,
      ),
    });
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={editorStyles.editorRow}
    >
      <div className={editorStyles.editorRowTop}>
        <button
          type="button"
          className={editorStyles.dragHandle}
          {...attributes}
          {...listeners}
          aria-label={t("dragToReorder")}
          disabled={disabled}
        >
          ⠿ {index + 1}
        </button>
        <div className={editorStyles.editorRowControls}>
          <button
            type="button"
            disabled={disabled || index === 0}
            onClick={() => onMove(index, index - 1)}
            aria-label={t("moveUp")}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={disabled || index === total - 1}
            onClick={() => onMove(index, index + 1)}
            aria-label={t("moveDown")}
          >
            ↓
          </button>
        </div>
      </div>
      <div className={styles.fieldRow}>
        <label htmlFor={`${square.key}-label`}>{t("squareLabel")}</label>
        <input
          className={styles.input}
          id={`${square.key}-label`}
          value={square.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder={t("squareLabelPlaceholder")}
          disabled={disabled}
        />
      </div>
      <label className={editorStyles.freeToggle}>
        <input
          type="checkbox"
          checked={square.freeSpace}
          onChange={(e) => onPatch({ freeSpace: e.target.checked })}
          disabled={disabled}
        />
        {t("freeSpace")}
      </label>
      {!square.freeSpace && (
        <>
          <div className={styles.fieldRow}>
            <select
              className={styles.select}
              aria-label={t("whatCounts")}
              value={square.mode}
              onChange={(e) => onPatch({ mode: e.target.value as BingoMode })}
              disabled={disabled}
            >
              {(Object.keys(BINGO_MODE_DOMAINS) as BingoMode[]).map((item) => (
                <option key={item} value={item}>
                  {t(item === "any" ? "anyMedia" : item)}
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              aria-label={t("target")}
              type="number"
              min="1"
              value={square.target}
              onChange={(e) => onPatch({ target: Number(e.target.value) })}
              disabled={disabled}
            />
          </div>
          <div className={styles.fieldRow}>
            <label htmlFor={`${square.key}-match`}>
              {t("squareConditions")}
            </label>
            <select
              className={styles.select}
              id={`${square.key}-match`}
              value={square.groupOperator}
              onChange={(e) =>
                onPatch({ groupOperator: e.target.value as "and" | "or" })
              }
              disabled={disabled}
            >
              <option value="and">
                {t("matchAll", { defaultValue: "Match all" })}
              </option>
              <option value="or">
                {t("matchAny", { defaultValue: "Match any" })}
              </option>
            </select>
            <button
              type="button"
              className={styles.addButton}
              disabled={disabled || fields.length === 0}
              onClick={() => {
                const field = fields[0];
                if (!field) return;
                onPatch({
                  conditions: [
                    ...square.conditions,
                    {
                      field: field.id,
                      operator: field.operators[0] ?? "eq",
                      value: "",
                    },
                  ],
                });
              }}
            >
              + {t("addCondition")}
            </button>
          </div>
          <div className={styles.conditions}>
            {square.conditions.map((condition, i) => {
              const field =
                fields.find((candidate) => candidate.id === condition.field) ??
                fields[0];
              const available = fields.filter((candidate) =>
                candidate.domains.some(
                  (domain) => domain === "global" || domains.includes(domain),
                ),
              );
              return (
                <div className={styles.conditionRow} key={i}>
                  <select
                    className={styles.select}
                    aria-label={t("conditionField")}
                    value={condition.field}
                    onChange={(e) =>
                      patchCondition(i, { field: e.target.value })
                    }
                    disabled={disabled}
                  >
                    {available.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.select}
                    aria-label={t("conditionOperator")}
                    value={condition.operator}
                    onChange={(e) =>
                      patchCondition(i, { operator: e.target.value })
                    }
                    disabled={disabled}
                  >
                    {(field?.operators ?? operators).map((operator) => (
                      <option key={operator} value={operator}>
                        {t(
                          `operator${operator[0]?.toUpperCase()}${operator.slice(1)}`,
                        )}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.input}
                    aria-label={t("conditionValue")}
                    value={condition.value}
                    onChange={(e) =>
                      patchCondition(i, { value: e.target.value })
                    }
                    placeholder={t("conditionValue")}
                    disabled={disabled}
                  />
                  <button
                    className={styles.remove}
                    type="button"
                    onClick={() =>
                      onPatch({
                        conditions: square.conditions.filter((_, j) => j !== i),
                      })
                    }
                    aria-label={t("removeCondition")}
                    disabled={disabled}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </li>
  );
}

/**
 * Bingo board editor: size → victory → creator-arranged squares with
 * drag-to-reorder (arrangement matters to Bingo). The board is identical
 * for every participant — no per-participant shuffling.
 */
export function BingoBoardEditor({
  value,
  onChange,
  disabled,
}: {
  value: BingoDraft;
  onChange: (next: BingoDraft) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("challenges");
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(
    null,
  );
  const [styleKeys, setStyleKeys] = useState<string[]>(["default"]);

  useEffect(() => {
    void api<{ data: CapabilitiesResponse }>("/goals/capabilities")
      .then((response) => setCapabilities(response.data))
      .catch(() => setCapabilities(null));
    void api<{ data: Array<{ key: string }> }>("/challenges/board-styles")
      .then((response) => setStyleKeys(response.data.map((style) => style.key)))
      .catch(() => setStyleKeys(["default"]));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = value.squares.findIndex((square) => square.key === active.id);
    const to = value.squares.findIndex((square) => square.key === over.id);
    if (from < 0 || to < 0) return;
    onChange({ ...value, squares: arrayMove(value.squares, from, to) });
  }

  function move(from: number, to: number) {
    onChange({ ...value, squares: arrayMove(value.squares, from, to) });
  }

  function patchSquare(key: string, patch: Partial<SquareDraft>) {
    onChange({
      ...value,
      squares: value.squares.map((square) =>
        square.key === key ? { ...square, ...patch } : square,
      ),
    });
  }

  const fields = capabilities?.ruleFields ?? [];
  const operators = capabilities?.operators ?? [
    "eq",
    "neq",
    "contains",
    "in",
    "gt",
    "gte",
    "lt",
    "lte",
  ];
  const totalLines = 2 * value.size + 2;

  return (
    <>
      <section className={styles.builderSection}>
        <div className={styles.fieldRow}>
          <label htmlFor="bingo-size">{t("boardSize")}</label>
          <select
            className={styles.select}
            id="bingo-size"
            value={value.size}
            onChange={(e) =>
              onChange({
                ...value,
                size: Number(e.target.value) as 3 | 4 | 5,
              })
            }
            disabled={disabled}
          >
            <option value={3}>3 × 3</option>
            <option value={4}>4 × 4</option>
            <option value={5}>5 × 5</option>
          </select>
          <label htmlFor="bingo-victory">{t("victory")}</label>
          <select
            className={styles.select}
            id="bingo-victory"
            value={value.victory}
            onChange={(e) =>
              onChange({
                ...value,
                victory: e.target.value as BingoDraft["victory"],
              })
            }
            disabled={disabled}
          >
            <option value="line">{t("victoryLine")}</option>
            <option value="n_lines">{t("victoryNLines")}</option>
            <option value="blackout">{t("victoryBlackout")}</option>
          </select>
          {value.victory === "n_lines" && (
            <>
              <label htmlFor="bingo-lines">{t("victoryLinesCount")}</label>
              <input
                className={styles.input}
                id="bingo-lines"
                type="number"
                min="1"
                max={totalLines}
                value={value.victoryLines}
                onChange={(e) =>
                  onChange({
                    ...value,
                    victoryLines: Number(e.target.value),
                  })
                }
                disabled={disabled}
              />
            </>
          )}
        </div>
        <div className={styles.fieldRow}>
          <label htmlFor="bingo-style">{t("boardStyle")}</label>
          <select
            className={styles.select}
            id="bingo-style"
            value={value.styleKey}
            onChange={(e) => onChange({ ...value, styleKey: e.target.value })}
            disabled={disabled}
          >
            {styleKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className={styles.builderSection}>
        <h2>
          {t("squares")} ({value.squares.length})
        </h2>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={value.squares.map((square) => square.key)}
            strategy={rectSortingStrategy}
          >
            <ol className={editorStyles.editorList}>
              {value.squares.map((square, index) => (
                <SquareRow
                  key={square.key}
                  square={square}
                  index={index}
                  total={value.squares.length}
                  fields={fields}
                  operators={operators}
                  disabled={disabled}
                  onPatch={(patch) => patchSquare(square.key, patch)}
                  onMove={move}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      </section>
    </>
  );
}
