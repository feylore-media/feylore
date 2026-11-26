import { ClubReadingRoom } from "./ClubReadingRoom";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type {
  ClubExperienceOverview,
  ReadExperience,
  ReadSummary,
  SafeClubItem,
} from "@shared/club-experience";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import { BookCover } from "../../../components/books/BookCover";
import {
  OverviewAboutSection,
  OverviewGenresSection,
} from "../../../components/books/detail/overview/OverviewSections";
import { RatingVisualization } from "../../../components/ratings/RatingVisualization";
import styles from "./clubs.module.css";

function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    return api<{ data: T }>(path)
      .then((result) => setData(result.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [path]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(false);
    void api<{ data: T }>(path)
      .then((result) => {
        if (live) setData(result.data);
      })
      .catch(() => {
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path]);
  return { data, error, loading, reload };
}
function DateRange({ read }: { read: ReadSummary["read"] }) {
  const { t } = useTranslation("clubs");
  const date = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
  return (
    <p>
      {read.startDate ? date(read.startDate) : t("readDatesUnknown")}
      {(read.completedAt ?? read.targetEndDate) &&
        ` – ${date((read.completedAt ?? read.targetEndDate)!)}`}
    </p>
  );
}
export function ReadIdentity({
  item,
  compact = false,
}: {
  item: ReadSummary;
  compact?: boolean;
}) {
  const { t } = useTranslation("clubs");
  return (
    <div className={styles.readIdentity}>
      <div className={styles.readCover}>
        <BookCover
          title={item.snapshot.title}
          coverFileId={item.snapshot.coverFileId ?? null}
        />
      </div>
      <div>
        <h2>{item.snapshot.title}</h2>
        <p>{item.snapshot.authors.join(", ")}</p>
        <DateRange read={item.read} />
        {item.snapshot.series && (
          <p>
            {item.snapshot.series}
            {item.snapshot.seriesPosition !== undefined
              ? ` #${item.snapshot.seriesPosition}`
              : ""}
          </p>
        )}
        {item.snapshot.pageCount && (
          <p>{t("readPages", { count: item.snapshot.pageCount })}</p>
        )}
        <p>{t(`readStatus_${item.read.status}`)}</p>
        {item.readerHref && (
          <Link to={item.readerHref}>{t("readContinue")}</Link>
        )}
        {!item.readerHref && item.workHref && (
          <Link to={item.workHref}>{t("readWorkDetails")}</Link>
        )}
        {compact && (
          <Link to={`/clubs/${item.read.clubId}/reads/${item.read.id}`}>
            {t("readView")}
          </Link>
        )}
      </div>
    </div>
  );
}
function SafeItems({ items }: { items: SafeClubItem[] }) {
  const { t } = useTranslation("clubs");
  return (
    <ul className={styles.readItems}>
      {items.map((item) => (
        <li key={`${item.kind}:${item.id}`}>
          <p>
            {item.label} · {item.author}
          </p>
          {item.locked ? <p>{t("readSpoilerLocked")}</p> : <p>{item.text}</p>}
          {item.href && <Link to={item.href}>{t("viewDiscussion")}</Link>}
        </li>
      ))}
    </ul>
  );
}
function ReadProgress({ item }: { item: ReadExperience }) {
  const { t } = useTranslation("clubs");
  return (
    <section>
      <h3>{t("readYourProgress")}</h3>
      {item.progressPercent !== null ? (
        <>
          <progress
            max={100}
            value={item.progressPercent}
            aria-label={t("readYourProgress")}
          />
          <span> {item.progressPercent}%</span>
        </>
      ) : (
        <p>{t("readNoProgress")}</p>
      )}
      {item.progressLabel && <p>{item.progressLabel}</p>}
      {item.caughtUp !== null && (
        <p>
          {t(
            item.caughtUp ? "readProgressCaughtUp" : "readProgressNotAtTarget",
          )}
        </p>
      )}
      <p>
        {t("readDeclaredCaughtUp", {
          count: item.caughtUpCount,
          total: item.memberCount,
        })}
      </p>
      <div className={styles.readMemberStrip}>
        {item.members.map((member) => (
          <span key={member.userId} title={member.displayName}>
            {member.displayName.slice(0, 1)}
            {member.checkedIn ? " ✓" : ""}
          </span>
        ))}
      </div>
      <Link to={`/clubs/${item.read.clubId}/members`}>{t("tabMembers")}</Link>
    </section>
  );
}
function CheckIn({
  item,
  onChange,
  isMember,
}: {
  item: ReadExperience;
  onChange: () => void;
  isMember: boolean;
}) {
  const { t } = useTranslation("clubs");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const target = item.checkIn;
  if (!target) return null;
  const declare = async () => {
    setBusy(true);
    setError(false);
    try {
      await api(`/clubs/${item.read.clubId}/reads/${item.read.id}/check-in`, {
        method: "POST",
        body: JSON.stringify({ checkedIn: !item.viewerCheckedIn }),
      });
      onChange();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h3>{t("readNextCheckIn")}</h3>
      <p>
        {target.label} · {new Date(target.scheduledAt).toLocaleDateString()}
      </p>
      <p>
        {t(
          item.viewerCheckedIn
            ? "readCheckInDeclared"
            : "readCheckInNotDeclared",
        )}
      </p>
      {isMember && target.available && (
        <Button disabled={busy} onClick={() => void declare()}>
          {t(item.viewerCheckedIn ? "readUndoCheckIn" : "readDeclareCheckIn")}
        </Button>
      )}
      {error && <p role="alert">{t("readLoadError")}</p>}
      {target.topicHref && (
        <Link to={target.topicHref}>{t("viewDiscussion")}</Link>
      )}
    </section>
  );
}
function SummaryCounts({ item }: { item: ReadSummary }) {
  const { t } = useTranslation("clubs");
  return (
    <p>
      {t("readHistoryCounts", {
        participants: item.participantCount,
        discussions: item.discussionCount,
        passages: item.journalCount,
      })}
      {item.averageRating !== null &&
        ` · ${t("readAverageRating", { rating: item.averageRating.toFixed(1), count: item.ratingCount })}`}
      {item.recommendations !== null &&
        ` · ${t("readRecommendations", { count: item.recommendations })}`}
    </p>
  );
}
export function ClubReadingOverview({
  clubId,
  isMember,
}: {
  clubId: string;
  isMember: boolean;
}) {
  const { t } = useTranslation("clubs");
  const { data, error, loading, reload } = useResource<ClubExperienceOverview>(
    `/clubs/${clubId}/overview`,
  );
  if (loading) return <p role="status">{t("readLoading")}</p>;
  if (error || !data)
    return (
      <div role="alert">
        <p>{t("readLoadError")}</p>
        <Button onClick={() => void reload()}>{t("readRetry")}</Button>
      </div>
    );
  const read = data.activeRead,
    round = data.selection;
  return (
    <div className={styles.clubOverview}>
      <section>
        <h2>{t("tabCurrentRead")}</h2>
        {read ? (
          <>
            <ReadIdentity item={read} compact />
            <ReadProgress item={read} />
          </>
        ) : (
          <p>{t("readNoCurrent")}</p>
        )}
      </section>
      {read && (
        <CheckIn
          item={read}
          isMember={isMember}
          onChange={() => void reload()}
        />
      )}
      <section>
        <h2>{t("readRoom")}</h2>
        {read?.discussions.length ? (
          <SafeItems items={read.discussions} />
        ) : (
          <p>{t("readNoDiscussions")}</p>
        )}
        <Link to={`/clubs/${clubId}/discussions`}>{t("readEnterRoom")}</Link>
      </section>
      {!!read?.journal.length && (
        <section>
          <h2>{t("readJournal")}</h2>
          <SafeItems items={read.journal} />
          <Link to={`/clubs/${clubId}/reads/${read.read.id}`}>
            {t("readView")}
          </Link>
        </section>
      )}
      <section>
        <h2>{t("whatsNext")}</h2>
        {round ? (
          <>
            <h3>{round.title}</h3>
            <p>
              {t(`selectionPhase_${round.phase}`)} ·{" "}
              {t(`selectionMethod_${round.method}`)}
            </p>
            {round.phase === "nominations_open" && (
              <p>
                {t("readSelectionNominations", {
                  count: round.candidateCount,
                  members: round.nominatorCount,
                  remaining: round.remainingNominations,
                })}
              </p>
            )}
            {round.phase === "voting_open" && (
              <p>
                {t("readSelectionVoting", {
                  count: round.candidateCount,
                  voted: round.votedCount,
                })}{" "}
                ·{" "}
                {t(
                  round.hasBallot
                    ? "readBallotSubmitted"
                    : "readBallotNotSubmitted",
                )}
              </p>
            )}
            {(round.phase === "nominations_open"
              ? round.nominationEndsAt
              : round.votingEndsAt) && (
              <p>
                {t("readDeadline", {
                  date: new Date(
                    (round.phase === "nominations_open"
                      ? round.nominationEndsAt
                      : round.votingEndsAt)!,
                  ).toLocaleString(),
                })}
              </p>
            )}
            {round.winner && (
              <p>
                {round.winner.title} · {round.winner.authors.join(", ")}
                {round.nextReadStartsAt &&
                  ` · ${new Date(round.nextReadStartsAt).toLocaleDateString()}`}
              </p>
            )}
            <Link to={`/clubs/${clubId}/nominations`}>
              {t(
                round.phase === "voting_open"
                  ? round.hasBallot
                    ? "selectionReviewBallot"
                    : "selectionCastVote"
                  : round.phase === "completed"
                    ? "selectionViewResult"
                    : "selectionViewNominations",
              )}
            </Link>
          </>
        ) : (
          <p>{t("readNoSelection")}</p>
        )}
      </section>
      {!!data.recentActivity.length && (
        <section>
          <h2>{t("readRecentActivity")}</h2>
          <SafeItems items={data.recentActivity} />
        </section>
      )}
      {!!data.upcoming.length && (
        <section>
          <h2>{t("readUpcoming")}</h2>
          <ul className={styles.readItems}>
            {data.upcoming.map((event) => (
              <li key={event.id}>
                <time dateTime={event.startsAt}>
                  {new Date(event.startsAt).toLocaleDateString()}
                </time>{" "}
                · <Link to={event.href}>{event.label}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.lastRead && (
        <section>
          <h2>{t("readLast")}</h2>
          <ReadIdentity item={data.lastRead} compact />
          <SummaryCounts item={data.lastRead} />
          <Link to={`/clubs/${clubId}/library`}>{t("tabLibrary")}</Link>
        </section>
      )}
    </div>
  );
}
export function ClubReadPage({
  clubId,
  readId,
  isMember,
}: {
  clubId: string;
  readId?: string;
  isMember: boolean;
}) {
  return readId ? (
    <ReadDetail clubId={clubId} readId={readId} isMember={isMember} />
  ) : (
    <CurrentRead clubId={clubId} isMember={isMember} />
  );
}
function CurrentRead({
  clubId,
  isMember,
}: {
  clubId: string;
  isMember: boolean;
}) {
  const { t } = useTranslation("clubs");
  const current = useResource<ClubExperienceOverview>(
    `/clubs/${clubId}/overview`,
  );
  if (current.loading) return <p role="status">{t("readLoading")}</p>;
  if (current.error) return <p role="alert">{t("readLoadError")}</p>;
  if (current.data?.activeRead)
    return (
      <ReadDetail
        clubId={clubId}
        readId={current.data.activeRead.read.id}
        isMember={isMember}
      />
    );
  return (
    <section>
      <p>{t("readNoCurrent")}</p>
      {current.data?.selection && (
        <Link to={`/clubs/${clubId}/nominations`}>
          {t("readSelectionDetails")}
        </Link>
      )}
      {current.data?.upcoming.map((event) => (
        <p key={event.id}>
          {new Date(event.startsAt).toLocaleDateString()}{" "}
          <Link to={event.href}>{event.label}</Link>
        </p>
      ))}
    </section>
  );
}
function ReadDetail({
  clubId,
  readId,
  isMember,
}: {
  clubId: string;
  readId: string;
  isMember: boolean;
}) {
  const { t } = useTranslation("clubs");
  const { data, error, loading, reload } = useResource<ReadExperience>(
    `/clubs/${clubId}/reads/${readId}/experience`,
  );
  if (loading) return <p role="status">{t("readLoading")}</p>;
  if (error || !data)
    return (
      <div role="alert">
        <p>{t("readLoadError")}</p>
        <Button onClick={() => void reload()}>{t("readRetry")}</Button>
      </div>
    );
  return (
    <div className={styles.clubOverview}>
      <ReadIdentity item={data} />
      <ClubReadingRoom clubId={clubId} readId={readId} isMember={isMember} />
      <OverviewAboutSection description={data.snapshot.description ?? null} />
      <OverviewGenresSection genres={data.snapshot.genres} />
      {data.read.status === "active" && (
        <>
          <ReadProgress item={data} />
          <CheckIn
            item={data}
            isMember={isMember}
            onChange={() => void reload()}
          />
        </>
      )}
      <section>
        <h2>{t("readSchedule")}</h2>
        {data.schedule.length ? (
          <ul className={styles.readItems}>
            {data.schedule.map((o) => (
              <li key={o.id}>
                <time>{new Date(o.scheduledAt).toLocaleDateString()}</time> ·{" "}
                {o.label}
                {o.href && (
                  <>
                    {" "}
                    · <Link to={o.href}>{t("viewDiscussion")}</Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("noSchedule")}</p>
        )}
      </section>
      <section>
        <h2>{t("readParticipants")}</h2>
        <p>
          {data.participants.map((member) => member.displayName).join(", ") ||
            t("readNoParticipants")}
        </p>
      </section>
      <section>
        <h2>{t("readRatings")}</h2>
        <SummaryCounts item={data} />
        {data.ratingCount === 0 && <p>{t("readSparseRatings")}</p>}
        <p>
          {t("readYourRatingState", {
            state: data.viewerRatingStatus
              ? t(`readRating_${data.viewerRatingStatus}`)
              : t("readRating_none"),
          })}
        </p>
        {data.workHref && (
          <Link to={`${data.workHref}/review`}>{t("readReview")}</Link>
        )}
        <RatingVisualization
          review={data.rating}
          coreDimensions={data.rating.dimensions}
          genreDefinitions={[]}
          scale={data.rating.scale}
        />
      </section>
    </div>
  );
}
export function ClubLibrary({ clubId }: { clubId: string }) {
  const { t } = useTranslation("clubs");
  const { data, error, loading, reload } = useResource<{
    reads: ReadSummary[];
    nextCursor: string | null;
  }>(`/clubs/${clubId}/library`);
  const [extra, setExtra] = useState<ReadSummary[]>([]),
    [cursor, setCursor] = useState<string | null | undefined>(undefined),
    [busy, setBusy] = useState(false),
    [pageError, setPageError] = useState(false);
  useEffect(() => {
    setExtra([]);
    setCursor(undefined);
  }, [clubId]);
  if (loading) return <p role="status">{t("readLoading")}</p>;
  if (error || !data)
    return (
      <div role="alert">
        <p>{t("readLoadError")}</p>
        <Button onClick={() => void reload()}>{t("readRetry")}</Button>
      </div>
    );
  const reads = [...data.reads, ...extra],
    next = cursor === undefined ? data.nextCursor : cursor;
  const more = async () => {
    setBusy(true);
    setPageError(false);
    try {
      const result = await api<{ data: typeof data }>(
        `/clubs/${clubId}/library?cursor=${next}`,
      );
      if (result.data) {
        setExtra((previous) => [...previous, ...result.data!.reads]);
        setCursor(result.data.nextCursor);
      }
    } catch {
      setPageError(true);
    } finally {
      setBusy(false);
    }
  };
  let previousYear = "";
  return (
    <div className={styles.clubOverview}>
      <h2>{t("tabLibrary")}</h2>
      {!reads.length && <p>{t("readNoHistory")}</p>}
      {reads.map((item) => {
        const date =
          item.read.completedAt ??
          item.read.targetEndDate ??
          item.read.startDate;
        const year = date
          ? String(new Date(date).getFullYear())
          : t("readEarlier");
        const heading = year !== previousYear;
        previousYear = year;
        return (
          <section key={item.read.id}>
            {heading && <h3>{year}</h3>}
            <ReadIdentity item={item} compact />
            <SummaryCounts item={item} />
          </section>
        );
      })}
      {next && (
        <Button disabled={busy} onClick={() => void more()}>
          {t("readMore")}
        </Button>
      )}
      {pageError && <p role="alert">{t("readLoadError")}</p>}
    </div>
  );
}
