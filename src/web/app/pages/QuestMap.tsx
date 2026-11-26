import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { QuestGraphView, QuestNodeView } from "@shared/challenges";
import { api } from "../api";
import { LoadingState } from "../../components/states";
import {
  QUEST_CANVAS_HEIGHT,
  QUEST_CANVAS_WIDTH,
  questMapVars,
} from "./quest-utils";
import styles from "./quest.module.css";

type EvaluatedCandidate = {
  workType: string;
  workId: string;
  title: string;
  occurredAt: string;
  evaluation: {
    eligible: boolean;
    failures: Array<{ predicate: string; reason: string }>;
  };
};

function displayDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function nodeMeta(node: QuestNodeView, t: (key: string) => string): string {
  if (node.kind === "start") return t("questStart");
  if (node.kind === "finish") return t("questFinish");
  if (node.kind === "junction") return t("questJunction");
  if (node.state === "completed") return "✓";
  if (node.progress) return `${node.progress.current}/${node.progress.target}`;
  return "";
}

/**
 * Polished participant map: locked → available/progressing → completed
 * nodes wired by prerequisite paths. Selecting a node shows its rule,
 * progress, prerequisites, what it unlocks, and which item(s) counted —
 * all automatic from library activity, never manually checked off.
 * Reaching Finish completes the quest through the existing participant
 * completion pipeline.
 */
export function QuestMap({
  graph,
  challengeId,
}: {
  graph: QuestGraphView;
  challengeId: string;
}) {
  const { t } = useTranslation("challenges");
  const byKey = useMemo(
    () => new Map(graph.nodes.map((node) => [node.key, node])),
    [graph],
  );
  const defaultSelection =
    graph.nodes.find((node) => node.state === "progressing")?.key ??
    graph.nodes.find((node) => node.state === "available")?.key ??
    graph.nodes[0]?.key ??
    "";
  const [selected, setSelected] = useState<string>(defaultSelection);
  const node = byKey.get(selected) ?? graph.nodes[0];
  const completedByKey = useMemo(
    () => new Map(graph.nodes.map((entry) => [entry.key, entry])),
    [graph],
  );
  const unlockedEdges = useMemo(() => {
    const done = new Set(
      graph.nodes
        .filter((entry) => entry.state === "completed")
        .map((entry) => entry.key),
    );
    // A path reads as unlocked once its prerequisite end is completed.
    // (Start is always completed, so the first paths light up immediately.)
    return new Set(
      graph.edges
        .filter((edge) => done.has(edge.fromKey))
        .map((edge) => edge.id),
    );
  }, [graph]);

  return (
    <section aria-label={t("questMap")}>
      <div className={styles.map} data-quest-style={graph.styleKey}>
        <div className={styles.mapSummary}>
          <strong>
            {t("nodesCompleted", {
              completed: graph.requiredCompleted,
              total: graph.requiredTotal,
            })}
          </strong>
          {graph.optionalTotal > 0 && (
            <span className={styles.mapMeta}>
              {t("optionalCompleted", {
                completed: graph.optionalCompleted,
                total: graph.optionalTotal,
              })}
            </span>
          )}
          {graph.won && (
            <span className={styles.wonBanner}>✓ {t("questWon")}</span>
          )}
        </div>
        <div
          className={styles.canvas}
          style={questMapVars(graph)}
          role="group"
          aria-label={t("questMap")}
        >
          <svg
            className={styles.paths}
            viewBox={`0 0 ${QUEST_CANVAS_WIDTH} ${QUEST_CANVAS_HEIGHT}`}
            aria-hidden="true"
          >
            {graph.edges.map((edge) => {
              const from = completedByKey.get(edge.fromKey);
              const to = completedByKey.get(edge.toKey);
              if (!from || !to) return null;
              return (
                <line
                  key={edge.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={styles.path}
                  data-unlocked={unlockedEdges.has(edge.id) ? "true" : "false"}
                />
              );
            })}
          </svg>
          {graph.nodes.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.node}
              style={{
                left: `${(entry.x / QUEST_CANVAS_WIDTH) * 100}%`,
                top: `${(entry.y / QUEST_CANVAS_HEIGHT) * 100}%`,
              }}
              data-kind={entry.kind}
              data-state={entry.state}
              data-optional={entry.optional ? "true" : "false"}
              aria-pressed={entry.key === node?.key}
              aria-label={`${entry.label} — ${entry.state}${entry.optional ? ` — ${t("nodeOptional")}` : ""}`}
              onClick={() => setSelected(entry.key)}
            >
              <span className={styles.nodeLabel}>{entry.label}</span>
              <span className={styles.nodeMeta}>{nodeMeta(entry, t)}</span>
            </button>
          ))}
        </div>
        {node && (
          <QuestNodeDetail
            node={node}
            graph={graph}
            challengeId={challengeId}
          />
        )}
      </div>
    </section>
  );
}

function QuestNodeDetail({
  node,
  graph,
  challengeId,
}: {
  node: QuestNodeView;
  graph: QuestGraphView;
  challengeId: string;
}) {
  const { t } = useTranslation("challenges");
  const [candidates, setCandidates] = useState<EvaluatedCandidate[] | null>(
    null,
  );
  const byKey = useMemo(
    () => new Map(graph.nodes.map((entry) => [entry.key, entry])),
    [graph],
  );
  const prerequisites = useMemo(
    () =>
      graph.edges
        .filter((edge) => edge.toKey === node.key)
        .map((edge) => byKey.get(edge.fromKey))
        .filter((entry): entry is QuestNodeView => Boolean(entry)),
    [graph, node, byKey],
  );
  const unlocks = useMemo(
    () =>
      graph.edges
        .filter((edge) => edge.fromKey === node.key)
        .map((edge) => byKey.get(edge.toKey))
        .filter((entry): entry is QuestNodeView => Boolean(entry)),
    [graph, node, byKey],
  );

  useEffect(() => {
    setCandidates(null);
    if (node.kind !== "objective" || !node.objectiveId) return;
    let live = true;
    void api<{ data: EvaluatedCandidate[] }>(
      `/challenges/${challengeId}/candidates?objectiveId=${encodeURIComponent(node.objectiveId)}`,
    )
      .then((response) => {
        if (live) setCandidates(response.data);
      })
      .catch(() => {
        if (live) setCandidates([]);
      });
    return () => {
      live = false;
    };
  }, [challengeId, node.objectiveId, node.kind, node.key]);

  const counted = (candidates ?? []).filter(
    (candidate) => candidate.evaluation.eligible,
  );
  const missed = (candidates ?? []).filter(
    (candidate) => !candidate.evaluation.eligible,
  );

  return (
    <div className={styles.detail} aria-live="polite">
      <h3 className={styles.detailTitle}>
        {node.label}
        {node.optional && (
          <span className={styles.optionalBadge}> · {t("nodeOptional")}</span>
        )}
      </h3>
      <p className={styles.detailRule}>
        {node.kind === "objective" && node.objective
          ? `${node.objective.target} ${node.objective.metric} — ${
              node.objective.domains.length > 0
                ? node.objective.domains.join(" · ")
                : t("anyMedia")
            }`
          : node.kind === "junction"
            ? t("questJunctionHint")
            : node.kind === "start"
              ? t("questStartHint")
              : t("questFinishHint")}
        {node.state === "completed" && node.kind === "objective"
          ? ` · ✓ ${t("completed")}`
          : ""}
      </p>
      {prerequisites.length > 0 && (
        <p className={styles.detailRule}>
          {t("prerequisites")}:{" "}
          {prerequisites.map((entry) => entry.label).join(", ")} (
          {node.join === "all" ? t("joinAll") : t("joinAny")})
        </p>
      )}
      {unlocks.length > 0 && (
        <p className={styles.detailRule}>
          {t("unlocks")}: {unlocks.map((entry) => entry.label).join(", ")}
        </p>
      )}
      {node.kind === "objective" && node.progress && (
        <>
          <p className={styles.detailRule}>
            {t("squareProgress")}: {node.progress.current} /{" "}
            {node.progress.target} ({node.progress.percentage}%)
          </p>
          <div
            className={styles.progressTrack}
            aria-label={`${node.progress.percentage}%`}
          >
            <div
              className={styles.progressFill}
              style={{
                width: `${Math.max(0, Math.min(100, node.progress.percentage))}%`,
              }}
            />
          </div>
        </>
      )}
      {node.kind === "objective" && candidates === null && <LoadingState />}
      {node.kind === "objective" && candidates !== null && (
        <>
          <h4 className={styles.detailTitle}>{t("countedItems")}</h4>
          {counted.length > 0 ? (
            <ul className={styles.countedList}>
              {counted.slice(0, 8).map((candidate) => (
                <li
                  className={styles.countedItem}
                  key={`${candidate.workType}:${candidate.workId}`}
                >
                  <strong>{candidate.title}</strong>{" "}
                  <span className={styles.countedMeta}>
                    · {displayDate(candidate.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.detailRule}>{t("noCountedItems")}</p>
          )}
          {missed.length > 0 && (
            <>
              <h4 className={styles.detailTitle}>{t("whyNotSquare")}</h4>
              <ul className={styles.countedList}>
                {missed.slice(0, 5).map((candidate) => (
                  <li
                    className={styles.countedItem}
                    key={`${candidate.workType}:${candidate.workId}`}
                  >
                    <strong>{candidate.title}</strong>
                    {candidate.evaluation.failures.map((failure) => (
                      <div
                        className={styles.countedMeta}
                        key={`${candidate.workId}:${failure.predicate}`}
                      >
                        — {failure.reason}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
