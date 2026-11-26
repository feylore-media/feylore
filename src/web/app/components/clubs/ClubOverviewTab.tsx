import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClubContext, ClubOverview } from "@shared/clubs";
import { api } from "../../api";
import { LoadingState } from "../../../components/states";
import { ClubCheckInPanel } from "./ClubCheckInPanel";
import { ClubCurrentWorkCard } from "./ClubCurrentWorkCard";
import { ClubDiscussionOverview } from "./ClubDiscussionOverview";
import { ClubWhatsNextPoll } from "./ClubWhatsNextPoll";
import { ClubQuotesSection } from "./ClubQuotesSection";
import styles from "./clubs.module.css";

export interface ClubOverviewTabProps {
  clubId: string;
  context: ClubContext;
  canModerate: boolean;
  isMember: boolean;
  onOpenSettings?: () => void;
}

export function ClubOverviewTab({
  clubId,
  context,
  canModerate,
  isMember,
  onOpenSettings,
}: ClubOverviewTabProps) {
  const { t } = useTranslation("clubs");
  const [overview, setOverview] = useState<ClubOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(() => {
    setLoading(true);
    void api<{ data: ClubOverview }>(`/clubs/${clubId}/overview`)
      .then((res) => setOverview(res.data))
      .finally(() => setLoading(false));
  }, [clubId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  if (loading || !overview) {
    return <LoadingState />;
  }

  return (
    <div className={styles.clubOverview}>
      <div className={styles.clubOverviewPair}>
        <div className={styles.clubOverviewPairColumn}>
          <ClubCurrentWorkCard
            context={context}
            work={overview.work}
            canModerate={canModerate}
            onOpenSettings={onOpenSettings}
          />
        </div>
        <div className={styles.clubOverviewPairColumn}>
          <ClubCheckInPanel
            clubId={clubId}
            isMember={isMember}
            onOpenSettings={onOpenSettings}
            summary={overview.checkIn}
            onSummaryChange={(checkIn) =>
              setOverview((current) =>
                current ? { ...current, checkIn } : current,
              )
            }
          />
        </div>
      </div>

      <section
        className={styles.clubSection}
        aria-labelledby="club-discussion-heading"
      >
        <h2 id="club-discussion-heading" className={styles.clubSectionLabel}>
          {t("discussion")}
        </h2>
        <ClubDiscussionOverview
          clubId={clubId}
          isMember={isMember}
          anchors={overview.discussionAnchors}
          onRefresh={loadOverview}
        />
      </section>

      <ClubWhatsNextPoll
        clubId={clubId}
        isMember={isMember}
        poll={overview.activePoll}
        onPollChange={(activePoll) =>
          setOverview((current) =>
            current ? { ...current, activePoll } : current,
          )
        }
      />

      {context === "book" && (
        <ClubQuotesSection
          clubId={clubId}
          isMember={isMember}
          quotes={overview.quotes}
          onRefresh={loadOverview}
        />
      )}
    </div>
  );
}
