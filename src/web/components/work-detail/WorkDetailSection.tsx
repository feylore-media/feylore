import styles from "./work-detail.module.css";

interface WorkDetailSectionProps {
  label?: string;
  title?: string;
  rule?: boolean;
  children: React.ReactNode;
}

export function WorkDetailSection({
  label,
  title,
  rule = false,
  children,
}: WorkDetailSectionProps) {
  return (
    <section className={styles.section}>
      {rule && <hr className={styles.sectionRule} />}
      {label && <p className={styles.sectionLabel}>{label}</p>}
      {title && <h2 className={styles.sectionTitle}>{title}</h2>}
      {children}
    </section>
  );
}
