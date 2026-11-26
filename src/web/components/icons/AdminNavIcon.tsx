import type { AdminNavIconName } from "@shared/admin-sections";
import { ADMIN_NAV_ICONS } from "./admin-nav-icons";

export function AdminNavIcon({
  name,
  className,
}: {
  name: AdminNavIconName;
  className?: string;
}) {
  const Icon = ADMIN_NAV_ICONS[name];
  return <Icon className={className} aria-hidden />;
}
