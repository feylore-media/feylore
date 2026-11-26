import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  GENRE_MEDIA_TYPES,
  type FormattingSuggestionDto,
  type VocabularyKind,
  type VocabularySearchMatchDto,
  type VocabularyTermDto,
  type GenreMediaType,
} from "@shared/metadata-formatting";
import { PERMISSIONS } from "@shared/permissions";
import { api } from "../../../app/api";
import { usePermission } from "../../../app/auth-context";
import { Button, TextField } from "../../primitives";
import styles from "../metadata-settings.module.css";
import fmtStyles from "./formatting.module.css";
import { VocabularyTree } from "./VocabularyTree";
import {
  TermDialogMode,
  VocabularyTermDialog,
} from "./VocabularyTermDialog";
import { SuggestionsPanel } from "./SuggestionsPanel";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/Dialog";

export function FormattingVocabularySection({
  kind,
  message,
  setMessage,
}: {
  kind: VocabularyKind;
  message: { type: "ok" | "err"; text: string } | null;
  setMessage: (msg: { type: "ok" | "err"; text: string } | null) => void;
}) {
  const { t } = useTranslation("admin");
  const canWrite = usePermission(PERMISSIONS.METADATA_FORMATTING_WRITE);
  const [terms, setTerms] = useState<VocabularyTermDto[] | null>(null);
  const [suggestions, setSuggestions] = useState<FormattingSuggestionDto[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<VocabularySearchMatchDto[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<TermDialogMode>("create");
  const [activeTerm, setActiveTerm] = useState<VocabularyTermDto | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [deleteTerm, setDeleteTerm] = useState<VocabularyTermDto | null>(null);
  const [mediaFilter, setMediaFilter] = useState<GenreMediaType | "all">("all");

  const load = useCallback(async () => {
    const [termsRes, suggestionsRes] = await Promise.all([
      api<{ data: VocabularyTermDto[] }>(
        `/metadata/formatting/terms?kind=${kind}${kind === "genre" && mediaFilter !== "all" ? `&mediaType=${mediaFilter}` : ""}`,
      ),
      api<{ data: FormattingSuggestionDto[] }>(
        `/metadata/formatting/suggestions?kind=${kind}&status=open`,
      ),
    ]);
    setTerms(termsRes.data);
    setSuggestions(suggestionsRes.data);
  }, [kind, mediaFilter]);

  useEffect(() => {
    void load().catch(() => setMessage({ type: "err", text: t("formattingLoadError") }));
  }, [load, setMessage, t]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api<{ data: VocabularySearchMatchDto[] }>(
        `/metadata/formatting/terms/search?kind=${kind}&q=${encodeURIComponent(searchQuery)}`,
      )
        .then((res) => setSearchMatches(res.data))
        .catch(() => setSearchMatches([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [kind, searchQuery]);

  const highlightIds = useMemo(() => {
    if (!searchMatches.length) return undefined;
    const ids = new Set<string>();
    for (const match of searchMatches) {
      ids.add(match.term.id);
      for (const ancestorId of match.ancestorIds) ids.add(ancestorId);
    }
    return ids;
  }, [searchMatches]);

  function openCreate(parent: VocabularyTermDto | null) {
    setDialogMode("create");
    setActiveTerm(null);
    setParentId(parent?.id ?? null);
    setDialogOpen(true);
  }

  function openEdit(term: VocabularyTermDto) {
    setDialogMode("edit");
    setActiveTerm(term);
    setParentId(term.parentId);
    setDialogOpen(true);
  }

  function openAliases(term: VocabularyTermDto) {
    setDialogMode("aliases");
    setActiveTerm(term);
    setDialogOpen(true);
  }

  async function handleSave(payload: {
    name?: string;
    parentId?: string | null;
    aliases?: string[];
    mediaTypes?: GenreMediaType[];
    enabled?: boolean;
    sortOrder?: number | null;
  }) {
    try {
      if (dialogMode === "create") {
        await api("/metadata/formatting/terms", {
          method: "POST",
          body: JSON.stringify({
            kind,
            name: payload.name,
            parentId: payload.parentId,
            mediaTypes: payload.mediaTypes,
            enabled: payload.enabled,
            sortOrder: payload.sortOrder,
          }),
        });
      } else if (dialogMode === "edit" && activeTerm) {
        await api(`/metadata/formatting/terms/${activeTerm.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: payload.name,
            parentId: payload.parentId,
            mediaTypes: payload.mediaTypes,
            enabled: payload.enabled,
            sortOrder: payload.sortOrder,
          }),
        });
      } else if (dialogMode === "aliases" && activeTerm) {
        await api(`/metadata/formatting/terms/${activeTerm.id}/aliases`, {
          method: "PUT",
          body: JSON.stringify({ aliases: payload.aliases ?? [] }),
        });
      }
      await load();
      setMessage({ type: "ok", text: t("formattingSaveSuccess") });
    } catch {
      setMessage({ type: "err", text: t("formattingSaveError") });
    }
  }

  async function confirmDelete() {
    if (!deleteTerm) return;
    try {
      await api(`/metadata/formatting/terms/${deleteTerm.id}`, { method: "DELETE" });
      setDeleteTerm(null);
      await load();
      setMessage({ type: "ok", text: t("formattingDeleteSuccess") });
    } catch {
      setMessage({ type: "err", text: t("formattingSaveError") });
    }
  }

  if (!terms) return <p>{t("formattingLoading")}</p>;

  return (
    <section className={fmtStyles.vocabularySection}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {kind === "genre" ? t("formattingGenresTitle") : t("formattingTagsTitle")}
        </h3>
        <p className={styles.sectionLead}>
          {kind === "genre"
            ? t("formattingGenresDescription")
            : t("formattingTagsDescription")}
        </p>
        {message && (
          <p
            className={
              message.type === "ok" ? fmtStyles.messageSuccess : fmtStyles.messageError
            }
            role="status"
          >
            {message.text}
          </p>
        )}
        <div className={fmtStyles.searchRow}>
          <TextField
            id="formatting-vocabulary-search"
            label={t("formattingSearch")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {kind === "genre" && (
            <label htmlFor="formatting-media-filter">
              {t("formattingMediaFilter")}
              <select id="formatting-media-filter" value={mediaFilter} onChange={(event) => setMediaFilter(event.target.value as GenreMediaType | "all")}>
                <option value="all">{t("formattingMediaAll")}</option>
                {GENRE_MEDIA_TYPES.map((mediaType) => (
                  <option key={mediaType} value={mediaType}>{t(`formattingMedia_${mediaType}`)}</option>
                ))}
              </select>
            </label>
          )}
          {canWrite && (
            <Button type="button" onClick={() => openCreate(null)}>
              {t("formattingAddRootTerm")}
            </Button>
          )}
        </div>
        <VocabularyTree
          terms={terms}
          canWrite={canWrite}
          highlightIds={highlightIds}
          onEdit={openEdit}
          onAddChild={(parent) => openCreate(parent)}
          onManageAliases={openAliases}
          onDelete={setDeleteTerm}
        />
      </div>
      <SuggestionsPanel
        kind={kind}
        suggestions={suggestions}
        canWrite={canWrite}
        onResolved={load}
      />
      <VocabularyTermDialog
        open={dialogOpen}
        mode={dialogMode}
        kind={kind}
        term={activeTerm}
        allTerms={terms}
        parentId={parentId}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />
      <Dialog open={!!deleteTerm} onOpenChange={(open) => !open && setDeleteTerm(null)}>
        <DialogContent aria-label={t("formattingDeleteConfirmTitle")}>
          <DialogHeader>
            <DialogTitle>{t("formattingDeleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p>{t("formattingDeleteConfirmBody", { name: deleteTerm?.name })}</p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setDeleteTerm(null)}>
              {t("formattingCancel")}
            </Button>
            <Button type="button" onClick={() => void confirmDelete()}>
              {t("formattingDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
