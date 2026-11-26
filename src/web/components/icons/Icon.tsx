import type { Icon as SolarIconComponent } from "@solar-icons/react/lib/types";
import styles from "./icon.module.css";

export type IconTreatment = "default" | "identity" | "identityActive";
export type IconSize = "sm" | "md" | "lg";

const SIZE_MAP: Record<IconSize, number> = {
  sm: 16,
  md: 18,
  lg: 20,
};

export interface IconProps {
  icon: SolarIconComponent;
  treatment?: IconTreatment;
  size?: IconSize | number;
  className?: string;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
}

export function Icon({
  icon: IconComponent,
  treatment = "default",
  size = "md",
  className,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
}: IconProps) {
  const isIdentity =
    treatment === "identity" || treatment === "identityActive";
  const sizeValue = typeof size === "number" ? size : SIZE_MAP[size];
  const classes = [
    styles.icon,
    isIdentity ? styles.iconIdentity : styles.iconDefault,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <IconComponent
      className={classes}
      size={sizeValue}
      isolated={!isIdentity}
      aria-hidden={ariaHidden ?? (ariaLabel ? undefined : true)}
      aria-label={ariaLabel}
    />
  );
}
