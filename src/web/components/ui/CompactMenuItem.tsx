import styles from "./compact-menu.module.css";

export function CompactMenuItem({
  children,
  onClick,
  disabled,
  member,
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  member?: boolean;
  danger?: boolean;
}) {
  const className = [
    styles.item,
    member ? styles.itemMember : "",
    danger ? styles.itemDanger : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      role="menuitem"
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
