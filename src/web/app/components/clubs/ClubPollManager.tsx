import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClubContext, ClubPollPublic } from "@shared/clubs";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import { LoadingState } from "../../../components/states";
import { ClubWorkPicker } from "./ClubWorkPicker";
import styles from "./clubs.module.css";
import pageStyles from "../../pages/pages.module.css";

export function ClubPollManager({
  clubId,
  context,
  onPollApplied,
}: {
  clubId: string;
  context: ClubContext;
  onPollApplied?: () => void;
}) {
  const { t } = useTranslation("clubs");
  const [polls, setPolls] = useState<ClubPollPublic[]>([]);
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void api<{ data: ClubPollPublic[] }>(`/clubs/${clubId}/polls`)
      .then((res) => {
        setPolls(res.data);
        const draft = res.data.find((poll) => poll.status === "draft");
        const active = res.data.find((poll) => poll.status === "active");
        const closed = res.data.find((poll) => poll.status === "closed");
        setSelectedPollId(
          (prev) =>
            prev ??
            draft?.id ??
            active?.id ??
            closed?.id ??
            res.data[0]?.id ??
            null,
        );
      })
      .finally(() => setLoading(false));
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);

  const poll = polls.find((row) => row.id === selectedPollId) ?? null;

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      load();
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    await runAction(async () => {
      const res = await api<{ data: { id: string } }>(`/clubs/${clubId}/polls`, {
        method: "POST",
        body: JSON.stringify({ title: t("pollDefaultTitle") }),
      });
      setSelectedPollId(res.data.id);
    });
  }

  if (loading) return <LoadingState />;

  return (
    <section className={styles.clubSettingsBlock}>
      <h2 className={styles.clubSettingsBlockTitle}>{t("pollManagement")}</h2>
      <p className={pageStyles.lead}>{t("pollManagementHint")}</p>

      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
        <Button type="button" onClick={() => void createDraft()} disabled={busy}>
          {t("pollCreateDraft")}
        </Button>
        {polls.length > 1 && (
          <label className={pageStyles.lead}>
            {t("pollSelect")}
            <select
              value={selectedPollId ?? ""}
              onChange={(e) => setSelectedPollId(e.target.value || null)}
            >
              {polls.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title} ({t(`pollStatus_${row.status}`)})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!poll ? (
        <p className={pageStyles.lead}>{t("pollNoDraft")}</p>
      ) : (
        <>
          <p className={pageStyles.lead}>
            {t(`pollStatus_${poll.status}`)} · {t("pollTotalVotes", { count: poll.totalVotes })}
          </p>

          {poll.status === "draft" && (
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    await api(`/clubs/${clubId}/polls/${poll.id}/discover`, {
                      method: "POST",
                    });
                  })
                }
              >
                {t("pollDiscoverCandidates")}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    await api(`/clubs/${clubId}/polls/${poll.id}/publish`, {
                      method: "POST",
                    });
                  })
                }
              >
                {t("pollPublish")}
              </Button>
            </div>
          )}

          {poll.status === "active" && (
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  await api(`/clubs/${clubId}/polls/${poll.id}/close`, {
                    method: "POST",
                  });
                })
              }
            >
              {t("pollClose")}
            </Button>
          )}

          {poll.status === "closed" && (
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  await api(`/clubs/${clubId}/polls/${poll.id}/apply-result`, {
                    method: "POST",
                  });
                  onPollApplied?.();
                })
              }
            >
              {t("pollApplyResult")}
            </Button>
          )}

          <ul className={styles.clubPollList}>
            {poll.options
              .filter((option) => !option.removed)
              .map((option) => (
                <li key={option.id} className={styles.clubPollOption}>
                  <div className={styles.clubPollOptionMain}>
                    <span className={styles.clubPollOptionTitle}>
                      {option.title}
                    </span>
                    <span className={styles.clubPollOptionMeta}>
                      {option.source === "tbr" && option.tbrMemberCount
                        ? t("pollTbrCount", { count: option.tbrMemberCount })
                        : t(`pollSource_${option.source}`)}
                      {poll.status !== "draft"
                        ? ` · ${t("pollVoteCount", { count: option.voteCount })}`
                        : ""}
                    </span>
                  </div>
                  {poll.status === "draft" && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void runAction(async () => {
                          await api(
                            `/clubs/${clubId}/polls/${poll.id}/options/${option.id}`,
                            { method: "DELETE" },
                          );
                        })
                      }
                    >
                      {t("pollRemoveOption")}
                    </Button>
                  )}
                </li>
              ))}
          </ul>

          {poll.status === "draft" && (
            <div style={{ marginTop: "var(--space-4)" }}>
              <h3 style={{ fontSize: "0.95rem" }}>{t("pollAddManualOption")}</h3>
              <ClubWorkPicker
                clubId={clubId}
                context={context}
                onAdded={load}
                addMode="poll"
                pollId={poll.id}
                showHeading={false}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
