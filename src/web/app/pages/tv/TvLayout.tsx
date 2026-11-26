import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import styles from "../../../components/tv/tv.module.css";

const SUBNAV = [
  { to: "/tv", end: true, key: "home" },
  { to: "/tv/browse", key: "browse" },
  { to: "/tv/live", key: "live" },
] as const;

export function TvLayout() {
  const { t } = useTranslation("tv");

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
