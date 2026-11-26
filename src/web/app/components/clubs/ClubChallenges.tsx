import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ChallengeRecord } from "@shared/challenges";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import { ErrorState, LoadingState } from "../../../components/states";
import { ChallengeSection } from "../../pages/ChallengePages";
import styles from "../../pages/goals.module.css";

type ClubChallengesResponse = {
  active: ChallengeRecord[];
  upcoming: ChallengeRecord[];
  past: ChallengeRecord[];
  canCreate: boolean;
};

type ClubChallengeActivityItem = {
  id: string;
  type: string;
  actorUserId: string;
  username: string | null;
  displayName: string | null;
  challengeId: string;
  title: string | null;
  milestone: number | null;
  createdAt: string;
};

function displayNameOf(item: ClubChallengeActivityItem): string {
  return (
    item.displayName ?? item.username ?? item.actorUserId.slice(0, 8)
  );
}

function activityText(
  item: ClubChallengeActivityItem,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const name = displayNameOf(item);
  const title = item.title ?? item.challengeId.slice(0, 8);
  switch (item.type) {
    case "challenge.joined":
      return t("activityJoined", { name, title });
    case "challenge.started":
      return t("activityStarted", { name, title });
    case "challenge.milestone":
      return t("activityMilestone", {
        name,
        title,
        milestone: item.milestone ?? 0,
      });
    case "challenge.completed":
      return t("activityCompleted", { name, title });
    case "challenge.achievement_earned":
      return t("activityAchievement", { name, title });
    case "challenge.ended":
      return t("activityEnded", { name, title });
    default:
      return t("activityGeneric", { name, title });
  }
}

/**
 * Club Challenges tab: Active / Upcoming / Past challenges belonging to
 * the club (all formats, no special variants), creation per club
 * permissions, and recent challenge activity consumed from the
 * lifecycle events — never raw objective progress.
 */
export function ClubChallenges({ clubId }: { clubId: string }) {
  const { t } = useTranslation("challenges");
  const [data, setData] = useState<ClubChallengesResponse | null>(null);
  const [activity, setActivity] = useState<ClubChallengeActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    void api<{ data: ClubChallengesResponse }>(`/clubs/${clubId}/challenges`)
      .then((response) => {
        if (live) setData(response.data);
      })
      .catch((reason: Error) => {
        if (live) setError(reason.message);
      });
    void api<{ data: ClubChallengeActivityItem[] }>(
      `/clubs/${clubId}/challenges/activity`,
    )
      .then((response) => {
        if (live) setActivity(response.data);
      })
      .catch(() => {
        if (live) setActivity([]);
      });
    return () => {
      live = false;
    };
  }, [clubId]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  const empty =
    data.active.length === 0 &&
    data.upcoming.length === 0 &&
    data.past.length === 0;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t("clubChallengesTitle")}</p>
        </div>
        {data.canCreate && (
          <Link to={`/challenges/new?clubId=${encodeURIComponent(clubId)}`}>
            <Button variant="primary">{t("newChallenge")}</Button>
          </Link>
        )}
      </div>

      {empty && (
        <section className={styles.section}>
          <p className={styles.lead}>{t("clubChallengesEmpty")}</p>
        </section>
      )}

      {data.active.length > 0 && (
        <ChallengeSection title={t("active")} challenges={data.active} />
      )}
      {data.upcoming.length > 0 && (
        <ChallengeSection title={t("upcoming")} challenges={data.upcoming} />
      )}
      {data.past.length > 0 && (
        <ChallengeSection title={t("ended")} challenges={data.past} />
      )}

      {activity.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("challengeActivity")}</h2>
          <ul className={styles.ruleList}>
            {activity.map((item) => (
              <li className={styles.ruleItem} key={item.id}>
                <Link to={`/challenges/${item.challengeId}`}>
                  <strong>{activityText(item, t)}</strong>
                </Link>
                <span className={styles.detailMeta}>
                  {" "}
                  ·{" "}
                  {new Date(item.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
