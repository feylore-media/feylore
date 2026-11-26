import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import styles from "../../../components/books/books.module.css";

const SUBNAV = [
  { to: "/books", end: true, key: "home" },
  { to: "/books/library", key: "library" },
  { to: "/books/continue", key: "continue" },
  { to: "/books/recent", key: "recent" },
  { to: "/books/favorites", key: "favorites" },
  { to: "/books/authors", key: "authors" },
  { to: "/books/series", key: "series" },
] as const;

export function BooksLayout() {
  const { t } = useTranslation("books");

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
