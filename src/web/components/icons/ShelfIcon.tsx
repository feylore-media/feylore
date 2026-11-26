import {
  DEFAULT_SHELF_ICON_ID,
  normalizeShelfIconId,
  SHELF_ICON_IDS,
  type ShelfIconId,
} from "@shared/shelf-icons";
import { Icon } from "./Icon";
import { SHELF_ICON_COMPONENTS } from "./shelf-icon-registry";

export { SHELF_ICON_IDS, DEFAULT_SHELF_ICON_ID, type ShelfIconId };

interface ShelfIconProps {
  iconId: string;
  selected?: boolean;
  identity?: boolean;
  size?: "sm" | "md" | "lg" | number;
  className?: string;
  "aria-label"?: string;
}

export function ShelfIcon({
  iconId,
  selected = false,
  identity = false,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: ShelfIconProps) {
  const normalizedId = normalizeShelfIconId(iconId);
  const pair = SHELF_ICON_COMPONENTS[normalizedId];
  const useIdentity = identity || selected;

  return (
    <Icon
      icon={useIdentity ? pair.identity : pair.outline}
      treatment={useIdentity ? "identity" : "default"}
      size={size}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
