import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClubMember, ClubPost } from "@shared/clubs";
import {
  prepareClubPostBody,
  type ClubPostBodyFormat,
} from "@shared/club-spoiler";
import { Button } from "../../../components/primitives";
import { UserIdentity } from "../../../components/users";
import { formatUserHandle } from "@shared/user-identity";
import { ClubPostBody } from "./ClubPostBody";
import pageStyles from "../../pages/pages.module.css";
import { api } from "../../api";

export function ClubPostComposer({
  members,
  onSubmit,
  placeholder,
}: {
  members: ClubMember[];
  onSubmit: (input: {
    body: string;
    bodyFormat?: ClubPostBodyFormat;
  }) => Promise<void>;
  placeholder: string;
}) {
  const { t } = useTranslation("clubs");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const prepared = prepareClubPostBody(body.trim());
      await onSubmit({
        body:
          prepared.bodyFormat === "structured"
            ? prepared.storageBody
            : prepared.plainText,
        bodyFormat: prepared.bodyFormat,
      });
      setBody("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={pageStyles.form} onSubmit={handleSubmit}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={10000}
      />
      <p className={pageStyles.lead}>{t("spoilerComposerHint")}</p>
      <p className={pageStyles.lead}>
        {members.map((m) => formatUserHandle(m.username)).join(" ")}
      </p>
      <Button type="submit" variant="primary" disabled={submitting}>
        {t("reply")}
      </Button>
    </form>
  );
}

export function ClubPostItem({
  post,
  onDelete,
  onReactionToggle,
}: {
  post: ClubPost;
  onDelete: () => void;
  onReactionToggle: () => void;
}) {
  const { t } = useTranslation("clubs");
  const likeReaction = post.reactions.find((r) => r.reaction === "like");
  const likeCount = likeReaction?.count ?? 0;
  const viewerLiked = likeReaction?.viewerReacted ?? false;

  if (post.deleted) {
    return (
      <li className={pageStyles.listItem}>
        <em className={pageStyles.lead}>{t("postDeleted")}</em>
      </li>
    );
  }

  return (
    <li className={pageStyles.listItem}>
      <p>
        <UserIdentity
          user={{
            username: post.authorUsername,
            displayName: post.authorDisplayName,
            cosmetics: post.authorCosmetics ?? null,
          }}
          variant="full"
        />{" "}
        <span className={pageStyles.lead}>
          {new Date(post.createdAt).toLocaleString()}
        </span>
      </p>
      <p style={{ whiteSpace: "pre-wrap" }}>
        <ClubPostBody
          body={post.body}
          bodyFormat={post.bodyFormat ?? "plain"}
          segments={post.segments}
          mentions={post.mentions}
          autoHidden={post.autoHidden}
          autoHiddenReason={post.autoHiddenReason}
        />
      </p>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <Button type="button" onClick={() => void onReactionToggle()}>
          {viewerLiked ? t("unlike") : t("like")} ({likeCount})
        </Button>
        {post.canDelete && (
          <Button type="button" onClick={() => void onDelete()}>
            {t("deletePost")}
          </Button>
        )}
      </div>
    </li>
  );
}

export async function togglePostReaction(
  clubId: string,
  topicId: string,
  postId: string,
) {
  await api(`/clubs/${clubId}/topics/${topicId}/posts/${postId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ reaction: "like" }),
  });
}
