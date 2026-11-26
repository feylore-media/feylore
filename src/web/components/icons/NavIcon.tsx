import { Icon } from "./Icon";
import { NAV_ICONS, type NavIconName } from "./icon-registry";

export type { NavIconName };

export function NavIcon({
  name,
  active = false,
  className,
}: {
  name: NavIconName;
  active?: boolean;
  className?: string;
}) {
  const pair = NAV_ICONS[name];

  return (
    <Icon
      icon={active ? pair.identity : pair.outline}
      treatment={active ? "identity" : "default"}
      size="md"
      className={className}
    />
  );
}
