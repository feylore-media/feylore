import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ClubListItem } from "@shared/clubs";
import { formatRelativeTime } from "../../../components/account/notification-display";
import { Button } from "../../../components/primitives";
import { ClubAvatar } from "./ClubAvatar";
import { clubActivityLine, clubConsumptionLine } from "./club-list-display";
import styles from "./clubs.module.css";

export interface ClubListRowProps {
  club: ClubListItem;
  variant: "member" | "joinable";
  onJoin?: (clubId: string) => void;
  joining?: boolean;
}

export function ClubListRow({
  club,
  variant,
  onJoin,
  joining = false,
}: ClubListRowProps) {
  const { t } = useTranslation("clubs");
  const consumption = clubConsumptionLine(club, t);
  const activity = clubActivityLine(club, t, formatRelativeTime);

  return (
    <li className={styles.listItem}>
      <div className={styles.listRow}>
        <div className={styles.listRowMain}>
          <ClubAvatar
            name={club.name}
            coverFileId={club.coverFileId}
            showUnread={variant === "member" && club.hasUnreadActivity}
          />
          <div className={styles.listRowBody}>
            <Link to={`/clubs/${club.id}`} className={styles.clubName}>
              {club.name}
            </Link>
            {club.description && (
              <p className={styles.description}>{club.description}</p>
            )}
            {consumption && <p className={styles.consumption}>{consumption}</p>}
          </div>
        </div>

        <div className={styles.listRowMeta}>
          <p className={styles.metaLine}>
            {t("memberCount", { count: club.memberCount })}
          </p>
          <p className={styles.metaLine}>{activity}</p>
        </div>

        {variant === "joinable" && club.canJoin && onJoin && (
          <div className={styles.joinAction}>
            <Button
              type="button"
              variant="primary"
              disabled={joining}
              onClick={() => onJoin(club.id)}
            >
              {t("join")}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
