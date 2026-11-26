import { useTranslation } from "react-i18next";
import storageStyles from "../../../app/pages/admin/admin-storage.module.css";

export function ExternalStoragePlaceholder() {
  const { t } = useTranslation("admin");

  return (
    <div className={storageStyles.externalPlaceholder}>
      <p>{t("storageExternalEmpty")}</p>
      <p className={storageStyles.footnote}>{t("storageExternalFuture")}</p>
    </div>
  );
}
