import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import {
  QUEST_CANVAS_HEIGHT,
  QUEST_CANVAS_WIDTH,
  QUEST_MODE_DOMAINS,
  freshJunctionNode,
  freshObjectiveNode,
  questDraftIssues,
  type QuestCondition,
  type QuestDraft,
  type QuestMode,
  type QuestNodeDraft,
} from "./quest-utils";
import editorStyles from "./quest.module.css";
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function NodeFields({
  node,
  fields,
  operators,
  disabled,
  onPatch,
}: {
  node: QuestNodeDraft;
  fields: RuleField[];
  operators: string[];
  disabled: boolean;
  onPatch: (patch: Partial<QuestNodeDraft>) => void;
}) {
  const { t } = useTranslation("challenges");
  const domains = QUEST_MODE_DOMAINS[node.mode];

  function patchCondition(i: number, patch: Partial<QuestCondition>) {
    onPatch({
      conditions: node.conditions.map((condition, j) =>
        j === i ? { ...condition, ...patch } : condition,
      ),
    });
  }

  return (
    <>
      <div className={styles.fieldRow}>
        <select
          className={styles.select}
          aria-label={t("whatCounts")}
          value={node.mode}
          onChange={(e) => onPatch({ mode: e.target.value as QuestMode })}
          disabled={disabled}
        >
          {(Object.keys(QUEST_MODE_DOMAINS) as QuestMode[]).map((item) => (
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
          value={node.target}
          onChange={(e) => onPatch({ target: Number(e.target.value) })}
          disabled={disabled}
        />
      </div>
      <div className={styles.fieldRow}>
        <label>{t("squareConditions")}</label>
        <select
          className={styles.select}
          aria-label={t("squareConditions")}
          value={node.groupOperator}
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
                ...node.conditions,
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
        {node.conditions.map((condition, i) => {
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
                onChange={(e) => patchCondition(i, { field: e.target.value })}
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
                onChange={(e) => patchCondition(i, { operator: e.target.value })}
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
                onChange={(e) => patchCondition(i, { value: e.target.value })}
                placeholder={t("conditionValue")}
                disabled={disabled}
              />
              <button
                className={styles.remove}
                type="button"
                onClick={() =>
                  onPatch({
                    conditions: node.conditions.filter((_, j) => j !== i),
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
  );
}

/**
 * Quest Map editor: add objectives/junctions/side nodes, connect nodes by
 * clicking source then target, drag nodes around the canvas (position is
 * presentation only — moving a node never changes Quest rules), mark
 * nodes optional, and choose ANY/ALL where paths converge. The map is
 * identical for every participant.
 */
export function QuestMapEditor({
  value,
  onChange,
  disabled,
}: {
  value: QuestDraft;
  onChange: (next: QuestDraft) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("challenges");
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(
    null,
  );
  const [styleKeys, setStyleKeys] = useState<string[]>(["default"]);
  const [selectedKey, setSelectedKey] = useState<string>(
    value.nodes[0]?.key ?? "",
  );
  const [linking, setLinking] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api<{ data: CapabilitiesResponse }>("/goals/capabilities")
      .then((response) => setCapabilities(response.data))
      .catch(() => setCapabilities(null));
    void api<{ data: Array<{ key: string }> }>("/challenges/quest-styles")
      .then((response) => setStyleKeys(response.data.map((style) => style.key)))
      .catch(() => setStyleKeys(["default"]));
  }, []);

  const selected = value.nodes.find((node) => node.key === selectedKey) ?? null;
  const incomingCount = (key: string) =>
    value.edges.filter((edge) => edge.to === key).length;

  function patchNode(key: string, patch: Partial<QuestNodeDraft>) {
    onChange({
      ...value,
      nodes: value.nodes.map((node) =>
        node.key === key ? { ...node, ...patch } : node,
      ),
    });
  }

  function removeNode(key: string) {
    const node = value.nodes.find((entry) => entry.key === key);
    if (!node || node.kind === "start" || node.kind === "finish") return;
    onChange({
      ...value,
      nodes: value.nodes.filter((entry) => entry.key !== key),
      edges: value.edges.filter(
        (edge) => edge.from !== key && edge.to !== key,
      ),
    });
    if (selectedKey === key) setSelectedKey(value.nodes[0]?.key ?? "");
  }

  function addNode(node: QuestNodeDraft, connectAfter = true) {
    let edges = value.edges;
    if (connectAfter) {
      // Attach the new node after the selected node (or start) so it is
      // never orphaned; authors rewire from there.
      const anchor =
        value.nodes.find((entry) => entry.key === selectedKey) ??
        value.nodes.find((entry) => entry.kind === "start");
      if (anchor) edges = [...edges, { from: anchor.key, to: node.key }];
    }
    onChange({ ...value, nodes: [...value.nodes, node], edges });
    setSelectedKey(node.key);
  }

  function handleCanvasNodeClick(key: string) {
    if (disabled) return;
    if (linking) {
      if (!linkFrom) {
        const fromNode = value.nodes.find((entry) => entry.key === key);
        // Finish nodes have no outgoing edges.
        if (fromNode?.kind === "finish") return;
        setLinkFrom(key);
        return;
      }
      if (linkFrom === key) {
        setLinkFrom(null);
        return;
      }
      const toNode = value.nodes.find((entry) => entry.key === key);
      // Start nodes have no incoming edges.
      if (toNode?.kind === "start") {
        setLinkFrom(null);
        return;
      }
      const exists = value.edges.some(
        (edge) => edge.from === linkFrom && edge.to === key,
      );
      if (!exists) {
        onChange({ ...value, edges: [...value.edges, { from: linkFrom, to: key }] });
      }
      setLinkFrom(null);
      setLinking(false);
      return;
    }
    setSelectedKey(key);
  }

  function canvasPosition(event: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp(
        ((event.clientX - rect.left) / rect.width) * QUEST_CANVAS_WIDTH,
        0,
        QUEST_CANVAS_WIDTH,
      ),
      y: clamp(
        ((event.clientY - rect.top) / rect.height) * QUEST_CANVAS_HEIGHT,
        0,
        QUEST_CANVAS_HEIGHT,
      ),
    };
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
  const issues = questDraftIssues(value);
  const byKey = new Map(value.nodes.map((node) => [node.key, node]));

  return (
    <>
      <section className={styles.builderSection}>
        <div className={styles.fieldRow}>
          <label htmlFor="quest-style">{t("mapStyle")}</label>
          <select
            className={styles.select}
            id="quest-style"
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
        <div className={styles.fieldRow}>
          <button
            type="button"
            className={styles.addButton}
            disabled={disabled}
            onClick={() =>
              addNode(
                freshObjectiveNode(
                  QUEST_CANVAS_WIDTH / 2,
                  QUEST_CANVAS_HEIGHT / 2,
                ),
              )
            }
          >
            + {t("addObjectiveNode")}
          </button>
          <button
            type="button"
            className={styles.addButton}
            disabled={disabled}
            onClick={() =>
              addNode(
                freshObjectiveNode(
                  QUEST_CANVAS_WIDTH / 2,
                  QUEST_CANVAS_HEIGHT / 2 + 120,
                  true,
                ),
              )
            }
          >
            + {t("addOptionalNode")}
          </button>
          <button
            type="button"
            className={styles.addButton}
            disabled={disabled}
            onClick={() => addNode(freshJunctionNode())}
          >
            + {t("addJunctionNode")}
          </button>
          <button
            type="button"
            className={linking ? styles.choiceSelected : styles.choice}
            disabled={disabled}
            onClick={() => {
              setLinking(!linking);
              setLinkFrom(null);
            }}
            aria-pressed={linking}
          >
            {linking
              ? linkFrom
                ? t("linkPickTarget", {
                    defaultValue: "Pick the next node…",
                  })
                : t("linkPickSource", { defaultValue: "Pick the first node…" })
              : t("connectNodes")}
          </button>
        </div>
        <p className={styles.helper}>{t("questEditorHint")}</p>
        {issues.length > 0 && (
          <p className={styles.helper} role="alert">
            {t("questIssues")}: {issues.join(" · ")}
          </p>
        )}
      </section>

      <section className={styles.builderSection}>
        <h2>
          {t("questMap")} ({value.nodes.length} · {value.edges.length})
        </h2>
        <div
          ref={canvasRef}
          className={editorStyles.editorCanvas}
          data-linking={linking ? "true" : "false"}
          onPointerMove={(event) => {
            if (!dragKey || disabled || linking) return;
            const position = canvasPosition(event);
            patchNode(dragKey, { x: position.x, y: position.y });
          }}
          onPointerUp={() => setDragKey(null)}
          onPointerLeave={() => setDragKey(null)}
        >
          <svg
            className={editorStyles.editorPaths}
            viewBox={`0 0 ${QUEST_CANVAS_WIDTH} ${QUEST_CANVAS_HEIGHT}`}
            aria-hidden="true"
          >
            {value.edges.map((edge, index) => {
              const from = byKey.get(edge.from);
              const to = byKey.get(edge.to);
              if (!from || !to) return null;
              return (
                <line
                  key={`${edge.from}-${edge.to}-${index}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={editorStyles.editorPath}
                />
              );
            })}
          </svg>
          {value.nodes.map((node) => (
            <div
              key={node.key}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${node.label || node.kind} — ${node.kind}`}
              aria-pressed={selectedKey === node.key}
              className={editorStyles.editorNode}
              style={{
                left: `${(node.x / QUEST_CANVAS_WIDTH) * 100}%`,
                top: `${(node.y / QUEST_CANVAS_HEIGHT) * 100}%`,
              }}
              data-kind={node.kind}
              data-selected={selectedKey === node.key ? "true" : "false"}
              data-link-source={linkFrom === node.key ? "true" : "false"}
              onClick={() => handleCanvasNodeClick(node.key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleCanvasNodeClick(node.key);
                }
              }}
              onPointerDown={(event) => {
                if (disabled || linking) return;
                // Drag repositions (presentation only); a plain click selects.
                event.stopPropagation();
                setDragKey(node.key);
                setSelectedKey(node.key);
              }}
            >
              <span className={editorStyles.editorNodeLabel}>
                {node.label || node.kind}
              </span>
              <span className={editorStyles.editorNodeKind}>{node.kind}</span>
            </div>
          ))}
        </div>
        {value.edges.length > 0 && (
          <ul className={editorStyles.editorEdgeList}>
            {value.edges.map((edge, index) => (
              <li
                key={`${edge.from}-${edge.to}-${index}`}
                className={editorStyles.editorEdge}
              >
                <span>
                  {byKey.get(edge.from)?.label || edge.from} →{" "}
                  {byKey.get(edge.to)?.label || edge.to}
                </span>
                <button
                  type="button"
                  className={styles.remove}
                  disabled={disabled}
                  aria-label={t("removeEdge")}
                  onClick={() =>
                    onChange({
                      ...value,
                      edges: value.edges.filter((_, j) => j !== index),
                    })
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <section className={styles.builderSection}>
          <h2>
            {t("nodeLabel")}: {selected.label || selected.kind}
          </h2>
          <div className={styles.fieldRow}>
            <label htmlFor={`quest-node-${selected.key}`}>{t("nodeLabel")}</label>
            <input
              className={styles.input}
              id={`quest-node-${selected.key}`}
              value={selected.label}
              onChange={(e) => patchNode(selected.key, { label: e.target.value })}
              placeholder={t("questNodePlaceholder")}
              disabled={disabled}
            />
          </div>
          {selected.kind === "objective" && (
            <label className={editorStyles.freeToggle}>
              <input
                type="checkbox"
                checked={selected.optional}
                onChange={(e) =>
                  patchNode(selected.key, { optional: e.target.checked })
                }
                disabled={disabled}
              />
              {t("nodeOptional")}
            </label>
          )}
          {(selected.kind === "objective" ||
            selected.kind === "junction" ||
            selected.kind === "finish") && (
            <div className={styles.fieldRow}>
              <label htmlFor={`quest-join-${selected.key}`}>{t("nodeJoin")}</label>
              <select
                className={styles.select}
                id={`quest-join-${selected.key}`}
                value={selected.join}
                onChange={(e) =>
                  patchNode(selected.key, {
                    join: e.target.value as "any" | "all",
                  })
                }
                disabled={disabled}
              >
                <option value="any">{t("joinAny")}</option>
                <option value="all">{t("joinAll")}</option>
              </select>
              {incomingCount(selected.key) < 2 && (
                <span className={styles.helper}>{t("joinHint")}</span>
              )}
            </div>
          )}
          {selected.kind === "objective" && (
            <NodeFields
              node={selected}
              fields={fields}
              operators={operators}
              disabled={disabled}
              onPatch={(patch) => patchNode(selected.key, patch)}
            />
          )}
          {selected.kind !== "start" && selected.kind !== "finish" && (
            <div className={styles.fieldRow}>
              <button
                type="button"
                className={styles.remove}
                disabled={disabled}
                onClick={() => removeNode(selected.key)}
              >
                {t("removeNode")}
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
