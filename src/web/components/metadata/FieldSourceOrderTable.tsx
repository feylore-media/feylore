import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatSourceOrderSummary } from "./formatSourceOrderSummary";
import { SourceOrderFieldEditor } from "./SourceOrderFieldEditor";
import styles from "./metadata-settings.module.css";

export interface FieldSourceOrderRow {
  fieldId: string;
  label: string;
  group: string;
  providerSourceOrder: string[];
  unorderedEligibleProviders: string[];
}

interface FieldSourceOrderTableProps {
  fields: FieldSourceOrderRow[];
  providerName: (key: string) => string;
  onChange: (fields: FieldSourceOrderRow[]) => void;
}

export function FieldSourceOrderTable({
  fields,
  providerName,
  onChange,
}: FieldSourceOrderTableProps) {
  const { t } = useTranslation("metadata");
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);

  function updateField(
    fieldId: string,
    updater: (field: FieldSourceOrderRow) => FieldSourceOrderRow,
  ) {
    onChange(fields.map((f) => (f.fieldId === fieldId ? updater(f) : f)));
  }

  function toggleExpand(fieldId: string) {
    setExpandedFieldId((prev) => (prev === fieldId ? null : fieldId));
  }

  return (
    <div className={styles.sourceOrderTableWrap}>
      <table className={styles.sourceOrderTable}>
        <colgroup>
          <col className={styles.colField} />
          <col className={styles.colGroup} />
          <col className={styles.colSourceOrder} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{t("tableField")}</th>
            <th scope="col">{t("tableGroup")}</th>
            <th scope="col">{t("tableSourceOrder")}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const isExpanded = expandedFieldId === field.fieldId;
            const summaryText =
              formatSourceOrderSummary(
                field.providerSourceOrder,
                providerName,
              ) || t("noSourcesConfigured");

            return (
              <Fragment key={field.fieldId}>
                <tr
                  className={
                    isExpanded
                      ? styles.sourceOrderRowExpanded
                      : styles.sourceOrderRow
                  }
                  tabIndex={0}
                  role="button"
                  aria-expanded={isExpanded}
                  aria-controls={`source-order-editor-${field.fieldId}`}
                  onClick={() => toggleExpand(field.fieldId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(field.fieldId);
                    }
                  }}
                >
                  <td>{field.label}</td>
                  <td>{field.group}</td>
                  <td className={styles.sourceOrderSummaryCell}>{summaryText}</td>
                </tr>
                {isExpanded && (
                  <tr id={`source-order-editor-${field.fieldId}`}>
                    <td colSpan={3}>
                      <SourceOrderFieldEditor
                        field={field}
                        providerName={providerName}
                        onChange={(updated) => updateField(field.fieldId, () => updated)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
