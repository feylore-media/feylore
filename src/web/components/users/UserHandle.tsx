import { Link } from "react-router";
import { formatUserHandle, userProfilePath } from "@shared/user-identity";
import identityStyles from "./users.module.css";

/** Renders `@username`. Presentation syntax only; never a substitute link. */
export function UserHandle({
  username,
  className,
}: {
  username: string;
  className?: string;
}) {
  return (
    <span
      className={[identityStyles.handle, className].filter(Boolean).join(" ")}
    >
      {formatUserHandle(username)}
    </span>
  );
}

/**
 * Canonical profile link. Always `/users/:username`; `/u/:username` is
 * compatibility-only and never rendered.
 */
export function UserLink({
  username,
  children,
  className,
  ariaLabel,
}: {
  username: string;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Link
      to={userProfilePath(username)}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </Link>
  );
}
