import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { BookIcon } from "@solar-icons/react/outline/book";
import { HeadphonesRoundIcon } from "@solar-icons/react/outline/headphones-round";
import { VideoFrameIcon } from "@solar-icons/react/outline/video-frame";
import { api } from "../../app/api";
import type { PresenceView } from "@shared/presence";
import { Icon } from "../icons/Icon";
import styles from "./profile.module.css";

function kindLabel(kind: PresenceView["kind"], t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (kind === "reading") return t("presenceReading", { defaultValue: "Reading" });
  if (kind === "listening") return t("presenceListening", { defaultValue: "Listening" });
  return t("presenceWatching", { defaultValue: "Watching" });
}

function kindIcon(kind: PresenceView["kind"]) {
  if (kind === "reading") return <Icon icon={BookIcon} size="sm" aria-hidden />;
  if (kind === "listening") return <Icon icon={HeadphonesRoundIcon} size="sm" aria-hidden />;
  return <Icon icon={VideoFrameIcon} size="sm" aria-hidden />;
}

function relativeTime(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return t("presenceSomeTimeAgo", { defaultValue: "recently" });
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return t("presenceNow", { defaultValue: "now" });
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return t("presenceMinutesAgo", { defaultValue: "{{count}}m ago", count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t("presenceHoursAgo", { defaultValue: "{{count}}h ago", count: hours });
  }
  const days = Math.floor(hours / 24);
  return t("presenceDaysAgo", { defaultValue: "{{count}}d ago", count: days });
}

/**
 * Compact presence line below the profile identity/bio area.
 * Discord-activity style, not a content card. Renders nothing when empty.
 */
export function PresenceLine({ username }: { username: string }) {
  const { t } = useTranslation("profile");
  const [presence, setPresence] = useState<PresenceView | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setPresence(undefined);
    void api<{ data: PresenceView | null }>(
      `/profiles/${encodeURIComponent(username)}/presence`,
    )
      .then((res) => {
        if (live) setPresence(res.data);
      })
      .catch(() => {
        if (live) setPresence(null);
      });
    return () => {
      live = false;
    };
  }, [username]);

  if (!presence) return null;

  const progress =
    typeof presence.metadata?.progressPercent === "number"
      ? `${presence.metadata.progressPercent}%`
      : null;
  const chapter =
    typeof presence.metadata?.chapterTitle === "string"
      ? presence.metadata.chapterTitle
      : null;
  const detail = [presence.subtitle ?? chapter, progress].filter(Boolean).join(" · ");
  const when =
    presence.liveness === "live"
      ? t("presenceNow", { defaultValue: "now" })
      : relativeTime(presence.lastEngagedAt, t as (key: string, opts?: Record<string, unknown>) => string);

  const title = presence.href ? (
    <Link to={presence.href} className={styles.presenceTitle}>
      {presence.title}
    </Link>
  ) : (
    <span className={styles.presenceTitle}>{presence.title}</span>
  );

  return (
    <p className={styles.presenceLine} aria-live="polite">
      <span className={styles.presenceIcon}>{kindIcon(presence.kind)}</span>
      {presence.coverUrl && (
        <img src={presence.coverUrl} alt="" aria-hidden className={styles.presenceCover} />
      )}
      <span className={styles.presenceBody}>
        <span className={styles.presenceKind}>
          {kindLabel(presence.kind, t as (key: string, opts?: Record<string, unknown>) => string)}
        </span>{" "}
        {title}
        {detail && <span className={styles.presenceDetail}> · {detail}</span>}
        <span className={styles.presenceWhen}> · {when}</span>
      </span>
    </p>
  );
}
