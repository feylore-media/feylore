import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import styles from "./admin-page.module.css";

export function AdminPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {description && <p className={styles.description}>{description}</p>}
      </header>
      {children}
    </div>
  );
}

export function AdminPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { t } = useTranslation("admin");
  return (
    <AdminPage title={title} description={description}>
      <div className={styles.placeholder}>
        <p className={styles.placeholderLabel}>{t("comingSoon")}</p>
        <p className={styles.placeholderDetail}>{t("comingSoonDetail")}</p>
      </div>
    </AdminPage>
  );
}
