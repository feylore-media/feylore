import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  GENRE_MEDIA_TYPES,
  type GenreMediaType,
  type VocabularyTermDto,
} from "@shared/metadata-formatting";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/Dialog";
import { Button, TextField } from "../../primitives";
import fmtStyles from "./formatting.module.css";
import { flattenTerms } from "./VocabularyTree";

export type TermDialogMode = "create" | "edit" | "aliases";

export function VocabularyTermDialog({
  open,
  mode,
  kind,
  term,
  allTerms,
  parentId,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: TermDialogMode;
  kind: "genre" | "tag";
  term: VocabularyTermDto | null;
  allTerms: VocabularyTermDto[];
  parentId: string | null;
  onClose: () => void;
  onSave: (payload: {
    name?: string;
    parentId?: string | null;
    aliases?: string[];
    mediaTypes?: GenreMediaType[];
    enabled?: boolean;
    sortOrder?: number | null;
  }) => Promise<void>;
}) {
  const { t } = useTranslation("admin");
  const [name, setName] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<string | "">("");
  const [aliases, setAliases] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [mediaTypes, setMediaTypes] = useState<GenreMediaType[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [sortOrder, setSortOrder] = useState("");

  const flat = flattenTerms(allTerms);
  const parentOptions = flat.filter((item) => item.id !== term?.id);

  useEffect(() => {
    if (!open) return;
    setName(term?.name ?? "");
    setSelectedParentId(parentId ?? term?.parentId ?? "");
    setAliases(term?.aliases.length ? [...term.aliases] : [""]);
    setMediaTypes(term?.mediaTypes ?? []);
    setEnabled(term?.enabled ?? true);
    setSortOrder(term?.sortOrder?.toString() ?? "");
  }, [open, term, parentId]);

  async function handleSubmit() {
    setSaving(true);
    try {
      if (mode === "aliases") {
        await onSave({ aliases: aliases.map((a) => a.trim()).filter(Boolean) });
      } else {
        await onSave({
          name: name.trim(),
          parentId: selectedParentId || null,
          mediaTypes: kind === "genre" ? mediaTypes : [],
          enabled,
          sortOrder: sortOrder === "" ? null : Number(sortOrder),
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const title =
    mode === "create"
      ? t("formattingCreateTerm")
      : mode === "edit"
        ? t("formattingEditTerm")
        : t("formattingManageAliases");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-label={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {mode !== "aliases" && (
            <>
              <TextField
                id="formatting-term-name"
                label={t("formattingTermName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label htmlFor="formatting-parent">
                {t("formattingTermParent")}
                <select
                  id="formatting-parent"
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  style={{ display: "block", marginTop: "var(--space-2)", width: "100%" }}
                >
                  <option value="">{t("formattingNoParent")}</option>
                  {parentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              {kind === "genre" && (
                <fieldset className={fmtStyles.aliasList}>
                  <legend>{t("formattingAppliesTo")}</legend>
                  {GENRE_MEDIA_TYPES.map((mediaType) => (
                    <label key={mediaType}>
                      <input
                        type="checkbox"
                        checked={mediaTypes.includes(mediaType)}
                        onChange={(event) => setMediaTypes((current) =>
                          event.target.checked
                            ? [...current, mediaType]
                            : current.filter((value) => value !== mediaType))}
                      /> {t(`formattingMedia_${mediaType}`)}
                    </label>
                  ))}
                  <label>
                    <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                    {t("formattingEnabled")}
                  </label>
                  <TextField
                    id="formatting-sort-order"
                    label={t("formattingSortOrder")}
                    type="number"
                    value={sortOrder}
                    onChange={(event) => setSortOrder(event.target.value)}
                  />
                </fieldset>
              )}
            </>
          )}
          {mode === "aliases" && (
            <div className={fmtStyles.aliasList}>
              {aliases.map((alias, index) => (
                <TextField
                  key={index}
                  id={`formatting-alias-${index}`}
                  label={index === 0 ? t("formattingAliases") : ""}
                  value={alias}
                  onChange={(e) => {
                    const next = [...aliases];
                    next[index] = e.target.value;
                    setAliases(next);
                  }}
                />
              ))}
              <Button
                type="button"
                onClick={() => setAliases((prev) => [...prev, ""])}
              >
                {t("formattingAddAlias")}
              </Button>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("formattingCancel")}
          </Button>
          <Button type="button" disabled={saving} onClick={() => void handleSubmit()}>
            {t("formattingSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
