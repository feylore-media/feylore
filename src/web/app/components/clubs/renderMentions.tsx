import type { ClubMention } from "@shared/clubs";
import { Link } from "react-router";
import { USERNAME_MENTION_SPLIT_PATTERN } from "@shared/username";
import { userProfilePath } from "../../../routes/paths";

export function renderBodyWithMentions(
  body: string,
  mentions: ClubMention[],
): React.ReactNode {
  if (!body) return null;
  const mentionSet = new Set(mentions.map((m) => m.username.toLowerCase()));
  const parts = body.split(USERNAME_MENTION_SPLIT_PATTERN);
  return parts.map((part, index) => {
    if (part.startsWith("@")) {
      const username = part.slice(1);
      if (mentionSet.has(username.toLowerCase())) {
        return (
          <Link
            key={index}
            to={userProfilePath(username.toLowerCase())}
            style={{ color: "var(--color-accent)", fontWeight: 600 }}
          >
            {part}
          </Link>
        );
      }
    }
    return <span key={index}>{part}</span>;
  });
}
