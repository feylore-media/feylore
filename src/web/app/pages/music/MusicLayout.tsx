import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import styles from "../../../components/music/music.module.css";

const SUBNAV = [
  { to: "/music", end: true, key: "home" },
  { to: "/music/albums", key: "albums" },
  { to: "/music/artists", key: "artists" },
  { to: "/music/genres", key: "genres" },
  { to: "/music/playlists", key: "playlists" },
] as const;

export function MusicLayout() {
  const { t } = useTranslation("music");

  return (
    <div className={styles.moduleShell}>
      <nav className={styles.moduleSidebar} aria-label={t("title")}>
        <div className={styles.moduleSidebarTitle}>{t("title")}</div>
        {SUBNAV.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={"end" in link ? link.end : false}
            className={({ isActive }) =>
              isActive ? styles.moduleSubnavActive : undefined
            }
          >
            {t(link.key)}
          </NavLink>
        ))}
      </nav>
      <div className={styles.moduleContent}>
        <Outlet />
      </div>
    </div>
  );
}
