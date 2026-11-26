import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type {
  ClubDiscussionAnchor,
  ClubDiscussionAnchorsAll,
} from "@shared/clubs";
import { Button } from "../../../components/primitives";
import { LoadingState } from "../../../components/states";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import { api } from "../../api";
import { anchorMessageLine } from "./club-discussion-display";
import styles from "./clubs.module.css";

export interface ClubDiscussionAnchorsDialogProps {
  clubId: string;
  open: boolean;
  isMember: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function ClubDiscussionAnchorsDialog({
  clubId,
  open,
  isMember,
  onOpenChange,
  onChanged,
}: ClubDiscussionAnchorsDialogProps) {
  const { t } = useTranslation("clubs");
  const navigate = useNavigate();
  const [data, setData] = useState<ClubDiscussionAnchorsAll | null>(null);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!open) return;
    setLoading(true);
    void api<{ data: ClubDiscussionAnchorsAll }>(
      `/clubs/${clubId}/discussion-anchors/all`,
    )
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, [clubId, open]);

  useEffect(() => {
    load();
  }, [load]);

  async function startDiscussion(anchor: ClubDiscussionAnchor) {
    if (anchor.topicId) {
      onOpenChange(false);
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
      onOpenChange(false);
      onChanged?.();
      void navigate(`/clubs/${clubId}/topics/${res.data.topicId}`);
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("viewAllAnchors")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {loading || !data ? (
            <LoadingState />
          ) : (
            <>
              {data.anchors.length > 0 && (
                <section className={styles.clubDialogSection}>
                  <h3 className={styles.clubSectionLabel}>
                    {t("scheduleAnchors")}
                  </h3>
                  <ul className={styles.clubDiscussionList}>
                    {data.anchors.map((anchor) => (
                      <li key={anchor.id} className={styles.clubDiscussionRow}>
                        <div className={styles.clubDiscussionRowMain}>
                          {anchor.topicId ? (
                            <Link
                              to={`/clubs/${clubId}/topics/${anchor.topicId}`}
                              className={styles.clubDiscussionLabel}
                              onClick={() => onOpenChange(false)}
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
                            {anchorMessageLine(anchor.messageCount, t)}
                          </span>
                          {!anchor.topicId &&
                            anchor.messageCount === 0 &&
                            isMember && (
                              <Button
                                type="button"
                                disabled={openingId === anchor.id}
                                onClick={() => void startDiscussion(anchor)}
                              >
                                {t("startDiscussion")}
                              </Button>
                            )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.general.length > 0 && (
                <section className={styles.clubDialogSection}>
                  <h3 className={styles.clubSectionLabel}>
                    {t("generalDiscussion")}
                  </h3>
                  <ul className={styles.clubDiscussionList}>
                    {data.general.map((topic) => (
                      <li
                        key={topic.topicId}
                        className={styles.clubDiscussionRow}
                      >
                        <div className={styles.clubDiscussionRowMain}>
                          <Link
                            to={`/clubs/${clubId}/topics/${topic.topicId}`}
                            className={styles.clubDiscussionLabel}
                            onClick={() => onOpenChange(false)}
                          >
                            {topic.title}
                          </Link>
                          {topic.pinned && (
                            <span className={styles.clubDiscussionMetaTag}>
                              {t("pinned")}
                            </span>
                          )}
                        </div>
                        <span className={styles.clubDiscussionCount}>
                          {anchorMessageLine(topic.messageCount, t)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.anchors.length === 0 && data.general.length === 0 && (
                <p className={styles.sectionEmpty}>{t("noDiscussionAnchors")}</p>
              )}
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
