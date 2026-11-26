import { Icon } from "../../../components/icons/Icon";
import { UiForwardIcon } from "../../../components/icons/ui-icons";
import styles from "./admin.module.css";

export function AdminExpandChevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      className={expanded ? styles.chevronExpanded : styles.chevron}
      aria-hidden
    >
      <Icon icon={UiForwardIcon} size="sm" />
    </span>
  );
}
