import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ClubPollPublic } from "@shared/clubs";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import styles from "./clubs.module.css";
import pageStyles from "../../pages/pages.module.css";

export function ClubWhatsNextPoll({
  clubId,
  isMember,
  poll: pollProp,
  onPollChange,
}: {
  clubId: string;
  isMember: boolean;
  poll?: ClubPollPublic | null;
  onPollChange?: (poll: ClubPollPublic | null) => void;
}) {
  const { t } = useTranslation("clubs");
  const preloaded = pollProp !== undefined;
  const [poll, setPoll] = useState<ClubPollPublic | null>(pollProp ?? null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    if (pollProp !== undefined) {
      setPoll(pollProp);
    }
  }, [pollProp]);

  async function handleVote(optionId: string) {
    if (!poll) return;
    setVoting(true);
    try {
      const res = await api<{ data: ClubPollPublic }>(
        `/clubs/${clubId}/polls/${poll.id}/votes`,
        {
          method: "POST",
          body: JSON.stringify({ optionId }),
        },
      );
      setPoll(res.data);
      onPollChange?.(res.data);
    } finally {
      setVoting(false);
    }
  }

  if (!preloaded) return null;
  if (!poll) return null;

  const visibleOptions = poll.options.filter((option) => !option.removed);
  if (visibleOptions.length === 0) return null;

  return (
    <section
      className={styles.clubSection}
      aria-labelledby="club-poll-heading"
    >
      <h2 id="club-poll-heading" className={styles.clubSectionLabel}>
        {poll.title}
      </h2>
      <p className={pageStyles.lead}>{t("pollVotePrompt")}</p>
      <ul className={styles.clubPollList}>
        {visibleOptions.map((option) => {
          const voted = option.viewerVoted;
          return (
            <li key={option.id} className={styles.clubPollOption}>
              <div className={styles.clubPollOptionMain}>
                <Link to={option.href} className={styles.clubPollOptionTitle}>
                  {option.title}
                </Link>
                {option.source === "tbr" && option.tbrMemberCount ? (
                  <span className={styles.clubPollOptionMeta}>
                    {t("pollTbrCount", { count: option.tbrMemberCount })}
                  </span>
                ) : null}
              </div>
              <div className={styles.clubPollOptionAside}>
                <span className={styles.clubPollVoteCount}>
                  {t("pollVoteCount", { count: option.voteCount })}
                </span>
                {isMember && (
                  <Button
                    type="button"
                    variant={voted ? "primary" : undefined}
                    disabled={voting}
                    onClick={() => void handleVote(option.id)}
                  >
                    {voted ? t("pollVoted") : t("pollVote")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
