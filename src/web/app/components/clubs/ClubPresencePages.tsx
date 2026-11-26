import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { UserIdentity } from "../../../components/users";
import { RatingVisualization } from "../../../components/ratings/RatingVisualization";
import type {
  ClubMemberExperience,
  ClubMembersExperience,
  ClubStatsExperience,
  ClubMemberPresence,
} from "@shared/club-presence";
import styles from "./clubs.module.css";

function Progress({ member }: { member: ClubMemberPresence }) {
  const { t } = useTranslation("clubs");
  const progress = member.progress;
  const label =
    progress.state === "private"
      ? t("presencePrivate")
      : progress.state === "unknown"
        ? t("presenceUnknown")
        : progress.state === "finished"
          ? t("presenceFinished")
          : progress.state === "not_started"
            ? t("presenceNotStarted")
            : progress.percent != null
              ? t("presenceReadingPercent", { count: progress.percent })
              : t("presenceReading");
  return (
    <div>
      <p>
        {label}
        {progress.state === "reading" && progress.chapter != null
          ? ` · ${t("presenceChapter", { count: progress.chapter })}`
          : progress.state === "reading" && progress.page != null
            ? ` · ${t("presencePage", { count: progress.page })}`
            : ""}
      </p>
      {progress.percent != null && progress.state === "reading" && (
        <progress
          value={progress.percent}
          max={100}
          aria-label={t("presenceReadingPercent", { count: progress.percent })}
        />
      )}
      {member.checkIn && (
        <p className={styles.presenceMuted}>
          {member.checkIn === "caught_up"
            ? t("presenceCaughtUp")
            : t("presenceNotYet")}
        </p>
      )}
    </div>
  );
}

export function ClubMembersPage({ clubId }: { clubId: string }) {
  const { t } = useTranslation("clubs");
  const [data, setData] = useState<ClubMembersExperience | null>(null);
  const [detail, setDetail] = useState<ClubMemberExperience | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    void api<{ data: ClubMembersExperience }>(
      `/clubs/${clubId}/members/experience`,
    )
      .then((result) => {
        if (live) setData(result.data);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [clubId]);
  const open = (id: string) => {
    setError(false);
    void api<{ data: ClubMemberExperience }>(
      `/clubs/${clubId}/members/${id}/experience`,
    )
      .then((result) => setDetail(result.data))
      .catch(() => setError(true));
  };
  const more = () => {
    if (!detail?.nextCursor) return;
    void api<{ data: ClubMemberExperience }>(
      `/clubs/${clubId}/members/${detail.member.userId}/experience?cursor=${detail.nextCursor}`,
    )
      .then((result) =>
        setDetail((current) =>
          current && current.member.userId === result.data.member.userId
            ? {
                ...result.data,
                recentReads: [
                  ...current.recentReads,
                  ...result.data.recentReads,
                ],
              }
            : current,
        ),
      )
      .catch(() => setError(true));
  };
  if (error) return <p role="alert">{t("presenceUnavailable")}</p>;
  if (!data) return <p>{t("loading")}</p>;
  return (
    <section className={styles.presencePage}>
      <h2>
        {detail ? (
          <UserIdentity
            user={{
              username: detail.member.username,
              displayName: detail.member.displayName,
              avatarUrl: detail.member.avatarUrl,
              cosmetics: detail.member.cosmetics ?? null,
            }}
            variant="compact"
          />
        ) : (
          t("members")
        )}
      </h2>
      {detail ? (
        <>
          <button
            type="button"
            className={styles.presenceLink}
            onClick={() => setDetail(null)}
          >
            {t("presenceBack")}
          </button>
          <p className={styles.presenceMuted}>
            {t("presenceMemberSince", {
              date: new Date(detail.member.joinedAt).toLocaleDateString(
                undefined,
                { month: "long", year: "numeric" },
              ),
            })}
          </p>
          <h3>{t("presenceCurrentRead")}</h3>
          {data.activeRead ? (
            <Progress member={detail.member} />
          ) : (
            <p>{t("presenceNoActiveRead")}</p>
          )}
          <h3>{t("presenceReadTogether")}</h3>
          <p>
            {t("presenceReadCount", { count: detail.member.readCount })} ·{" "}
            {t("presenceCompletedCount", {
              count: detail.member.completedCount,
            })}
          </p>
          <h3>{t("presenceRecentReads")}</h3>
          <ul className={styles.presenceList}>
            {detail.recentReads.map((read) => (
              <li key={read.id}>
                <span>{read.title}</span>
                {read.rating != null && <span>{read.rating.toFixed(1)} ★</span>}
              </li>
            ))}
          </ul>
          {detail.nextCursor && (
            <button type="button" onClick={more}>
              {t("presenceMoreReads")}
            </button>
          )}
          <h3>{t("presenceShared")}</h3>
          <p>
            {t("presencePassages", { count: detail.sharedPassages })} ·{" "}
            {t("presenceDiscussions", { count: detail.discussions })}
          </p>
        </>
      ) : (
        <>
          <p className={styles.presenceMuted}>
            {t("presenceMemberCount", { count: data.members.length })}
            {data.activeRead && ` · ${data.activeRead.title}`}
          </p>
          <ul className={styles.presenceList}>
            {data.members.map((member) => (
              <li key={member.userId}>
                <UserIdentity
                  user={{
                    username: member.username,
                    displayName: member.displayName,
                    avatarUrl: member.avatarUrl,
                    cosmetics: member.cosmetics ?? null,
                  }}
                  variant="full"
                />
                <div>
                  <button
                    type="button"
                    className={styles.presenceLink}
                    onClick={() => open(member.userId)}
                  >
                    {t("presenceViewDetail", { defaultValue: "View club activity" })}
                  </button>
                  {data.activeRead && <Progress member={member} />}
                  <small>
                    {t("presenceReadCount", { count: member.readCount })} ·{" "}
                    {t("presenceCompletedCount", {
                      count: member.completedCount,
                    })}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function ClubStatsPage({ clubId }: { clubId: string }) {
  const { t } = useTranslation("clubs");
  const [data, setData] = useState<ClubStatsExperience | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    void api<{ data: ClubStatsExperience }>(`/clubs/${clubId}/stats`)
      .then((result) => {
        if (live) setData(result.data);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [clubId]);
  if (error) return <p role="alert">{t("statsUnavailable")}</p>;
  if (!data) return <p>{t("loading")}</p>;
  if (!data.summary.reads)
    return (
      <section className={styles.presencePage}>
        <h2>{t("tabStats")}</h2>
        <p>{t("statsEmpty")}</p>
      </section>
    );
  return (
    <section className={styles.presencePage}>
      <h2>{t("tabStats")}</h2>
      <p className={styles.presenceMuted}>
        {t("statsSince", {
          date: data.since
            ? new Date(data.since).toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })
            : "",
        })}
      </p>
      <div className={styles.statsSummary}>
        <strong>{t("statsReads", { count: data.summary.reads })}</strong>
        <span>{t("statsDistinct", { count: data.summary.distinctWorks })}</span>
        <span>{t("statsRereads", { count: data.summary.rereads })}</span>
        {data.summary.knownPages != null && (
          <span>
            {t("statsPages", {
              count: data.summary.knownPages,
              known: data.summary.pageCountKnown,
            })}
          </span>
        )}
      </div>
      <h3>{t("statsLength")}</h3>
      <p>
        {data.length.median != null
          ? t("statsMedianPages", {
              count: Math.round(data.length.median),
              known: data.summary.pageCountKnown,
            })
          : t("statsNoPages")}
      </p>
      {data.length.average != null && (
        <p className={styles.presenceMuted}>
          {t("statsLengthRange", {
            average: Math.round(data.length.average),
            shortest: data.length.shortest,
            longest: data.length.longest,
          })}
        </p>
      )}
      <h3>{t("statsPace")}</h3>
      <p>
        {data.pace.medianDays != null
          ? t("statsMedianDays", {
              count: Math.round(data.pace.medianDays),
              known: data.pace.datedReads,
            })
          : t("statsNoDates")}
      </p>
      <h3>{t("statsParticipation")}</h3>
      <p>
        {t("statsTypical", {
          count: data.participation.typicalParticipants ?? 0,
        })}
      </p>
      <p>
        {t("statsFinished", {
          count: data.participation.completedParticipantOccurrences,
          total: data.participation.participantOccurrences,
        })}
      </p>
      {data.participation.participantOccurrences > 0 && (
        <p className={styles.presenceMuted}>
          {t("statsCheckIns", {
            count: data.participation.checkInParticipantOccurrences,
            total: data.participation.participantOccurrences,
          })}{" "}
          ·{" "}
          {t("statsDiscussions", {
            count: data.participation.discussionParticipantOccurrences,
            total: data.participation.participantOccurrences,
          })}
        </p>
      )}
      <h3>{t("statsGenres")}</h3>
      {data.genres.length ? (
        <ul className={styles.statsBars}>
          {data.genres.map((item) => (
            <li key={item.name}>
              <span>{item.name}</span>
              <meter
                min={0}
                max={data.summary.reads}
                value={item.reads}
                aria-label={t("statsGenreReads", {
                  name: item.name,
                  count: item.reads,
                })}
              />
              <span>{item.reads}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("statsNoGenres")}</p>
      )}
      <h3>{t("statsRatings")}</h3>
      <p>
        {data.ratings.average != null
          ? t("statsRatingAverage", {
              rating: data.ratings.average.toFixed(1),
              count: data.ratings.count,
            })
          : t("statsNoRatings")}
      </p>
      <p>
        {data.recommendations.total
          ? t("statsRecommend", {
              yes: data.recommendations.yes,
              total: data.recommendations.total,
            })
          : t("statsNoRecommendations")}
      </p>
      {data.ratings.distribution.length > 0 && (
        <ul className={styles.statsBars}>
          {data.ratings.distribution.map((item) => (
            <li key={item.rating}>
              <span>{item.rating} ★</span>
              <meter
                min={0}
                max={data.ratings.count}
                value={item.count}
                aria-label={t("statsRatingBucket", {
                  rating: item.rating,
                  count: item.count,
                })}
              />
              <span>{item.count}</span>
            </li>
          ))}
        </ul>
      )}
      {(Object.keys(data.ratings.coreValues).length > 0 ||
        Object.keys(data.ratings.genreValues).length > 0 ||
        data.ratings.trajectory.length > 0) && (
        <RatingVisualization
          review={{
            coreValues: data.ratings.coreValues,
            genreValues: data.ratings.genreValues,
            trajectory: data.ratings.trajectory,
          }}
          coreDimensions={data.ratings.dimensions}
          genreDefinitions={data.ratings.genreDefinitions}
          scale={data.ratings.scale}
        />
      )}
      {data.overTime.length > 1 && (
        <>
          <h3>{t("statsOverTime")}</h3>
          <ul className={styles.statsBars}>
            {data.overTime.map((item) => (
              <li key={item.month}>
                <span>{item.month}</span>
                <meter
                  min={0}
                  max={Math.max(...data.overTime.map((x) => x.reads))}
                  value={item.reads}
                />
                <span>{item.reads}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {(data.highlights.highestRated || data.highlights.divisive) && (
        <>
          <h3>{t("statsHighlights")}</h3>
          {data.highlights.highestRated && (
            <p>
              {t("statsHighestRated", {
                title: data.highlights.highestRated.title,
                rating: data.highlights.highestRated.rating.toFixed(1),
              })}
            </p>
          )}
          {data.highlights.divisive && (
            <p>
              {t("statsDivisive", {
                title: data.highlights.divisive.title,
                deviation:
                  data.highlights.divisive.standardDeviation.toFixed(2),
              })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
