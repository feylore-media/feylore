import styles from "./primitives.module.css";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary";
}

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonProps) {
  const cls = variant === "primary" ? styles.buttonPrimary : styles.button;
  return <button className={`${cls} ${className}`} {...props} />;
}

export function TextField({
  label,
  id,
  ...props
}: {
  label: string;
  id: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input className={styles.input} id={id} {...props} />
    </div>
  );
}
