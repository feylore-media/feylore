import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ShelfScopeId } from "@shared/shelf-scopes";
import { Button } from "../primitives";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { ShelfVisibilityIndicator } from "./ShelfVisibilityIndicator";
import { ShelfIcon } from "../icons/ShelfIcon";
import {
  ShelfEditorForm,
  type ShelfEditorValues,
} from "./ShelfEditorForm";

const FORM_ID = "shelf-editor-form";

interface ShelfEditorModalProps {
  isNew: boolean;
  initial: ShelfEditorValues;
  shelfId?: string;
  onSubmit: (values: ShelfEditorValues) => Promise<void>;
  onScopePreview?: (scope: ShelfScopeId) => Promise<number>;
  onCancel: () => void;
}

export function ShelfEditorModal({
  isNew,
  initial,
  shelfId,
  onSubmit,
  onScopePreview,
  onCancel,
}: ShelfEditorModalProps) {
  const { t } = useTranslation("shelves");
  const [icon, setIcon] = useState(initial.icon);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent size="wide" aria-label={isNew ? t("create") : t("editShelf")}>
        <DialogHeader icon={<ShelfIcon iconId={icon} identity />}>
          <DialogTitle>
            {isNew ? t("create") : t("editShelf")}
            {!isNew && visibility !== "private" && (
              <ShelfVisibilityIndicator visibility={visibility} />
            )}
          </DialogTitle>
          <DialogDescription>{t("editorSubtitle")}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <ShelfEditorForm
            formId={FORM_ID}
            initial={initial}
            shelfId={shelfId}
            onSubmit={onSubmit}
            onScopePreview={onScopePreview}
            onValuesChange={(values) => {
              setIcon(values.icon);
              setVisibility(values.visibility);
            }}
            onSavingChange={setSaving}
          />
        </DialogBody>

        <DialogFooter>
          <Button type="button" onClick={onCancel} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={saving}>
            {t("saveShelf")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
