import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import styles from "../../../components/movies/movies.module.css";

const SUBNAV = [
  { to: "/movies", end: true, key: "home" },
  { to: "/movies/browse", key: "browse" },
  { to: "/movies/genres", key: "genres" },
  { to: "/movies/collections", key: "collections" },
] as const;

export function MoviesLayout() {
  const { t } = useTranslation("movies");

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
