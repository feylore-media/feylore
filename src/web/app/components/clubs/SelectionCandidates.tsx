import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { CandidateSnapshot } from "@shared/club-reads";
import type { ContentWarning } from "@shared/content-warnings";
import type {
  SelectionCandidateDetail,
  SelectionCandidateSummary,
  SelectionExperience,
} from "@shared/club-selection-experience";
import { api } from "../../api";
import { Button, TextField } from "../../../components/primitives";
import { BookCover } from "../../../components/books/BookCover";
import {
  ContentWarnings,
  ContentWarningPicker,
} from "../../../components/metadata/ContentWarnings";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import styles from "./clubs.module.css";

export function CandidateCollection({
  candidates,
  onOpen,
}: {
  candidates: SelectionCandidateSummary[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation("clubs");
  return (
    <div className={styles.selectionCandidates}>
      {candidates.map((candidate) => (
        <article key={candidate.id} className={styles.selectionCandidate}>
          <BookCover
            coverFileId={candidate.snapshot.coverFileId ?? null}
            title={candidate.snapshot.title}
            size="small"
          />
          <div>
            <h3>
              <button
                className={styles.selectionTitleButton}
                onClick={() => onOpen(candidate.id)}
              >
                {candidate.snapshot.title}
              </button>
            </h3>
            <p>{candidate.snapshot.authors.join(", ")}</p>
            {candidate.snapshot.series && (
              <p>
                {candidate.snapshot.series}
                {candidate.snapshot.seriesPosition !== undefined &&
                  ` ${candidate.snapshot.seriesPosition}`}
              </p>
            )}
            <p>
              {t(
                candidate.workSubjectId
                  ? "selectionInFeylore"
                  : "selectionExternal",
              )}
              {candidate.snapshot.pageCount &&
                ` | ${t("selectionPages", { count: candidate.snapshot.pageCount })}`}
              {candidate.snapshot.publicationDate &&
                ` | ${candidate.snapshot.publicationDate}`}
            </p>
            {candidate.snapshot.genres.length > 0 && (
              <p>{candidate.snapshot.genres.join(", ")}</p>
            )}
            {candidate.availableToRead && (
              <p>{t("selectionAvailableToRead")}</p>
            )}
            {!candidate.eligible && <p>{t("selectionIneligible")}</p>}
            {candidate.nominators.map((n, i) => (
              <div key={i}>
                <p>{t("selectionNominatedBy", { name: n.displayName })}</p>
                {n.reason && <blockquote>{n.reason}</blockquote>}
              </div>
            ))}
            {candidate.snapshot.hasContentWarnings && (
              <button onClick={() => onOpen(candidate.id)}>
                {t("selectionWarningsAvailable")}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
export function CandidateDialog({
  clubId,
  roundId,
  candidateId,
  onClose,
}: {
  clubId: string;
  roundId: string;
  candidateId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("clubs");
  const [candidate, setCandidate] = useState<SelectionCandidateDetail | null>(
      null,
    ),
    [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    void api<{ data: SelectionCandidateDetail }>(
      `/clubs/${clubId}/selection-rounds/${roundId}/candidates/${candidateId}`,
    )
      .then((r) => {
        if (live) setCandidate(r.data);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [clubId, roundId, candidateId]);
  const snapshot = candidate?.snapshot;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>
            {snapshot?.title ?? t("selectionCandidateDetails")}
          </DialogTitle>
          <DialogDescription>{t("selectionSnapshotNotice")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error && <p role="alert">{t("readLoadError")}</p>}
          {!candidate && !error && <p role="status">{t("readLoading")}</p>}
          {candidate && snapshot && (
            <>
              <BookCover
                coverFileId={snapshot.coverFileId ?? null}
                title={snapshot.title}
                size="small"
              />
              <p>{snapshot.authors.join(", ")}</p>
              {snapshot.subtitle && <p>{snapshot.subtitle}</p>}
              {snapshot.description && (
                <p className={styles.selectionDescription}>
                  {snapshot.description}
                </p>
              )}
              <dl className={styles.selectionMetadata}>
                {(
                  [
                    "series",
                    "seriesPosition",
                    "publicationDate",
                    "publisher",
                    "language",
                    "pageCount",
                    "isbn13",
                    "isbn10",
                  ] as const
                ).map(
                  (key) =>
                    snapshot[key] !== undefined && (
                      <div key={key}>
                        <dt>{t(`selectionField_${key}`)}</dt>
                        <dd>{snapshot[key]}</dd>
                      </div>
                    ),
                )}
              </dl>
              {snapshot.genres.length > 0 && (
                <p>{snapshot.genres.join(", ")}</p>
              )}
              <p>
                {t(
                  candidate.workSubjectId
                    ? "selectionInFeylore"
                    : "selectionExternalNotice",
                )}
              </p>
              {candidate.workHref && (
                <p>
                  <Link to={candidate.workHref}>{t("readViewWork")}</Link>
                </p>
              )}
              {candidate.readerHref && (
                <p>
                  <Link to={candidate.readerHref}>
                    {t("selectionAvailableToRead")}
                  </Link>
                </p>
              )}
              {candidate.nominators.map((n, i) => (
                <div key={i}>
                  <p>{t("selectionNominatedBy", { name: n.displayName })}</p>
                  {n.reason && <blockquote>{n.reason}</blockquote>}
                </div>
              ))}
              <ContentWarnings
                warnings={snapshot.contentWarnings}
                sources={candidate.warningSources}
              />
              {snapshot.provenance.length > 0 && (
                <p>
                  {t("selectionMetadataSource")}:{" "}
                  {snapshot.provenance
                    .map((p) => t(`selectionSource_${p.source}`))
                    .join(", ")}
                </p>
              )}
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function NominationDialog({
  clubId,
  round,
  onClose,
  onSaved,
}: {
  clubId: string;
  round: SelectionExperience;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("clubs");
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<
      {
        id: string;
        title: string;
        authors: string[];
        coverFileId: string | null;
      }[]
    >([]),
    [manual, setManual] = useState(false),
    [work, setWork] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [title, setTitle] = useState(""),
    [author, setAuthor] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({}),
    [warnings, setWarnings] = useState<ContentWarning["code"][]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [searched, setSearched] = useState(false);
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const r = await api<{ data: typeof results }>(
        `/clubs/${clubId}/selection-candidates/search?q=${encodeURIComponent(query)}`,
      );
      setResults(r.data);
      setSearched(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const snapshot: Partial<CandidateSnapshot> = {
        title,
        authors: [author],
        genres: (fields.genres ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        contentWarnings: warnings.map((code) => ({
          code,
          provenance: { source: "user" },
        })),
      };
      for (const key of [
        "description",
        "publicationDate",
        "publisher",
        "language",
        "series",
      ] as const)
        if (fields[key]) snapshot[key] = fields[key];
      if (fields.pageCount) snapshot.pageCount = Number(fields.pageCount);
      if (fields.seriesPosition)
        snapshot.seriesPosition = Number(fields.seriesPosition);
      if (fields.isbn) {
        const isbn = fields.isbn.replace(/[-\s]/g, "");
        if (isbn.length === 13) snapshot.isbn13 = isbn;
        else snapshot.isbn10 = isbn;
      }
      await api(`/clubs/${clubId}/selection-rounds/${round.id}/nominations`, {
        method: "POST",
        body: JSON.stringify({
          workSubjectId: manual ? undefined : work,
          snapshot: manual ? snapshot : undefined,
          reason,
        }),
      });
      onSaved();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>{t("selectionNominate")}</DialogTitle>
          <DialogDescription>
            {t("selectionRemaining", { count: round.remainingNominations })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {!manual && !work && (
            <>
              <form onSubmit={(e) => void search(e)}>
                <TextField
                  id="nomination-search"
                  label={t("selectionSearchLabel")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  required
                  minLength={2}
                  maxLength={200}
                />
                <Button type="submit" disabled={busy}>
                  {t("selectionSearch")}
                </Button>
              </form>
              <p>{t("selectionSearchSources")}</p>
              {searched && !results.length && <p>{t("selectionNoMatches")}</p>}
              {results.map((r) => (
                <div className={styles.selectionSearchResult} key={r.id}>
                  <BookCover
                    coverFileId={r.coverFileId}
                    title={r.title}
                    size="small"
                  />
                  <div>
                    <h3>{r.title}</h3>
                    <p>{r.authors.join(", ")}</p>
                    <p>{t("selectionInFeylore")}</p>
                    <Button
                      onClick={() => {
                        setWork(r.id);
                        setTitle(r.title);
                      }}
                    >
                      {t("selectionChooseCandidate")}
                    </Button>
                  </div>
                </div>
              ))}
              <Button onClick={() => setManual(true)}>
                {t("selectionAddManually")}
              </Button>
            </>
          )}
          {(manual || work) && (
            <form
              onSubmit={(e) => void submit(e)}
              className={styles.selectionForm}
            >
              {manual ? (
                <>
                  <p>{t("selectionExternalNotice")}</p>
                  <TextField
                    id="nomination-title"
                    label={t("selectionField_title")}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    maxLength={500}
                  />
                  <TextField
                    id="nomination-author"
                    label={t("selectionField_author")}
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    required
                    maxLength={300}
                  />
                  <details>
                    <summary>{t("selectionOptionalMetadata")}</summary>
                    {[
                      "isbn",
                      "description",
                      "publicationDate",
                      "publisher",
                      "language",
                      "pageCount",
                      "genres",
                      "series",
                      "seriesPosition",
                    ].map((key) => (
                      <TextField
                        key={key}
                        id={`nomination-${key}`}
                        label={t(`selectionField_${key}`)}
                        value={fields[key] ?? ""}
                        onChange={(e) =>
                          setFields({ ...fields, [key]: e.target.value })
                        }
                        type={
                          key === "pageCount" || key === "seriesPosition"
                            ? "number"
                            : "text"
                        }
                        min={
                          key === "pageCount"
                            ? 1
                            : key === "seriesPosition"
                              ? 0
                              : undefined
                        }
                        maxLength={key === "description" ? 20000 : 500}
                      />
                    ))}
                    <ContentWarningPicker
                      value={warnings}
                      onChange={setWarnings}
                    />
                  </details>
                </>
              ) : (
                <h3>{title}</h3>
              )}
              <label>
                {t("selectionReason")}
                <textarea
                  value={reason}
                  maxLength={5000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <Button disabled={busy || !round.canNominate} type="submit">
                {t("selectionNominate")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setManual(false);
                  setWork(null);
                }}
              >
                {t("selectionBack")}
              </Button>
            </form>
          )}
          {error && <p role="alert">{t("selectionMutationError")}</p>}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
