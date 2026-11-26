import { useTranslation } from "react-i18next";
import type { ShelfVisibility } from "@shared/shelves";
import { Icon } from "../icons/Icon";
import {
  UiVisibilityCollaborativeIcon,
  UiVisibilitySharedIcon,
} from "../icons/ui-icons";
import styles from "./shelves.module.css";

interface ShelfVisibilityIndicatorProps {
  visibility: ShelfVisibility;
  canEdit?: boolean;
  isOwner?: boolean;
  compact?: boolean;
}

export function ShelfVisibilityIndicator({
  visibility,
  canEdit = false,
  isOwner = true,
  compact = false,
}: ShelfVisibilityIndicatorProps) {
  const { t } = useTranslation("shelves");

  if (visibility === "private") return null;

  const icon =
    visibility === "shared"
      ? UiVisibilitySharedIcon
      : UiVisibilityCollaborativeIcon;
  const label =
    visibility === "collaborative" && canEdit && !isOwner
      ? t("visibilityCollaborativeEditable")
      : visibility === "collaborative"
        ? t("visibilityCollaborative")
        : t("visibilityShared");

  return (
    <span
      className={compact ? styles.visibilityIconCompact : styles.visibilityIcon}
      title={label}
      aria-label={label}
    >
      <Icon icon={icon} size="sm" aria-hidden />
    </span>
  );
}
