import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "../primitives";
import styles from "./home.module.css";

export function HomeWelcome() {
  const { t } = useTranslation("home");

  return (
    <section className={styles.welcome}>
      <h1 className={styles.welcomeTitle}>{t("welcomeTitle")}</h1>
      <p className={styles.welcomeBody}>{t("welcomeBody")}</p>
      <div className={styles.welcomeActions}>
        <Link to="/books/import">
          <Button type="button" variant="primary">
            {t("importBooks")}
          </Button>
        </Link>
        <Link to="/search">
          <Button type="button">{t("browseSearch")}</Button>
        </Link>
      </div>
    </section>
  );
}
