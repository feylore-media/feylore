import styles from "./metadata-edit.module.css";

interface MetadataSourceActionBoxProps {
  visible?: boolean;
  locked?: boolean;
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}

export function MetadataSourceActionBox({
  visible = true,
  locked = false,
  label,
  onClick,
  children,
}: MetadataSourceActionBoxProps) {
  return (
    <button
      type="button"
      className={`${styles.actionBox} ${visible ? styles.actionBoxVisible : ""} ${locked ? styles.actionBoxLocked : ""}`}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
