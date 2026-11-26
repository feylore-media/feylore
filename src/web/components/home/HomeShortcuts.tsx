import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { HomeShortcut } from "@shared/home";
import styles from "./home.module.css";

interface HomeShortcutsProps {
  shortcuts: HomeShortcut[];
}

export function HomeShortcuts({ shortcuts }: HomeShortcutsProps) {
  const { t } = useTranslation("home");

  if (shortcuts.length === 0) return null;

  return (
    <section className={styles.shelfRow} aria-label={t("shortcuts")}>
      <h2 className={styles.shelfRowTitle}>{t("shortcuts")}</h2>
      <nav className={styles.shortcuts}>
        {shortcuts.map((shortcut) => (
          <Link
            key={shortcut.key}
            to={shortcut.href}
            className={styles.shortcutLink}
          >
            {t(`shortcut_${shortcut.key}`)}
          </Link>
        ))}
      </nav>
    </section>
  );
}
