import { useTranslation } from "react-i18next";
import type { CustomFieldDefinitionDto } from "@shared/custom-metadata-fields";
import { Button } from "../../primitives";
import fmtStyles from "./formatting.module.css";

export function CustomFieldsTable({
  fields,
  canWrite,
  onEdit,
  onDelete,
  onReorder,
}: {
  fields: CustomFieldDefinitionDto[];
  canWrite: boolean;
  onEdit: (field: CustomFieldDefinitionDto) => void;
  onDelete: (field: CustomFieldDefinitionDto) => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  const { t } = useTranslation("admin");

  if (fields.length === 0) {
    return <p className={fmtStyles.emptyState}>{t("customFieldsEmpty")}</p>;
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...fields];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    onReorder(next.map((f) => f.id));
  }

  return (
    <div className={fmtStyles.customFieldsTableWrap}>
      <table className={fmtStyles.customFieldsTable}>
        <thead>
          <tr>
            <th scope="col">{t("customFieldsColField")}</th>
            <th scope="col">{t("customFieldsColKey")}</th>
            <th scope="col">{t("customFieldsColType")}</th>
            <th scope="col">{t("customFieldsColOrder")}</th>
            {canWrite && <th scope="col">{t("customFieldsColActions")}</th>}
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => (
            <tr key={field.id}>
              <td>{field.displayName}</td>
              <td>
                <code>{field.key}</code>
              </td>
              <td>{field.type}</td>
              <td>{field.sortOrder + 1}</td>
              {canWrite && (
                <td>
                  <div className={fmtStyles.customFieldsActions}>
                    <button
                      type="button"
                      className={fmtStyles.actionButton}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={t("customFieldsMoveUp")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={fmtStyles.actionButton}
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={t("customFieldsMoveDown")}
                    >
                      ↓
                    </button>
                    <Button type="button" onClick={() => onEdit(field)}>
                      {t("formattingEdit")}
                    </Button>
                    <Button type="button" onClick={() => onDelete(field)}>
                      {t("formattingDelete")}
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
