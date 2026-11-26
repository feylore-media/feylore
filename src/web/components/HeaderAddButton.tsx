import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "./primitives";
import { Icon } from "./icons/Icon";
import { UiAddIcon } from "./icons/ui-icons";
import styles from "./HeaderAddButton.module.css";

export function HeaderAddButton() {
  const { t } = useTranslation("nav");
  const navigate = useNavigate();

  return (
    <Button
      type="button"
      className={styles.addButton}
      aria-label={t("add")}
      onClick={() => navigate("/add")}
    >
      <Icon icon={UiAddIcon} size="sm" className={styles.icon} />
    </Button>
  );
}
