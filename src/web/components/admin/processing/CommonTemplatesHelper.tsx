import styles from "./admin-processing.module.css";

export function CommonTemplatesHelper({
  presets,
  onSelect,
  label = "Common templates",
}: {
  presets: string[];
  onSelect: (value: string) => void;
  label?: string;
}) {
  if (presets.length === 0) return null;
  return (
    <div className={styles.commonTemplates}>
      <span className={styles.commonTemplatesLabel}>{label}</span>
      <ul className={styles.commonTemplatesList}>
        {presets.map((preset) => (
          <li key={preset}>
            <button
              type="button"
              className={styles.commonTemplateButton}
              onClick={() => onSelect(preset)}
            >
              {preset}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
