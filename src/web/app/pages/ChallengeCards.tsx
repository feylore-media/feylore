import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type {
  ChallengeRecord,
  ChallengeSocialSummary,
} from "@shared/challenges";
import { challengeSummary, displayDate } from "./challenge-helpers";
import styles from "./goals.module.css";

/**
 * Recognizable per-format mini visual driven by the social summary
 * (counts and states only — never counted items):
 * Simple "7 / 12", a miniature board, a tiny node chain.
 */
export function ChallengeMiniVisual({
  challenge,
  summary,
}: {
  challenge: ChallengeRecord;
  summary: ChallengeSocialSummary | null | undefined;
}) {
  const { t } = useTranslation("challenges");
  if (!summary) {
    return (
      <p className={styles.cardMeta}>{challengeSummary(challenge, t)}</p>
    );
  }
  if (summary.format === "simple") {
    return (
      <div>
        <div className={styles.bigProgress}>
          {summary.current}{" "}
          <span className={styles.detailMeta}>of {summary.target}</span>
        </div>
        <div
          className={styles.progressTrack}
          aria-label={`${summary.percentage}%`}
        >
          <div
            className={styles.progressFill}
            style={{
              width: `${Math.max(0, Math.min(100, summary.percentage))}%`,
            }}
          />
        </div>
      </div>
    );
  }
  if (summary.format === "bingo") {
    const size = challenge.bingoBoard?.size ?? 3;
    const done = new Set(summary.completedPositions);
    return (
      <div>
        <div
          className={styles.miniBoard}
          style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
          aria-label={t("squaresCompleted", {
            completed: summary.squaresCompleted,
            total: summary.squaresTotal,
          })}
        >
          {Array.from({ length: size * size }, (_, position) => (
            <span
              key={position}
              className={styles.miniCell}
              data-completed={done.has(position) ? "true" : "false"}
            />
          ))}
        </div>
        <p className={styles.cardMeta}>
          {t("squaresCompleted", {
            completed: summary.squaresCompleted,
            total: summary.squaresTotal,
          })}{" "}
          · {t("linesCompleted", { count: summary.linesCompleted })}
          {summary.won ? ` · ✓ ${t("bingoWon")}` : ""}
        </p>
      </div>
    );
  }
  const nodes = challenge.questGraph?.nodes ?? [];
  const states = new Map(
    summary.nodeStates.map((entry) => [entry.key, entry.state]),
  );
  return (
    <div>
      <div className={styles.miniDots} aria-label={t("questMap")}>
        {(nodes.length > 0
          ? nodes.map((node) => ({
              key: node.key,
              kind: node.kind,
              label: node.label,
              state: states.get(node.key) ?? "locked",
            }))
          : summary.nodeStates.map((entry) => ({
              key: entry.key,
              kind: entry.kind,
              label: entry.key,
              state: entry.state,
            })
          )
        ).map((node) => (
          <span
            key={node.key}
            className={styles.miniDot}
            data-kind={node.kind}
            data-state={node.state}
            title={`${node.label} — ${node.state}`}
          />
        ))}
      </div>
      <p className={styles.cardMeta}>
        {t("nodesCompleted", {
          completed: summary.requiredCompleted,
          total: summary.requiredTotal,
        })}
        {summary.won ? ` · ✓ ${t("questWon")}` : ""}
      </p>
    </div>
  );
}

/** Social challenge card: title, mini visual, dates, participation state. */
export function ChallengeCard({ challenge }: { challenge: ChallengeRecord }) {
  const participation = challenge.viewerParticipation;
  const summary = participation?.summary ?? null;
  return (
    <Link
      className={styles.card}
      to={`/challenges/${challenge.id}`}
      key={challenge.id}
    >
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{challenge.title}</h3>
        <span className={styles.percent}>{challenge.effectiveState}</span>
      </div>
      <ChallengeMiniVisual challenge={challenge} summary={summary} />
      <div className={styles.progressMeta}>
        <span>
          {displayDate(challenge.startsAt)} – {displayDate(challenge.endsAt)}
        </span>
        <span>
          {challenge.participantCount ?? 0} · {challenge.joinPolicy}
          {participation?.state === "completed" &&
          participation.completedAt
            ? ` · ✓ ${displayDate(participation.completedAt)}`
            : ""}
        </span>
      </div>
    </Link>
  );
}
