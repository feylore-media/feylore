import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ClubTopic } from "@shared/clubs";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import pageStyles from "../../pages/pages.module.css";

export function ClubTopicList({
  clubId,
  canModerate,
  isMember,
}: {
  clubId: string;
  canModerate: boolean;
  isMember: boolean;
}) {
  const { t } = useTranslation("clubs");
  const [topics, setTopics] = useState<ClubTopic[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<"discussion" | "announcement">("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void api<{ data: { topics: ClubTopic[] } }>(`/clubs/${clubId}/topics`)
      .then((r) => setTopics(r.data.topics))
      .finally(() => setLoading(false));
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api(`/clubs/${clubId}/topics`, {
      method: "POST",
      body: JSON.stringify({ kind, title, body }),
    });
    setTitle("");
    setBody("");
    setShowForm(false);
    load();
  }

  async function handlePin(topic: ClubTopic) {
    await api(`/clubs/${clubId}/topics/${topic.id}`, {
      method: "PATCH",
      body: JSON.stringify({ pinned: !topic.pinned }),
    });
    load();
  }

  async function handleClose(topic: ClubTopic) {
    await api(`/clubs/${clubId}/topics/${topic.id}`, {
      method: "PATCH",
      body: JSON.stringify({ closed: !topic.closed }),
    });
    load();
  }

  if (loading) return <p className={pageStyles.lead}>{t("loadingTopics")}</p>;

  return (
    <div>
      {canModerate && isMember && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          {showForm ? (
            <form className={pageStyles.form} onSubmit={handleCreate}>
              <label className={pageStyles.lead}>
                {t("topicKind")}
                <select
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as "discussion" | "announcement")
                  }
                >
                  <option value="discussion">{t("kindDiscussion")}</option>
                  <option value="announcement">{t("kindAnnouncement")}</option>
                </select>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("topicTitle")}
                required
                maxLength={300}
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("topicBody")}
                required
                rows={4}
                maxLength={10000}
              />
              <Button type="submit" variant="primary">
                {t("createTopic")}
              </Button>
              <Button type="button" onClick={() => setShowForm(false)}>
                {t("cancel")}
              </Button>
            </form>
          ) : (
            <Button type="button" onClick={() => setShowForm(true)}>
              {t("newTopic")}
            </Button>
          )}
        </div>
      )}

      {topics.length === 0 ? (
        <p className={pageStyles.lead}>{t("noTopics")}</p>
      ) : (
        <ul className={pageStyles.list}>
          {topics.map((topic) => (
            <li key={topic.id} className={pageStyles.listItem}>
              <Link to={`/clubs/${clubId}/topics/${topic.id}`}>
                {topic.title}
              </Link>
              {topic.pinned && (
                <span className={pageStyles.lead}> · {t("pinned")}</span>
              )}
              {topic.closed && (
                <span className={pageStyles.lead}> · {t("closed")}</span>
              )}
              {topic.kind === "announcement" && (
                <span className={pageStyles.lead}> · {t("kindAnnouncement")}</span>
              )}
              <span className={pageStyles.lead}>
                {" "}
                · {topic.replyCount} {t("replies")} ·{" "}
                {new Date(topic.lastActivityAt).toLocaleString()}
              </span>
              {canModerate && (
                <span style={{ marginLeft: "var(--space-2)" }}>
                  <Button type="button" onClick={() => void handlePin(topic)}>
                    {topic.pinned ? t("unpin") : t("pin")}
                  </Button>
                  <Button type="button" onClick={() => void handleClose(topic)}>
                    {topic.closed ? t("reopen") : t("close")}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
