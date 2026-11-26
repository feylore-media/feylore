import { useTranslation } from "react-i18next";
import type { ClubMention } from "@shared/clubs";
import type {
  ClubPostBodyFormat,
  ClubPostBodySegment,
} from "@shared/club-spoiler";
import { renderBodyWithMentions } from "./renderMentions";
import { ClubSpoiler } from "./ClubSpoiler";

export function ClubPostBody({
  body,
  bodyFormat,
  segments,
  mentions,
  autoHidden,
  autoHiddenReason,
}: {
  body: string;
  bodyFormat: ClubPostBodyFormat;
  segments?: ClubPostBodySegment[];
  mentions: ClubMention[];
  autoHidden?: boolean;
  autoHiddenReason?: string | null;
}) {
  const { t } = useTranslation("clubs");

  let content: React.ReactNode;
  if (bodyFormat === "structured" && segments && segments.length > 0) {
    content = segments.map((segment, index) => {
      const rendered = renderBodyWithMentions(segment.text, mentions);
      if (segment.type === "spoiler") {
        return (
          <ClubSpoiler key={index} reason={t("spoilerHidden")}>
            {rendered}
          </ClubSpoiler>
        );
      }
      return <span key={index}>{rendered}</span>;
    });
  } else {
    content = renderBodyWithMentions(body, mentions);
  }

  if (autoHidden) {
    return (
      <ClubSpoiler
        reason={t("spoilerBeyondProgress", {
          label: autoHiddenReason ?? t("spoilerHidden"),
        })}
      >
        {content}
      </ClubSpoiler>
    );
  }

  return <>{content}</>;
}
