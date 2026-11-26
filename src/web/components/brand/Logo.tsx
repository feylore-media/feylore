import styles from "./logo.module.css";
import { DEFAULT_LOGO_SRC } from "./defaults";
import { useInstanceDisplayName, useInstanceLogoUrl } from "../../app/instance-context";

type LogoSize = "xs" | "sm" | "md" | "lg";

export function Logo({
  size = "md",
  className,
}: {
  size?: LogoSize;
  className?: string;
}) {
  const displayName = useInstanceDisplayName();
  const logoUrl = useInstanceLogoUrl();

  return (
    <img
      src={logoUrl ?? DEFAULT_LOGO_SRC}
      alt={displayName}
      className={`${styles.logo} ${styles[size]}${className ? ` ${className}` : ""}`}
    />
  );
}
