import { useTranslation } from "react-i18next";
import type { ShelfVisibility } from "@shared/shelves";
import { SegmentedControl } from "../ui/SegmentedControl";
import styles from "./shelf-editor.module.css";

interface ShelfVisibilityControlProps {
  value: ShelfVisibility;
  onChange: (visibility: ShelfVisibility) => void;
}

export function ShelfVisibilityControl({
  value,
  onChange,
}: ShelfVisibilityControlProps) {
  const { t } = useTranslation("shelves");

  const options = (
    ["private", "shared", "collaborative"] as const
  ).map((mode) => ({
    value: mode,
    label: t(`visibility_${mode}`),
    description: t(`visibility_${mode}_description`),
  }));

  return (
    <section className={styles.section} aria-labelledby="shelf-visibility-heading">
      <h3 id="shelf-visibility-heading" className={styles.sectionTitle}>
        {t("sectionVisibility")}
      </h3>
      <SegmentedControl
        name="shelfVisibility"
        value={value}
        options={options}
        onChange={onChange}
        aria-label={t("visibility")}
      />
    </section>
  );
}
