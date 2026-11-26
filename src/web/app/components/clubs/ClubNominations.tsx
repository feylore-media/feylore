import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type {
  SelectionAudit,
  SelectionExperience,
} from "@shared/club-selection-experience";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import { BookCover } from "../../../components/books/BookCover";
import {
  CandidateCollection,
  CandidateDialog,
  NominationDialog,
} from "./SelectionCandidates";
import { SelectionBallot } from "./SelectionBallot";
import {
  SelectionConfigurationDialog,
  SelectionModerator,
} from "./SelectionModerator";
import styles from "./clubs.module.css";

type AuditView = Omit<SelectionAudit, "eligibleIds"> & {
  eligibleCount: number;
  candidateTitles: Record<string, string>;
};
type History = {
  id: string;
  title: string;
  phase: string;
  createdAt: string;
  method: string;
  winnerTitle: string | null;
  votedCount: number;
  clubReadId: string | null;
};
function selectionDisplayPhase(round: SelectionExperience, now = Date.now()) {
  if (round.result?.runoffRoundId) return "runoff";
  if (round.phase === "completed")
    return round.result?.clubReadId ? "up_next" : "completed";
  if (
    round.phase === "nominations_open" &&
    round.nominationEndsAt &&
    new Date(round.nominationEndsAt).getTime() <= now
  )
    return "nominations_closed";
  if (
    round.phase === "nominations_open" &&
    round.nominationStartsAt &&
    new Date(round.nominationStartsAt).getTime() > now
  )
    return "nominations_waiting";
  if (
    round.phase === "voting_open" &&
    round.votingEndsAt &&
    new Date(round.votingEndsAt).getTime() <= now
  )
    return "voting_closed";
  if (
    round.phase === "voting_open" &&
    round.votingStartsAt &&
    new Date(round.votingStartsAt).getTime() > now
  )
    return "voting_waiting";
  return round.phase;
}
function SelectionTime({ value }: { value: string | null }) {
  return value ? (
    <time dateTime={value}>
      {new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })}
    </time>
  ) : null;
}
function ResultDetails({
  clubId,
  round,
  onOpenCandidate,
}: {
  clubId: string;
  round: SelectionExperience;
  onOpenCandidate: (id: string) => void;
}) {
  const { t } = useTranslation("clubs");
  const [audit, setAudit] = useState<AuditView | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState(false),
    [pool, setPool] = useState<{
      candidates: SelectionExperience["candidates"];
      nextCursor: string | null;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const show = async () => {
    setOpen(!open);
    if (audit || open) return;
    try {
      const r = await api<{ data: AuditView | null }>(
        `/clubs/${clubId}/selection-rounds/${round.id}/audit`,
      );
      setAudit(r.data);
    } catch {
      setError(true);
    }
  };
  const showPool = async () => {
    setBusy(true);
    try {
      const r = await api<{ data: NonNullable<typeof pool> }>(
        `/clubs/${clubId}/selection-rounds/${round.id}/pool${pool?.nextCursor ? "?cursor=" + pool.nextCursor : ""}`,
      );
      setPool((previous) =>
        previous
          ? {
              ...r.data,
              candidates: [...previous.candidates, ...r.data.candidates],
            }
          : r.data,
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  if (!round.resultVisible) return <p>{t("selectionResultsHidden")}</p>;
  return (
    <section>
      <Button onClick={() => void show()}>
        {t(open ? "selectionHideResult" : "selectionViewResult")}
      </Button>
      {open && audit && (
        <>
          <h3>{t(`selectionMethod_${audit.method}`)}</h3>
          <p>
            {t("selectionDecidedAt")} <SelectionTime value={audit.decidedAt} />
          </p>
          {audit.tieResolution && (
            <p>{t(`selectionTieResolved_${audit.tieResolution}`)}</p>
          )}
          {audit.rounds.map((count, index) => (
            <section key={index}>
              <h4>{t("selectionCountRound", { count: index + 1 })}</h4>
              <table className={styles.selectionCounts}>
                <thead>
                  <tr>
                    <th scope="col">{t("selectionCandidate")}</th>
                    <th scope="col">{t("selectionVotes")}</th>
                    {index > 0 && (
                      <th scope="col">{t("selectionCountChange")}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(count.counts).map(([id, votes]) => (
                    <tr key={id}>
                      <th scope="row">
                        {audit.candidateTitles[id] ??
                          t("selectionUnavailableCandidate")}
                      </th>
                      <td>{votes}</td>
                      {index > 0 && (
                        <td>
                          {votes - (audit.rounds[index - 1]?.counts[id] ?? 0)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {count.exhausted > 0 && (
                <p>{t("selectionExhausted", { count: count.exhausted })}</p>
              )}
              {count.eliminated && (
                <p>
                  {t("selectionEliminated", {
                    title: audit.candidateTitles[count.eliminated],
                  })}
                </p>
              )}
            </section>
          ))}
          {audit.tieBreaks.map((tie, index) => (
            <p key={index}>
              {t("selectionEliminationTie", {
                title: audit.candidateTitles[tie.eliminated],
              })}
            </p>
          ))}
          {audit.method === "random_draw" && (
            <p>
              {t("selectionHistoricalPoolSize", { count: audit.eligibleCount })}
            </p>
          )}
          <Button disabled={busy} onClick={() => void showPool()}>
            {t(pool ? "selectionMorePool" : "selectionViewHistoricalPool")}
          </Button>
          {pool && (
            <>
              <CandidateCollection
                candidates={pool.candidates}
                onOpen={onOpenCandidate}
              />
              {!pool.nextCursor && <p>{t("selectionPoolComplete")}</p>}
            </>
          )}
        </>
      )}
      {open && !audit && !error && <p>{t("selectionAwaitingFinalization")}</p>}
      {error && <p role="alert">{t("readLoadError")}</p>}
    </section>
  );
}

export function ClubNominations({
  clubId,
  roundId,
  canModerate,
}: {
  clubId: string;
  roundId?: string;
  canModerate: boolean;
}) {
  const { t } = useTranslation("clubs"),
    navigate = useNavigate();
  const [round, setRound] = useState<SelectionExperience | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [nominating, setNominating] = useState(false),
    [creating, setCreating] = useState(false),
    [candidate, setCandidate] = useState<string | null>(null),
    [history, setHistory] = useState<History[] | null>(null),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const path = `/clubs/${clubId}/selection-rounds/experience${roundId ? "?roundId=" + roundId : ""}`;
  const load = useCallback(async () => {
    try {
      const r = await api<{ data: SelectionExperience | null }>(path);
      setRound(r.data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const more = async () => {
    if (!round?.nextCursor) return;
    setBusy(true);
    try {
      const r = await api<{ data: SelectionExperience }>(
        path + (roundId ? "&" : "?") + "cursor=" + round.nextCursor,
      );
      setRound((previous) =>
        previous
          ? {
              ...r.data,
              candidates: [...previous.candidates, ...r.data.candidates],
            }
          : r.data,
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <p role="status">{t("readLoading")}</p>;
  if (error && !round)
    return (
      <p role="alert">
        {t("readLoadError")}{" "}
        <Button onClick={() => void load()}>{t("readRetry")}</Button>
      </p>
    );
  const phase = round ? selectionDisplayPhase(round, now) : null;
  const period = (start: string | null, end: string | null) =>
    (!start || new Date(start).getTime() <= now) &&
    (!end || new Date(end).getTime() > now);
  const current = round
    ? {
        ...round,
        canVote:
          round.canVote && period(round.votingStartsAt, round.votingEndsAt),
        canNominate:
          round.canNominate &&
          period(round.nominationStartsAt, round.nominationEndsAt),
      }
    : null;
  const activeStep =
    phase === "up_next"
      ? 3
      : ["completed", "runoff", "voting_closed"].includes(phase ?? "")
        ? 2
        : ["voting_open", "voting_waiting"].includes(phase ?? "")
          ? 1
          : 0;
  return (
    <div className={styles.clubOverview}>
      <header>
        <h2>{t("tabNominations")}</h2>
        <p>{t("selectionNextRead")}</p>
      </header>
      {!current && <p>{t("selectionNoRound")}</p>}
      {current && (
        <>
          <h3>{current.title}</h3>
          <p className={styles.selectionPhase}>
            {t(`selectionStatus_${phase}`)}
          </p>
          <ol className={styles.selectionTimeline}>
            {["nominations", "voting", "result", "up_next"].map(
              (step, index) => (
                <li
                  key={step}
                  aria-current={index === activeStep ? "step" : undefined}
                >
                  <span>
                    {index === activeStep ? "● " : "○ "}
                    {t(
                      current.method === "random_draw" && step === "voting"
                        ? "selectionTimeline_no_voting"
                        : `selectionTimeline_${step}`,
                    )}
                  </span>
                  <SelectionTime
                    value={
                      index === 0
                        ? current.nominationEndsAt
                        : index === 1
                          ? current.votingEndsAt
                          : index === 3
                            ? current.nextReadStartsAt
                            : (current.result?.decidedAt ?? null)
                    }
                  />
                </li>
              ),
            )}
          </ol>
          <p>
            {t("readSelectionMethod")}: {t(`selectionMethod_${current.method}`)}
          </p>
          {["nominations_open", "nominations_waiting"].includes(phase ?? "") &&
            current.nominationEndsAt && (
              <p>
                {t("selectionNominationsEnd")}{" "}
                <SelectionTime value={current.nominationEndsAt} />
              </p>
            )}
          {["voting_open", "voting_waiting"].includes(phase ?? "") &&
            current.votingEndsAt && (
              <p>
                {t("selectionVotingEnd")}{" "}
                <SelectionTime value={current.votingEndsAt} />
              </p>
            )}
          <p>
            {t("selectionCandidateCount", { count: current.candidateCount })} |{" "}
            {t("selectionNominationParticipation", {
              count: current.nominatorCount,
              total: current.memberCount,
            })}
          </p>
          {current.isMember &&
            ["draft", "nominations_open", "nominations_closed"].includes(
              current.phase,
            ) && (
              <p>
                {t(
                  current.remainingNominations > 0
                    ? "selectionRemaining"
                    : "selectionAllowanceUsed",
                  {
                    count: current.remainingNominations,
                    limit: current.nominationLimit,
                  },
                )}
              </p>
            )}
          {current.canNominate && (
            <Button
              style={{ alignSelf: "flex-start" }}
              onClick={() => setNominating(true)}
            >
              {t("selectionNominate")}
            </Button>
          )}
          {current.method === "random_draw" && (
            <section>
              <h3>{t("selectionRandomPool")}</h3>
              <p>
                {t(
                  current.source
                    ? "selectionRandomShelfExplanation"
                    : "selectionRandomNominationExplanation",
                )}
              </p>
              {current.source && (
                <>
                  <p>{current.source.name}</p>
                  {current.source.ruleSummary && (
                    <p>{current.source.ruleSummary}</p>
                  )}
                </>
              )}
              {current.configuration.excludePreviouslyRead && (
                <p>{t("selectionExcludePrevious")}</p>
              )}
              <p>
                {t("selectionEligibleCount", {
                  count: current.result?.eligibleCount ?? current.eligibleCount,
                })}
              </p>
            </section>
          )}
          {current.parentRoundId && (
            <p>
              {t("selectionRunoffFresh")}{" "}
              <Link
                to={`/clubs/${clubId}/selection-rounds/${current.parentRoundId}`}
              >
                {t("selectionOriginalRound")}
              </Link>
            </p>
          )}
          {current.result?.runoffRoundId && (
            <p>
              {t("selectionRunoffRequired")}{" "}
              <Link
                to={`/clubs/${clubId}/selection-rounds/${current.result.runoffRoundId}`}
              >
                {t("selectionOpenRunoff")}
              </Link>
            </p>
          )}
          {current.result?.winner && (
            <section>
              <h3>
                {t(
                  current.result.clubReadId
                    ? "selectionUpNext"
                    : "selectionSelected",
                )}
              </h3>
              <div className={styles.selectionCandidate}>
                <BookCover
                  coverFileId={
                    current.result.winner.snapshot.coverFileId ?? null
                  }
                  title={current.result.winner.snapshot.title}
                  size="small"
                />
                <div>
                  <h4>{current.result.winner.snapshot.title}</h4>
                  <p>{current.result.winner.snapshot.authors.join(", ")}</p>
                  <p>
                    {t("selectionSelectedBy", {
                      method: t(`selectionMethod_${current.method}`),
                    })}
                  </p>
                  <SelectionTime value={current.nextReadStartsAt} />
                  {current.result.clubReadId && (
                    <p>
                      <Link
                        to={`/clubs/${clubId}/reads/${current.result.clubReadId}`}
                      >
                        {t("selectionViewUpcomingRead")}
                      </Link>
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
          {current.phase === "voting_open" &&
            current.method !== "random_draw" && (
              <>
                <p>
                  {t("selectionVotingParticipation", {
                    count: current.votedCount,
                    total: current.memberCount,
                  })}
                </p>
                {current.isMember && (
                  <SelectionBallot
                    key={current.id}
                    clubId={clubId}
                    round={current}
                    onSaved={() => void load()}
                  />
                )}
              </>
            )}
          <section>
            <h3>{t("selectionCandidates")}</h3>
            {current.candidates.length ? (
              <CandidateCollection
                candidates={current.candidates}
                onOpen={setCandidate}
              />
            ) : (
              <p>{t("selectionNoCandidates")}</p>
            )}
            {current.nextCursor && (
              <Button disabled={busy} onClick={() => void more()}>
                {t("selectionMoreCandidates")}
              </Button>
            )}
          </section>
          {["completed", "voting_open"].includes(current.phase) && (
            <ResultDetails
              key={current.id + String(current.result?.decidedAt)}
              clubId={clubId}
              round={current}
              onOpenCandidate={setCandidate}
            />
          )}
          <SelectionModerator
            key={current.id}
            clubId={clubId}
            round={current}
            onSaved={() => void load()}
          />
          {candidate && (
            <CandidateDialog
              clubId={clubId}
              roundId={current.id}
              candidateId={candidate}
              onClose={() => setCandidate(null)}
            />
          )}
          {nominating && (
            <NominationDialog
              clubId={clubId}
              round={current}
              onClose={() => setNominating(false)}
              onSaved={() => {
                setNominating(false);
                void load();
              }}
            />
          )}
        </>
      )}
      {canModerate &&
        (!current || ["completed", "cancelled"].includes(current.phase)) && (
          <Button
            style={{ alignSelf: "flex-start" }}
            onClick={() => setCreating(true)}
          >
            {t("selectionCreate")}
          </Button>
        )}
      {creating && (
        <SelectionConfigurationDialog
          clubId={clubId}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            if (id) void navigate(`/clubs/${clubId}/selection-rounds/${id}`);
            else void load();
          }}
        />
      )}
      <section>
        <Button
          onClick={() => {
            void api<{ data: History[] }>(`/clubs/${clubId}/selection-rounds`)
              .then((r) => setHistory(r.data))
              .catch(() => setError(true));
          }}
        >
          {t("selectionPast")}
        </Button>
        {history && (
          <ul>
            {history.map((item) => (
              <li key={item.id}>
                <Link to={`/clubs/${clubId}/selection-rounds/${item.id}`}>
                  {item.title}
                </Link>{" "}
                | {t(`selectionMethod_${item.method}`)} |{" "}
                <SelectionTime value={item.createdAt} />
                {item.winnerTitle && ` | ${item.winnerTitle}`} |{" "}
                {t("selectionVotesCount", { count: item.votedCount })}
                {item.clubReadId && (
                  <>
                    {" "}
                    |{" "}
                    <Link to={`/clubs/${clubId}/reads/${item.clubReadId}`}>
                      {t("selectionViewUpcomingRead")}
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {error && <p role="alert">{t("readLoadError")}</p>}
    </div>
  );
}
