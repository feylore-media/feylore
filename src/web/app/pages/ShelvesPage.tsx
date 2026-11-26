import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/primitives";
import { EmptyState } from "../../components/states";
import { useShelves } from "../../hooks/shelves/useShelves";
import { ShelvesList } from "../../components/shelves/ShelvesList";
import styles from "./pages.module.css";

export function ShelvesPage() {
  const { t } = useTranslation(["shelves", "empty"]);
  const { shelves, loading } = useShelves();

  if (loading) return null;

  if (shelves.length === 0) {
    return (
      <div className={styles.page}>
        <EmptyState titleKey="noShelves" detailKey="noShelvesDetail" />
        <Link to="/shelves/new">
          <Button variant="primary">{t("shelves:create")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1>{t("shelves:title")}</h1>
      <p>
        <Link to="/shelves/new">
          <Button>{t("shelves:create")}</Button>
        </Link>
      </p>
      <ShelvesList shelves={shelves} />
    </div>
  );
}
