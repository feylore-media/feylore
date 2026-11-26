import { useTranslation } from "react-i18next";
import type { CustomFieldDefinitionDto } from "@shared/custom-metadata-fields";
import { Button } from "../../primitives";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/Dialog";

export function CustomFieldDeleteDialog({
  field,
  onOpenChange,
  onConfirm,
}: {
  field: CustomFieldDefinitionDto | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <Dialog open={field !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("customFieldsDeleteTitle")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p>
            {t("customFieldsDeleteBody", {
              name: field?.displayName ?? "",
            })}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("formattingCancel")}
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm}>
            {t("formattingDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
