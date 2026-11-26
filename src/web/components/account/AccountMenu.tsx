import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth, useAnyPermission } from "../../app/auth-context";
import { api } from "../../app/api";
import { ADMIN_AREA_PERMISSIONS } from "@shared/permissions";
import { useNotificationsPreview } from "../../hooks/useNotificationsPreview";
import { formatBadgeCount } from "./notification-display";
import { UserAvatar, UserHandle, UserLink } from "../users";
import { ProfileName } from "../profile/ProfileName";
import { Icon } from "../icons/Icon";
import {
  UiAdminIcon,
  UiClubsIcon,
  UiLogoutIcon,
  UiSettingsIcon,
} from "../icons/ui-icons";
import {
  CompactMenuAnchor,
  CompactMenuDivider,
  CompactMenuItem,
  CompactMenuPanel,
} from "../ui";
import { AccountNotificationPreview } from "./AccountNotificationPreview";
import styles from "./AccountMenu.module.css";

export function AccountMenu() {
  const { t } = useTranslation(["notifications", "common", "nav", "auth"]);
  const { user, profile, setUser } = useAuth();
  const canAdmin = useAnyPermission(ADMIN_AREA_PERMISSIONS);
  const {
    notifications,
    unreadCount,
    hasMore,
    loading,
    error,
    reload,
    markRead,
    markSeenDisplayed,
  } = useNotificationsPreview();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Opening the popover refreshes the preview and marks displayed items seen.
    void reload().then(() => markSeenDisplayed());
  }, [open, reload, markSeenDisplayed]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!user) return null;

  const displayName = profile?.displayName ?? user.displayName;
  const username = profile?.username ?? user.username;
  const avatarUrl = profile?.avatarUrl;
  const badgeLabel = formatBadgeCount(unreadCount);
  const triggerLabel =
    unreadCount > 0
      ? t("notifications:accountMenuUnread", { count: unreadCount })
      : t("notifications:accountMenu");

  async function logout() {
    setOpen(false);
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Session may already be invalid; still clear local state.
    }
    setUser(null);
    navigate("/login");
  }

  function navigateTo(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <CompactMenuAnchor ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={triggerLabel}
      >
        <UserAvatar
          displayName={displayName}
          username={username}
          avatarUrl={avatarUrl}
        />
        {badgeLabel !== null && (
          <span className={styles.badge} aria-hidden>
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <CompactMenuPanel ref={panelRef} className={styles.panel}>
          <div className={styles.identity}>
            <UserAvatar
              displayName={displayName}
              username={username}
              avatarUrl={avatarUrl}
              size="md"
            />
            <div className={styles.identityText}>
              <UserLink username={username}>
                <span className={styles.displayName}>
                  <ProfileName
                    user={{
                      username,
                      displayName,
                      cosmetics: profile?.cosmetics ?? null,
                    }}
                    size="sm"
                  />
                </span>{" "}
                <UserHandle username={username} />
              </UserLink>
            </div>
          </div>

          <AccountNotificationPreview
            notifications={notifications}
            hasMore={hasMore}
            loading={loading}
            error={error}
            onRetry={() => void reload()}
            onActivate={(notification) => {
              markRead(notification);
              if (notification.href) setOpen(false);
            }}
          />

          <div className={styles.nav}>
            <CompactMenuItem onClick={() => navigateTo("/settings")}>
              <span className={styles.menuRow}>
                <Icon icon={UiSettingsIcon} size="sm" aria-hidden />
                <span>{t("common:settings")}</span>
              </span>
            </CompactMenuItem>
            <CompactMenuItem onClick={() => navigateTo("/clubs")}>
              <span className={styles.menuRow}>
                <Icon icon={UiClubsIcon} size="sm" aria-hidden />
                <span>{t("nav:clubs")}</span>
              </span>
            </CompactMenuItem>
            {canAdmin && (
              <CompactMenuItem onClick={() => navigateTo("/admin")}>
                <span className={styles.menuRow}>
                  <Icon icon={UiAdminIcon} size="sm" aria-hidden />
                  <span>{t("common:administration")}</span>
                </span>
              </CompactMenuItem>
            )}
          </div>

          <CompactMenuDivider />
          <div className={styles.logout}>
            <CompactMenuItem danger onClick={() => void logout()}>
              <span className={styles.menuRow}>
                <Icon icon={UiLogoutIcon} size="sm" aria-hidden />
                <span>{t("auth:logout")}</span>
              </span>
            </CompactMenuItem>
          </div>
        </CompactMenuPanel>
      )}
    </CompactMenuAnchor>
  );
}
