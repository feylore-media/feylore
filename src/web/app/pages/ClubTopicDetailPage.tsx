import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ClubDetail, ClubTopicDetail } from "@shared/clubs";
import { api } from "../api";
import { Button } from "../../components/primitives";
import { UserIdentity } from "../../components/users";
import { EmptyState, LoadingState } from "../../components/states";
import {
  ClubPostComposer,
  ClubPostItem,
  togglePostReaction,
} from "../components/clubs/ClubPost";
import { ClubPostBody } from "../components/clubs/ClubPostBody";
import pageStyles from "./pages.module.css";

export function ClubTopicDetailPage() {
  const { id, topicId } = useParams<{ id: string; topicId: string }>();
  const { t } = useTranslation("clubs");
  const [clubDetail, setClubDetail] = useState<ClubDetail | null>(null);
  const [topicDetail, setTopicDetail] = useState<ClubTopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!id || !topicId) return;
    setLoading(true);
    setError(false);
    Promise.all([
      api<{ data: ClubDetail }>(`/clubs/${id}`),
      api<{ data: ClubTopicDetail }>(`/clubs/${id}/topics/${topicId}`),
    ])
      .then(([club, topic]) => {
        setClubDetail(club.data);
        setTopicDetail(topic.data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id, topicId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReply(input: {
    body: string;
    bodyFormat?: "plain" | "structured";
  }) {
    if (!id || !topicId) return;
    await api(`/clubs/${id}/topics/${topicId}/posts`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    load();
  }

  async function handleDeletePost(postId: string) {
    if (!id || !topicId) return;
    await api(`/clubs/${id}/topics/${topicId}/posts/${postId}`, {
      method: "DELETE",
    });
    load();
  }

  async function handlePin() {
    if (!id || !topicId || !topicDetail) return;
    await api(`/clubs/${id}/topics/${topicId}`, {
      method: "PATCH",
      body: JSON.stringify({ pinned: !topicDetail.topic.pinned }),
    });
    load();
  }

  async function handleClose() {
    if (!id || !topicId || !topicDetail) return;
    await api(`/clubs/${id}/topics/${topicId}`, {
      method: "PATCH",
      body: JSON.stringify({ closed: !topicDetail.topic.closed }),
    });
    load();
  }

  if (loading) return <LoadingState />;
  if (error || !topicDetail || !clubDetail || !id || !topicId) {
    return (
      <EmptyState titleKey="notFound" ns="clubs" detailKey="backToClubs" />
    );
  }

  const { topic, posts, canReply, canModerate } = topicDetail;
  if (topic.locked)
    return (
      <div className={pageStyles.page}>
        <Link to={`/clubs/${id}/discussions`}>{t("tabDiscussions")}</Link>
        <h1>{t("roomLocked")}</h1>
        <p>{topic.locationLabel}</p>
      </div>
    );

  return (
    <div className={pageStyles.page}>
      <p>
        <Link to={`/clubs/${id}`}>{t("backToClub")}</Link>
      </p>

      {topic.clubReadId && (
        <p>
          <Link to={`/clubs/${id}/reads/${topic.clubReadId}`}>
            {topicDetail.readTitle}
          </Link>{" "}
          - {topic.locationLabel}
        </p>
      )}
      {topicDetail.readerHref && (
        <p>
          <Link to={topicDetail.readerHref}>
            {t(
              topicDetail.readerHref.includes("?locator=")
                ? "roomJump"
                : "readOpenReader",
            )}
          </Link>
        </p>
      )}
      <h1>{topic.title}</h1>
      <p className={pageStyles.lead}>
        {topic.kind === "announcement" && `${t("kindAnnouncement")} · `}
        {topic.pinned && `${t("pinned")} · `}
        {topic.closed && `${t("closed")} · `}
        {topic.replyCount} {t("replies")}
      </p>

      {canModerate && (
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            marginBottom: "var(--space-4)",
          }}
        >
          <Button type="button" onClick={() => void handlePin()}>
            {topic.pinned ? t("unpin") : t("pin")}
          </Button>
          <Button type="button" onClick={() => void handleClose()}>
            {topic.closed ? t("reopen") : t("close")}
          </Button>
        </div>
      )}

      <section className={pageStyles.settingsSection}>
        <p>
          <UserIdentity
            user={{
              username: topic.authorUsername,
              displayName: topic.authorDisplayName,
              cosmetics: topic.authorCosmetics ?? null,
            }}
            variant="full"
          />{" "}
          <span className={pageStyles.lead}>
            {new Date(topic.createdAt).toLocaleString()}
          </span>
        </p>
        <p style={{ whiteSpace: "pre-wrap" }}>
          <ClubPostBody
            body={topic.body}
            bodyFormat={topic.bodyFormat ?? "plain"}
            segments={topic.segments}
            mentions={topic.mentions}
            autoHidden={topic.autoHidden}
            autoHiddenReason={topic.autoHiddenReason}
          />
        </p>
      </section>

      <section className={pageStyles.settingsSection}>
        <h2>{t("replies")}</h2>
        <ul className={pageStyles.list}>
          {posts.map((post) => (
            <ClubPostItem
              key={post.id}
              post={post}
              onDelete={() => void handleDeletePost(post.id)}
              onReactionToggle={() =>
                void togglePostReaction(id, topicId, post.id).then(load)
              }
            />
          ))}
        </ul>
        {posts.length === 0 && (
          <p className={pageStyles.lead}>{t("noReplies")}</p>
        )}
      </section>

      {canReply && clubDetail.isMember && (
        <ClubPostComposer
          members={clubDetail.members}
          onSubmit={handleReply}
          placeholder={t("replyPlaceholder")}
        />
      )}
      {topic.closed && <p className={pageStyles.lead}>{t("topicClosed")}</p>}
    </div>
  );
}
