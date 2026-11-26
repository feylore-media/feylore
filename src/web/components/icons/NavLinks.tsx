import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "./Icon";
import { UiBackIcon, UiForwardIcon } from "./ui-icons";
import styles from "./nav-links.module.css";

export function NavBackLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={styles.navLink}>
      <Icon icon={UiBackIcon} size="sm" aria-hidden />
      <span>{children}</span>
    </Link>
  );
}

export function NavForwardLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={styles.navLink}>
      <span>{children}</span>
      <Icon icon={UiForwardIcon} size="sm" aria-hidden />
    </Link>
  );
}
