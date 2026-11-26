import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ClubQuotePublic,
  ClubQuoteShareableAnnotation,
} from "@shared/clubs";
import { Button } from "../../../components/primitives";
import { UserIdentity } from "../../../components/users";
import { LoadingState } from "../../../components/states";
import { formatLocatorLabel } from "../../../components/work-detail/locatorPreview";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import { api } from "../../api";
import styles from "./clubs.module.css";
import pageStyles from "../../pages/pages.module.css";

export interface ClubQuotesDialogProps {
  clubId: string;
  isMember: boolean;
  open: boolean;
  composeOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onComposeOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function ClubQuotesDialog({
  clubId,
  isMember: _isMember,
  open,
  composeOpen,
  onOpenChange,
  onComposeOpenChange,
  onChanged,
}: ClubQuotesDialogProps) {
  const { t } = useTranslation("clubs");
  const [quotes, setQuotes] = useState<ClubQuotePublic[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!open) return;
    setLoading(true);
    void api<{ data: { quotes: ClubQuotePublic[] } }>(
      `/clubs/${clubId}/quotes/all`,
    )
      .then((res) => setQuotes(res.data.quotes))
      .finally(() => setLoading(false));
  }, [clubId, open]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("quotes")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {loading ? (
              <LoadingState />
            ) : quotes.length === 0 ? (
              <p className={pageStyles.lead}>{t("noQuotes")}</p>
            ) : (
              <ul className={styles.clubQuoteList}>
                {quotes.map((quote) => (
                  <li key={quote.id} className={styles.clubQuoteItem}>
                    <blockquote className={styles.clubQuoteText}>
                      {quote.text}
                    </blockquote>
                    <p className={styles.clubQuoteMeta}>
                      <UserIdentity
                        user={{
                          username: quote.authorUsername,
                          displayName: quote.authorDisplayName,
                          cosmetics: quote.authorCosmetics ?? null,
                        }}
                        variant="compact"
                      />{" "}
                      <span className={pageStyles.lead}>
                        {quote.locator
                          ? ` · ${formatLocatorLabel(quote.locator)}`
                          : ""}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ClubQuoteComposeDialog
        clubId={clubId}
        open={composeOpen}
        onOpenChange={onComposeOpenChange}
        onShared={() => {
          onChanged?.();
          load();
          onComposeOpenChange(false);
          onOpenChange(true);
        }}
      />
    </>
  );
}

function ClubQuoteComposeDialog({
  clubId,
  open,
  onOpenChange,
  onShared,
}: {
  clubId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShared: () => void;
}) {
  const { t } = useTranslation("clubs");
  const [annotations, setAnnotations] = useState<ClubQuoteShareableAnnotation[]>(
    [],
  );
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void api<{ data: { annotations: ClubQuoteShareableAnnotation[] } }>(
      `/clubs/${clubId}/quotes/shareable-annotations`,
    )
      .then((res) => setAnnotations(res.data.annotations))
      .finally(() => setLoading(false));
  }, [clubId, open]);

  async function shareFromAnnotation(annotationId: string) {
    setSubmitting(true);
    try {
      await api(`/clubs/${clubId}/quotes`, {
        method: "POST",
        body: JSON.stringify({ sourceAnnotationId: annotationId }),
      });
      onShared();
    } finally {
      setSubmitting(false);
    }
  }

  async function shareManual(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await api(`/clubs/${clubId}/quotes`, {
        method: "POST",
        body: JSON.stringify({ text: text.trim() }),
      });
      setText("");
      onShared();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("shareQuote")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form className={pageStyles.form} onSubmit={shareManual}>
            <label className={pageStyles.lead}>
              {t("quoteWriteNew")}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder={t("quoteWritePlaceholder")}
              />
            </label>
            <Button type="submit" variant="primary" disabled={submitting}>
              {t("shareQuote")}
            </Button>
          </form>

          <h3 className={styles.clubDialogSectionTitle}>{t("quoteFromMyJournal")}</h3>
          {loading ? (
            <LoadingState />
          ) : annotations.length === 0 ? (
            <p className={pageStyles.lead}>{t("quoteNoShareableAnnotations")}</p>
          ) : (
            <ul className={styles.clubQuoteList}>
              {annotations.map((annotation) => (
                <li key={annotation.id} className={styles.clubQuoteItem}>
                  <p className={styles.clubQuoteMeta}>
                    {formatLocatorLabel(annotation.locator)}
                  </p>
                  <blockquote className={styles.clubQuoteText}>
                    {annotation.previewText}
                  </blockquote>
                  <Button
                    type="button"
                    disabled={submitting || annotation.alreadyShared}
                    onClick={() => void shareFromAnnotation(annotation.id)}
                  >
                    {annotation.alreadyShared
                      ? t("quoteAlreadyShared")
                      : t("shareQuote")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
