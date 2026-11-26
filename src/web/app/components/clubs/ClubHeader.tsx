import { Link } from "react-router";
import { userProfilePath } from "@shared/user-identity";
import { UiSettingsIcon } from "../../../components/icons/ui-icons";
import { Icon } from "../../../components/icons/Icon";
import { useTranslation } from "react-i18next";
import type { ClubPublic, ClubMember } from "@shared/clubs";
import { formatUserHandle } from "@shared/user-identity";
import { Button } from "../../../components/primitives";
import { UserAvatar } from "../../../components/users";
import { ClubAvatar } from "./ClubAvatar";
import { ClubContextBadge } from "./ClubContextBadge";
import styles from "./clubs.module.css";

export interface ClubHeaderProps {
  club: ClubPublic;
  members?: ClubMember[];
  onInvite?: () => void;
  canJoin: boolean;
  canAdmin: boolean;
  canEdit: boolean;
  isMember: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onOpenSettings?: () => void;
  onOpenMembers?: () => void;
}

function visibilityLabel(
  visibility: ClubPublic["visibility"],
  t: (key: string) => string,
): string {
  return visibility === "public"
    ? t("visibilityPublic")
    : t("visibilityPrivate");
}

export function ClubHeader({
  club,
  members = [],
  onInvite,
  canJoin,
  canAdmin,
  canEdit,
  isMember,
  onJoin,
  onLeave,
  onOpenSettings,
  onOpenMembers,
}: ClubHeaderProps) {
  const { t } = useTranslation("clubs");

  return (
    <header className={styles.clubHeader}>
      <div className={styles.clubHeaderMain}>
        <ClubAvatar name={club.name} coverFileId={club.coverFileId} />
        <div className={styles.clubHeaderBody}>
          <h1 className={styles.clubHeaderTitle}>{club.name}</h1>
          {club.description && (
            <p className={styles.clubHeaderDescription}>{club.description}</p>
          )}
          <p className={styles.clubHeaderMeta}>
            {onOpenMembers ? (
              <button
                type="button"
                className={styles.clubHeaderMetaLink}
                onClick={onOpenMembers}
              >
                {t("memberCount", { count: club.memberCount })}
              </button>
            ) : (
              <span>{t("memberCount", { count: club.memberCount })}</span>
            )}
            <span aria-hidden> · </span>
            <span>{visibilityLabel(club.visibility, t)}</span>
            <span aria-hidden> · </span>
            <ClubContextBadge context={club.context} />
            <span> {new Date(club.createdAt).toLocaleDateString()}</span>
          </p>
          <div className={styles.readMemberStrip}>
            {members.slice(0, 8).map((member) => (
              <Link
                key={member.userId}
                to={userProfilePath(member.username)}
                title={`${member.displayName} ${formatUserHandle(member.username)}`}
                aria-label={`${member.displayName} ${formatUserHandle(member.username)}`}
              >
                <UserAvatar
                  displayName={member.displayName}
                  username={member.username}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.clubHeaderActions}>
        {onInvite && <Button onClick={onInvite}>{t("invite")}</Button>}
        {canEdit && onOpenSettings && (
          <Button
            type="button"
            aria-label={t("settings")}
            onClick={onOpenSettings}
          >
            <Icon icon={UiSettingsIcon} size="lg" aria-hidden />
          </Button>
        )}
        {canJoin && (
          <Button type="button" variant="primary" onClick={onJoin}>
            {t("join")}
          </Button>
        )}
        {isMember && !canAdmin && (
          <Button type="button" onClick={onLeave}>
            {t("leave")}
          </Button>
        )}
      </div>
    </header>
  );
}

export function ClubDetailBackLink() {
  const { t } = useTranslation("clubs");
  return (
    <p className={styles.clubBackLink}>
      <Link to="/clubs">{t("backToClubs")}</Link>
    </p>
  );
}
