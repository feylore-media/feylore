import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BingoBoardView, BingoSquareView } from "@shared/challenges";
import { api } from "../api";
import { LoadingState } from "../../components/states";
import { bingoBoardVars } from "./bingo-utils";
import styles from "./bingo.module.css";

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

function victoryText(
  board: BingoBoardView,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (board.victory === "blackout") return t("victoryBlackout");
  if (board.victory === "n_lines") {
    return t("victoryNLines") + ` (${board.victoryLines ?? 1})`;
  }
  return t("victoryLine");
}

/**
 * Polished participant board: completed / progressing / free / locked
 * squares with completed-line treatment. Selecting a square shows its
 * rule, progress, and which item(s) counted — all automatic from library
 * activity, never manually checked off.
 */
export function BingoBoardGrid({
  board,
  challengeId,
}: {
  board: BingoBoardView;
  challengeId: string;
}) {
  const { t } = useTranslation("challenges");
  const inLine = new Set(board.completedLines.flat());
  const defaultSelection =
    board.squares.find((square) => square.state === "progressing")?.position ??
    board.squares[0]?.position ??
    0;
  const [selected, setSelected] = useState<number>(defaultSelection);
  const square = board.squares.find((entry) => entry.position === selected);

  return (
    <section aria-label={t("title")}>
      <div className={styles.board} data-bingo-style={board.styleKey}>
        <div className={styles.boardSummary}>
          <strong>
            {t("squaresCompleted", {
              completed: board.squaresCompleted,
              total: board.squaresTotal,
            })}
          </strong>
          <span className={styles.boardMeta}>
            {board.size}×{board.size} · {victoryText(board, t)} ·{" "}
            {t("linesCompleted", { count: board.linesCompleted })}
          </span>
          {board.won && (
            <span className={styles.wonBanner}>✓ {t("bingoWon")}</span>
          )}
        </div>
        <div
          className={styles.grid}
          style={{
            ...bingoBoardVars(board),
            gridTemplateColumns: `repeat(${board.size}, 1fr)`,
          }}
          role="grid"
          aria-label={t("title")}
        >
          {board.squares.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="gridcell"
              className={styles.cell}
              data-state={entry.state}
              data-line={inLine.has(entry.position) ? "true" : "false"}
              aria-pressed={entry.position === selected}
              aria-label={`${entry.label} — ${entry.state}`}
              onClick={() => setSelected(entry.position)}
            >
              <span className={styles.cellLabel}>{entry.label}</span>
              <span className={styles.cellMeta}>
                {entry.state === "free" ? (
                  <span className={styles.freeBadge}>{t("freeSpace")}</span>
                ) : entry.state === "completed" ? (
                  "✓"
                ) : entry.progress ? (
                  `${entry.progress.current}/${entry.progress.target}`
                ) : (
                  ""
                )}
              </span>
            </button>
          ))}
        </div>
        {square && (
          <BingoSquareDetail square={square} challengeId={challengeId} />
        )}
      </div>
    </section>
  );
}

function BingoSquareDetail({
  square,
  challengeId,
}: {
  square: BingoSquareView;
  challengeId: string;
}) {
  const { t } = useTranslation("challenges");
  const [candidates, setCandidates] = useState<EvaluatedCandidate[] | null>(
    null,
  );

  useEffect(() => {
    setCandidates(null);
    if (square.freeSpace || !square.objectiveId) return;
    let live = true;
    void api<{ data: EvaluatedCandidate[] }>(
      `/challenges/${challengeId}/candidates?objectiveId=${encodeURIComponent(square.objectiveId)}`,
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
  }, [challengeId, square.objectiveId, square.freeSpace, square.position]);

  const counted = (candidates ?? []).filter(
    (candidate) => candidate.evaluation.eligible,
  );
  const missed = (candidates ?? []).filter(
    (candidate) => !candidate.evaluation.eligible,
  );

  return (
    <div className={styles.detail} aria-live="polite">
      <h3 className={styles.detailTitle}>{square.label}</h3>
      <p className={styles.detailRule}>
        {square.freeSpace
          ? t("freeSpace")
          : square.objective
            ? `${square.objective.target} ${square.objective.metric} — ${
                square.objective.domains.length > 0
                  ? square.objective.domains.join(" · ")
                  : t("anyMedia")
              }`
            : ""}
        {square.state === "completed" && !square.freeSpace
          ? ` · ✓ ${t("completed")}`
          : ""}
      </p>
      {square.progress && !square.freeSpace && (
        <>
          <p className={styles.detailRule}>
            {t("squareProgress")}: {square.progress.current} /{" "}
            {square.progress.target} ({square.progress.percentage}%)
          </p>
          <div
            className={styles.progressTrack}
            aria-label={`${square.progress.percentage}%`}
          >
            <div
              className={styles.progressFill}
              style={{
                width: `${Math.max(0, Math.min(100, square.progress.percentage))}%`,
              }}
            />
          </div>
        </>
      )}
      {!square.freeSpace && candidates === null && <LoadingState />}
      {!square.freeSpace && candidates !== null && (
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
