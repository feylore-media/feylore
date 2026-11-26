import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import styles from "../../../components/audiobooks/audiobooks.module.css";

const SUBNAV = [
  { to: "/audiobooks", end: true, key: "home" },
  { to: "/audiobooks/podcasts", key: "podcasts" },
  { to: "/audiobooks/library", key: "library" },
  { to: "/audiobooks/continue", key: "continue" },
  { to: "/audiobooks/recent", key: "recent" },
  { to: "/audiobooks/favorites", key: "favorites" },
  { to: "/audiobooks/authors", key: "authors" },
  { to: "/audiobooks/narrators", key: "narrators" },
  { to: "/audiobooks/series", key: "series" },
] as const;

export function AudiobooksLayout() {
  const { t } = useTranslation("audiobooks");

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
