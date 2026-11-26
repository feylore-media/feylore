import { useTranslation } from "react-i18next";
import styles from "./states.module.css";

export function EmptyState({
  titleKey,
  detailKey,
  ns = "empty",
}: {
  titleKey: string;
  detailKey?: string;
  ns?: string;
}) {
  const { t } = useTranslation(ns);
  return (
    <div className={styles.empty}>
      <h2 className={styles.title}>{t(titleKey)}</h2>
      {detailKey && <p className={styles.detail}>{t(detailKey)}</p>}
    </div>
  );
}

export function LoadingState() {
  const { t } = useTranslation("common");
  return <div className={styles.empty}>{t("loading")}</div>;
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <div className={styles.empty} role="alert">
      <h2 className={styles.title}>{message ?? t("error")}</h2>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          {t("retry")}
        </button>
      )}
    </div>
  );
}

export function PlaceholderPage() {
  return <EmptyState titleKey="notAvailable" detailKey="notAvailableDetail" />;
}
