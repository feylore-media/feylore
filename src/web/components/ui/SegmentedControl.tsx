import styles from "./segmented-control.module.css";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface SegmentedControlProps<T extends string> {
  name: string;
  value: T;
  options: SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  "aria-label"?: string;
}

export function SegmentedControl<T extends string>({
  name,
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={styles.group}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <label
            key={option.value}
            className={`${styles.segment} ${selected ? styles.segmentSelected : ""}`}
          >
            <input
              type="radio"
              className={styles.radio}
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.segmentContent}>
              <span className={styles.segmentLabel}>{option.label}</span>
              {option.description && (
                <span className={styles.segmentDescription}>
                  {option.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
