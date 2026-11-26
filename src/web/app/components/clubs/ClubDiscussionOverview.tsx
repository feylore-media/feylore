import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { ClubDiscussionAnchor } from "@shared/clubs";
import { Button } from "../../../components/primitives";
import { LoadingState } from "../../../components/states";
import { api } from "../../api";
import {
  anchorEmphasisLabel,
  anchorMessageLine,
} from "./club-discussion-display";
import { ClubDiscussionAnchorsDialog } from "./ClubDiscussionAnchorsDialog";
import styles from "./clubs.module.css";

export interface ClubDiscussionOverviewProps {
  clubId: string;
  isMember: boolean;
  anchors?: ClubDiscussionAnchor[];
  onRefresh?: () => void;
}

export function ClubDiscussionOverview({
  clubId,
  isMember,
  anchors: anchorsProp,
  onRefresh,
}: ClubDiscussionOverviewProps) {
  const { t } = useTranslation("clubs");
  const navigate = useNavigate();
  const preloaded = anchorsProp !== undefined;
  const [anchors, setAnchors] = useState<ClubDiscussionAnchor[]>(
    anchorsProp ?? [],
  );
  const [loading, setLoading] = useState(!preloaded);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (anchorsProp !== undefined) {
      setAnchors(anchorsProp);
      setLoading(false);
    }
  }, [anchorsProp]);

  const load = useCallback(() => {
    if (preloaded) {
      onRefresh?.();
      return;
    }
    setLoading(true);
    void api<{ data: { anchors: ClubDiscussionAnchor[] } }>(
      `/clubs/${clubId}/discussion-anchors`,
    )
      .then((res) => setAnchors(res.data.anchors))
      .finally(() => setLoading(false));
  }, [clubId, preloaded, onRefresh]);

  useEffect(() => {
    if (!preloaded) {
      load();
    }
  }, [load, preloaded]);

  async function startDiscussion(anchor: ClubDiscussionAnchor) {
    if (anchor.topicId) {
      void navigate(`/clubs/${clubId}/topics/${anchor.topicId}`);
      return;
    }
    if (!isMember) return;

    setOpeningId(anchor.id);
    try {
      const res = await api<{ data: { topicId: string } }>(
        `/clubs/${clubId}/schedule/occurrences/${anchor.occurrenceId}/discussion`,
        { method: "POST" },
      );
      void navigate(`/clubs/${clubId}/topics/${res.data.topicId}`);
    } finally {
      setOpeningId(null);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  return (
    <>
      {anchors.length === 0 ? (
        <p className={styles.sectionEmpty}>{t("noDiscussionAnchors")}</p>
      ) : (
        <ul className={styles.clubDiscussionList}>
          {anchors.map((anchor) => {
            const emphasis = anchorEmphasisLabel(anchor.emphasis, t);
            const messageLine = anchorMessageLine(anchor.messageCount, t);
            const rowClass =
              anchor.emphasis === "current"
                ? `${styles.clubDiscussionRow} ${styles.anchorCurrent}`
                : anchor.emphasis === "last_check_in"
                  ? `${styles.clubDiscussionRow} ${styles.anchorLastCheckIn}`
                  : styles.clubDiscussionRow;

            return (
              <li key={anchor.id} className={rowClass}>
                <div className={styles.clubDiscussionRowMain}>
                  {emphasis && (
                    <span className={styles.clubDiscussionEmphasis}>
                      {emphasis}
                    </span>
                  )}
                  {anchor.topicId ? (
                    <Link
                      to={`/clubs/${clubId}/topics/${anchor.topicId}`}
                      className={styles.clubDiscussionLabel}
                    >
                      {anchor.label}
                    </Link>
                  ) : (
                    <span className={styles.clubDiscussionLabel}>
                      {anchor.label}
                    </span>
                  )}
                </div>
                <div className={styles.clubDiscussionRowMeta}>
                  <span className={styles.clubDiscussionCount}>
                    {messageLine}
                  </span>
                  {!anchor.topicId && anchor.messageCount === 0 && isMember && (
                    <Button
                      type="button"
                      variant="primary"
                      disabled={openingId === anchor.id}
                      onClick={() => void startDiscussion(anchor)}
                    >
                      {t("startDiscussion")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.clubDiscussionFooter}>
        <Button type="button" onClick={() => setViewAllOpen(true)}>
          {t("viewAllAnchors")}
        </Button>
      </div>

      <ClubDiscussionAnchorsDialog
        clubId={clubId}
        open={viewAllOpen}
        isMember={isMember}
        onOpenChange={setViewAllOpen}
        onChanged={load}
      />
    </>
  );
}
