import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClubCheckInSummary, ClubScheduleOccurrence } from "@shared/clubs";
import { Button } from "../../../components/primitives";
import { LoadingState } from "../../../components/states";
import { api } from "../../api";
import styles from "./clubs.module.css";

export interface ClubCheckInPanelProps {
  clubId: string;
  isMember: boolean;
  onOpenSettings?: () => void;
  summary?: ClubCheckInSummary;
  onSummaryChange?: (summary: ClubCheckInSummary) => void;
}

function formatCheckInDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
}

function OccurrenceBlock({
  label,
  occurrence,
  completed,
}: {
  label: string;
  occurrence: ClubScheduleOccurrence;
  completed?: boolean;
}) {
  const { t } = useTranslation("clubs");
  return (
    <div className={styles.clubCheckInBlock}>
      <p className={styles.clubCheckInBlockLabel}>{label}</p>
      <p className={styles.clubCheckInTarget}>{occurrence.consumptionLabel}</p>
      {completed && (
        <p className={styles.clubCheckInMeta}>{t("checkInCompleted")}</p>
      )}
      {!completed && (
        <p className={styles.clubCheckInMeta}>
          {formatCheckInDate(occurrence.scheduledAt)}
        </p>
      )}
    </div>
  );
}

export function ClubCheckInPanel({
  clubId,
  isMember,
  onOpenSettings,
  summary: summaryProp,
  onSummaryChange,
}: ClubCheckInPanelProps) {
  const { t } = useTranslation("clubs");
  const preloaded = summaryProp !== undefined;
  const [summary, setSummary] = useState<ClubCheckInSummary | null>(
    summaryProp ?? null,
  );
  const [loading, setLoading] = useState(!preloaded);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (summaryProp !== undefined) {
      setSummary(summaryProp);
      setLoading(false);
    }
  }, [summaryProp]);

  const load = useCallback(() => {
    if (preloaded) return;
    setLoading(true);
    void api<{ data: ClubCheckInSummary }>(`/clubs/${clubId}/check-in`)
      .then((res) => setSummary(res.data))
      .finally(() => setLoading(false));
  }, [clubId, preloaded]);

  useEffect(() => {
    load();
  }, [load]);

  function updateSummary(next: ClubCheckInSummary) {
    setSummary(next);
    onSummaryChange?.(next);
  }

  async function toggleCheckIn() {
    if (!summary?.target) return;
    setSubmitting(true);
    try {
      const occurrenceId = summary.target.id;
      const method = summary.viewerCheckedIn ? "DELETE" : "POST";
      const res = await api<{ data: ClubCheckInSummary }>(
        `/clubs/${clubId}/schedule/occurrences/${occurrenceId}/check-in`,
        { method },
      );
      updateSummary(res.data);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !summary) {
    return (
      <section className={styles.clubSection} aria-labelledby="club-check-in-heading">
        <h2 id="club-check-in-heading" className={styles.clubSectionLabel}>
          {t("checkIn")}
        </h2>
        <LoadingState />
      </section>
    );
  }

  const showActiveTarget = !!summary.target;
  const showLastAndNext = !summary.target && (summary.lastCheckIn || summary.nextCheckIn);

  return (
    <section className={styles.clubSection} aria-labelledby="club-check-in-heading">
      <h2 id="club-check-in-heading" className={styles.clubSectionLabel}>
        {t("checkIn")}
      </h2>

      {!summary.target && !summary.lastCheckIn && !summary.nextCheckIn ? (
        <div>
          <p className={styles.sectionEmpty}>{t("noCheckInSchedule")}</p>
          {onOpenSettings && (
            <button
              type="button"
              className={styles.clubInlineAction}
              onClick={onOpenSettings}
            >
              {t("manageSchedule")}
            </button>
          )}
        </div>
      ) : (
        <>
          {showActiveTarget && summary.target && (
            <OccurrenceBlock
              label={t("checkInCurrent")}
              occurrence={summary.target}
            />
          )}

          {showLastAndNext && summary.lastCheckIn && (
            <OccurrenceBlock
              label={t("checkInLast")}
              occurrence={summary.lastCheckIn}
              completed
            />
          )}

          {showLastAndNext && summary.nextCheckIn && (
            <OccurrenceBlock
              label={t("checkInNext")}
              occurrence={summary.nextCheckIn}
            />
          )}

          {summary.displayOccurrenceId && (
            <p className={styles.clubCheckInCounts}>
              {t("checkInCount", {
                checked: summary.checkedInCount,
                total: summary.memberCount,
              })}
            </p>
          )}

          {showActiveTarget && isMember && summary.target && (
            <Button
              type="button"
              variant={summary.viewerCheckedIn ? "default" : "primary"}
              disabled={submitting}
              onClick={() => void toggleCheckIn()}
            >
              {summary.viewerCheckedIn ? t("removeCaughtUp") : t("imCaughtUp")}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
