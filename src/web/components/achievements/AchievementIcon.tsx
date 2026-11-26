import { ShelfIcon } from "../icons/ShelfIcon";

/**
 * Achievement emblem. Definition icons reuse the curated shared Solar
 * vocabulary; unknown or missing ids render a neutral accomplishment mark.
 * A dedicated badge catalog is intentionally deferred (see Achievements 1.0).
 */
export function AchievementIcon({
  icon,
  size = "md",
  className,
}: {
  icon: string | null | undefined;
  size?: "sm" | "md" | "lg" | number;
  className?: string;
}) {
  return (
    <ShelfIcon
      iconId={icon && icon.trim() ? icon : "diploma"}
      size={size}
      className={className}
    />
  );
}
