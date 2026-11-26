import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, Link, useNavigate, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { usePermission } from "./auth-context";
import { PERMISSIONS } from "@shared/permissions";
import { SHELL_NAV_TO_MEDIA_MODULE } from "@shared/media-modules";
import type { MediaModuleId } from "@shared/media-modules";
import { api } from "./api";
import styles from "./shell.module.css";
import { HeaderAddButton } from "../components/HeaderAddButton";
import { AccountMenu } from "../components/account/AccountMenu";
import { Logo } from "../components/brand/Logo";
import { NavIcon, type NavIconName } from "../components/icons/NavIcon";
import { Icon } from "../components/icons/Icon";
import { UiSearchIcon } from "../components/icons/ui-icons";
import {
  PlaybackProvider,
  isPlayerVisible,
  usePlayback,
} from "../playback/context/PlaybackContext";
import { MiniPlayer } from "../playback/components/MiniPlayer";
import { FullPlayer } from "../playback/components/FullPlayer";
import { VideoPlayer } from "../playback/components/VideoPlayer";
import { AdminSearchInput } from "../components/admin/AdminSearchInput";

type NavItem = { to: string; key: string; icon: NavIconName };

const PRIMARY_NAV: NavItem[] = [
  { to: "/", key: "home", icon: "home" },
  { to: "/shelves", key: "shelves", icon: "shelves" },
  { to: "/universes", key: "universes", icon: "universes" },
];

const MEDIA_NAV: NavItem[] = [
  { to: "/books", key: "books", icon: "books" },
  { to: "/audiobooks", key: "audiobooks", icon: "audiobooks" },
  { to: "/music", key: "music", icon: "music" },
  { to: "/movies", key: "movies", icon: "movies" },
  { to: "/tv", key: "tv", icon: "tv" },
  { to: "/photos", key: "photos", icon: "photos" },
  { to: "/ttrpg", key: "ttrpg", icon: "ttrpg" },
];

const SECONDARY_NAV: NavItem[] = [
  { to: "/goals", key: "goals", icon: "stats" },
  { to: "/calendar", key: "calendar", icon: "calendar" },
  { to: "/clubs", key: "clubs", icon: "clubs" },
  { to: "/activity", key: "activity", icon: "activity" },
  { to: "/downloads", key: "downloads", icon: "downloads" },
  { to: "/stats", key: "stats", icon: "stats" },
];

function NavItems({
  items,
  collapsed,
}: {
  items: NavItem[];
  collapsed: boolean;
}) {
  const { t } = useTranslation("nav");
  return items.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        `${styles.navLink} ${isActive ? styles.navActive : ""}`
      }
      title={collapsed ? t(item.key) : undefined}
    >
      {({ isActive }) => (
        <>
          <span className={styles.navIcon} aria-hidden>
            <NavIcon name={item.icon} active={isActive} />
          </span>
          {!collapsed && <span className={styles.navLabel}>{t(item.key)}</span>}
        </>
      )}
    </NavLink>
  ));
}

function ShellMiniPlayer() {
  const { state } = usePlayback();
  if (!isPlayerVisible(state)) return null;
  return <MiniPlayer />;
}

export function AppShell() {
  const { t } = useTranslation(["nav", "common"]);
  const canReadModules = usePermission(PERMISSIONS.SYSTEM_SETTINGS_READ);
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [enabledModules, setEnabledModules] = useState<MediaModuleId[] | null>(
    null,
  );
  const navigate = useNavigate();
  const location = useLocation();
  const inCompactNav =
    location.pathname.startsWith("/books") ||
    location.pathname.startsWith("/settings") ||
    location.pathname.startsWith("/admin");

  useEffect(() => {
    if (inCompactNav) setCollapsed(true);
  }, [inCompactNav]);

  useEffect(() => {
    if (!canReadModules) {
      setEnabledModules(null);
      return;
    }
    void api<{ data: Array<{ id: MediaModuleId; enabled: boolean }> }>(
      "/admin/system/modules",
    )
      .then((res) =>
        setEnabledModules(res.data.filter((m) => m.enabled).map((m) => m.id)),
      )
      .catch(() => setEnabledModules(null));
  }, [canReadModules]);

  const visibleMediaNav = useMemo(() => {
    if (!enabledModules) return MEDIA_NAV;
    const enabled = new Set(enabledModules);
    return MEDIA_NAV.filter((item) => {
      const moduleId = SHELL_NAV_TO_MEDIA_MODULE[item.key];
      if (moduleId === null || moduleId === undefined) return true;
      return enabled.has(moduleId);
    });
  }, [enabledModules]);

  const inAdmin = location.pathname.startsWith("/admin");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  }

  return (
    <PlaybackProvider>
      <div className={`${styles.shell} ${collapsed ? styles.collapsed : ""}`}>
        <aside className={styles.sidebar} aria-label="Primary navigation">
          <div className={styles.sidebarHeader}>
            <button
              type="button"
              className={styles.sidebarToggle}
              onClick={() => setCollapsed((c) => !c)}
              aria-label="Toggle sidebar"
              aria-expanded={!collapsed}
            >
              {collapsed ? "»" : "«"}
            </button>
          </div>
          <nav className={styles.navGroup} aria-label="Primary">
            <NavItems items={PRIMARY_NAV} collapsed={collapsed} />
          </nav>
          <nav className={styles.navGroup} aria-label="Library">
            {!collapsed && <div className={styles.sectionLabel}>Library</div>}
            <NavItems items={visibleMediaNav} collapsed={collapsed} />
          </nav>
          <div className={styles.sidebarUtility}>
            <NavItems items={SECONDARY_NAV} collapsed={collapsed} />
          </div>
        </aside>

        <header className={styles.header}>
          <Link to="/" className={styles.brandLink} aria-label="Feylore home">
            <Logo size="xs" />
          </Link>
          {inAdmin ? (
            <div className={styles.adminSearch}>
              <AdminSearchInput />
            </div>
          ) : (
            <form className={styles.search} onSubmit={submitSearch} role="search">
              <div className={styles.searchField}>
                <Icon icon={UiSearchIcon} size="sm" />
                <input
                  className={styles.searchInput}
                  placeholder={t("common:search")}
                  aria-label={t("common:search")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </form>
          )}
          <div className={styles.headerActions}>
            <HeaderAddButton />
            <AccountMenu />
          </div>
        </header>

        <main className={styles.main} id="main-content">
          <Outlet />
        </main>

        <nav className={styles.mobileNav} aria-label="Mobile navigation">
          <Link to="/">{t("nav:home")}</Link>
          <Link to="/shelves">{t("nav:shelves")}</Link>
          <Link to="/search">{t("common:search")}</Link>
          <Link to="/downloads">{t("nav:downloads")}</Link>
          <Link to="/settings">{t("common:settings")}</Link>
        </nav>

        <ShellMiniPlayer />
        <FullPlayer />
        <VideoPlayer />
      </div>
    </PlaybackProvider>
  );
}
