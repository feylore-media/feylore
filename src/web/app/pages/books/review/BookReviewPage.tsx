import { useEffect, useState, useRef, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "../../../api";
import { Button } from "../../../../components/primitives";
import {
  calculateSuggestedRating,
  ratingStep,
  type BookReview,
  type BookReviewDraftInput,
  type ExternalProviderInfo,
  type GenreRatingDefinition,
  type RatingDimension,
  type RatingSystemConfig,
  type TrajectoryPoint,
} from "../../../../../shared/ratings";
import styles from "../../pages.module.css";
import flow from "./review.module.css";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "../../../../components/ui/Dialog";
import { BookOverviewPage } from "../detail/BookOverviewPage";
import { bookPath } from "../../../../routes/paths";
import { usePermission } from "../../../auth-context";
import { PERMISSIONS } from "../../../../../shared/permissions";
import { RatingVisualization } from "../../../../components/ratings/RatingVisualization";

type ConfigResponse = { data: RatingSystemConfig };
type ReviewResponse = { data: { review: BookReview | null } };

interface RatingDimensionInputProps {
  value: number | null;
  max: number;
  allowHalfStars: boolean;
  onChange?: (value: number | null) => void;
  disabled?: boolean;
  label: string;
  description?: string | null;
  id: string;
  required?: boolean;
}

export function RatingDimensionInput({
  value,
  max,
  allowHalfStars,
  onChange,
  disabled = false,
  label,
  description,
  id,
  required = false,
}: RatingDimensionInputProps) {
  const { t } = useTranslation("books");
  const step = ratingStep(max === 10 ? 10 : 5, allowHalfStars);
  const descriptionId = description ? `${id}-description` : undefined;
  const percent = value == null ? 0 : ((value - 1) / (max - 1)) * 100;
  const railStyle = { "--rating-progress": `${percent}%` } as CSSProperties;
  return (
    <div className={flow.dimension} data-rating-dimension>
      <div className={flow.dimensionHeading}>
        <div>
          <label className={flow.dimensionName} htmlFor={id}>
            {label}
            {required ? " *" : ""}
          </label>
          {description && (
            <p className={flow.dimensionDescription} id={descriptionId}>
              {description}
            </p>
          )}
        </div>
        <output className={flow.dimensionValue} htmlFor={id}>
          {value == null ? "—" : value.toFixed(1)}
        </output>
      </div>
      <div className={flow.railRow}>
        <div className={flow.railWrap}>
          <input
            className={`${flow.ratingRail} ${value == null ? flow.ratingRailUnrated : ""}`}
            style={railStyle}
            type="range"
            id={id}
            min={1}
            max={max}
            step={step}
            value={value ?? 1}
            disabled={disabled}
            aria-describedby={descriptionId}
            aria-valuetext={
              value == null
                ? t("reviewUnrated")
                : t("reviewRatingValue", { value, max })
            }
            onKeyDown={(event) => {
              if (value != null) return;
              if (
                [
                  "ArrowLeft",
                  "ArrowDown",
                  "ArrowRight",
                  "ArrowUp",
                  "Home",
                ].includes(event.key)
              ) {
                event.preventDefault();
                onChange?.(1);
              } else if (event.key === "End") {
                event.preventDefault();
                onChange?.(max);
              }
            }}
            onChange={(event) => onChange?.(Number(event.currentTarget.value))}
          />
          <div className={flow.ratingStops} aria-hidden="true">
            {Array.from({ length: max }, (_, index) => (
              <span key={index}>
                <i />
                {index + 1}
              </span>
            ))}
          </div>
        </div>
        {value != null && (
          <button
            className={flow.clearRating}
            type="button"
            disabled={disabled}
            onClick={() => onChange?.(null)}
          >
            {t("clearRating")}
          </button>
        )}
      </div>
    </div>
  );
}

const emptyDraft: BookReviewDraftInput = {
  coreValues: {},
  genreValues: {},
  trajectory: [],
  recommendation: null,
  summary: null,
  review: null,
  finalRating: null,
};

export function BookReviewPage() {
  const { t } = useTranslation("books");
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const canWrite = usePermission(PERMISSIONS.BOOKS_WRITE);
  const [config, setConfig] = useState<RatingSystemConfig | null>(null);
  const [review, setReview] = useState<BookReview | null>(null);
  const [draft, setDraft] = useState<BookReviewDraftInput>(emptyDraft);
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const scale = config?.settings.scale ?? 5;
  const allowHalf = config?.settings.allowHalfStars ?? true;
  const suggestedRating = config
    ? calculateSuggestedRating({
        settings: config.settings,
        core: config.coreDimensions
          .filter((d) => d.enabled && d.contributesToRating)
          .map((d) => ({
            value: draft.coreValues?.[d.key] ?? 0,
            weight: d.weight,
          })),
        genreGroups: config.genreDefinitions
          .map((def) =>
            def.dimensions
              .filter((d) => d.enabled && d.contributesToRating)
              .map((d) => ({
                value: draft.genreValues?.[def.genreTermId]?.[d.key] ?? 0,
                weight: d.weight,
              })),
          )
          .filter((group) => group.some((d) => d.value > 0)),
        trajectory: (draft.trajectory ?? []).map((p) => ({
          value: p.rating,
          weight: 1,
        })),
      })
    : null;
  const steps = [
    "reviewStepCore",
    "reviewStepGenre",
    "reviewStepTrajectory",
    "reviewStepSuggested",
    "reviewStepReview",
  ];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api<ConfigResponse>(`/books/${slug}/review/config`),
      api<ReviewResponse>(`/books/${slug}/review`),
    ])
      .then(([configuration, response]) => {
        if (!active) return;
        const saved = response.data.review;
        setConfig(configuration.data);
        setReview(saved);
        setDraft(
          saved
            ? {
                coreValues: saved.coreValues,
                genreValues: saved.genreValues,
                trajectory: saved.trajectory,
                recommendation: saved.recommendation,
                summary: saved.summary,
                review: saved.review,
                finalRating: saved.finalRating,
              }
            : emptyDraft,
        );
        setDirty(false);
      })
      .catch(() => {
        if (active) setError(t("reviewLoadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, t, reloadKey]);

  useEffect(() => {
    if (!dirty && !busy) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, busy]);

  useEffect(() => {
    heading.current?.focus();
  }, [step, loading]);

  function change(patch: BookReviewDraftInput) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    setMessage(null);
  }

  // Serialize navigation and mutations. Inputs stay disabled until the current
  // snapshot is saved, so a delayed response cannot replace newer edits.
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(t("reviewSaveFailed"));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    void run(async () => {
      if (dirty && !window.confirm(t("reviewDiscardChanges"))) return;
      navigate(bookPath(slug!), { replace: true });
      requestAnimationFrame(() => {
        requestAnimationFrame(() =>
          document.getElementById("book-review-opener")?.focus(),
        );
      });
    });
  }

  function move(next: number) {
    void run(async () => {
      setStep(next);
    });
  }

  function finalize() {
    void run(async () => {
      const response = await api<ReviewResponse>(
        `/books/${slug}/review/finalize`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...draft,
            finalRating: draft.finalRating,
            recommendation: draft.recommendation ?? undefined,
            summary: null,
            review: draft.review,
          }),
        },
      );
      setReview(response.data.review);
      setDirty(false);
      setMessage(t("reviewSaved"));
    });
  }

  function remove() {
    void run(async () => {
      await api(`/books/${slug}/review`, { method: "DELETE" });
      setReview(null);
      setDraft(emptyDraft);
      setDirty(false);
      setStep(0);
      setMessage(t("reviewRemoved"));
    });
  }

  return (
    <>
      <BookOverviewPage />
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent aria-label={t("reviewTitle")}>
          <div className={flow.header}>
            <div>
              <DialogTitle>{t("reviewTitle")}</DialogTitle>
              <DialogDescription>
                {t("reviewStepCount", { current: step + 1, total: 5 })}
              </DialogDescription>
            </div>
            <Button
              disabled={busy}
              onClick={close}
              aria-label={t("reviewClose")}
            >
              <span aria-hidden="true">×</span>
            </Button>
          </div>
          <DialogBody>
            {error && <p role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
            {busy && <p role="status">{t("reviewSaving")}</p>}
            {loading ? (
              <p>{t("loading")}</p>
            ) : !config ? (
              <Button onClick={() => setReloadKey((key) => key + 1)}>
                {t("reviewRetry")}
              </Button>
            ) : (
              <>
                <h2 ref={heading} tabIndex={-1} className={flow.stepTitle}>
                  {t(steps[step]!)}
                </h2>
                {!canWrite && <p>{t("reviewReadOnly")}</p>}
                <fieldset disabled={busy || !canWrite} className={flow.fields}>
                  {step === 0 && (
                    <>
                      <p>{t("reviewCoreDescription")}</p>
                      <CoreRatingStep
                        dimensions={config.coreDimensions}
                        values={draft.coreValues ?? {}}
                        onChange={(key, value) => {
                          const coreValues = { ...draft.coreValues };
                          if (value == null) delete coreValues[key];
                          else coreValues[key] = value;
                          change({ coreValues });
                        }}
                        scale={scale}
                        allowHalfStars={allowHalf}
                      />
                    </>
                  )}
                  {step === 1 && (
                    <>
                      <p>{t("reviewGenreDescription")}</p>
                      <GenreRatingStep
                        definitions={config.genreDefinitions}
                        values={draft.genreValues ?? {}}
                        onChange={(term, key, value) => {
                          const termValues = { ...draft.genreValues?.[term] };
                          if (value == null) delete termValues[key];
                          else termValues[key] = value;
                          change({
                            genreValues: {
                              ...draft.genreValues,
                              [term]: termValues,
                            },
                          });
                        }}
                        scale={scale}
                        allowHalfStars={allowHalf}
                      />
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <p>{t("reviewTrajectoryDescription")}</p>
                      <TrajectoryStep
                        points={draft.trajectory ?? []}
                        onUpdate={(point) =>
                          change({
                            trajectory: [
                              ...(draft.trajectory ?? []).filter(
                                (p) => p.progress !== point.progress,
                              ),
                              point,
                            ].sort((a, b) => a.progress - b.progress),
                          })
                        }
                        onRemove={(progress) =>
                          change({
                            trajectory: draft.trajectory?.filter(
                              (p) => p.progress !== progress,
                            ),
                          })
                        }
                        scale={scale}
                        allowHalfStars={allowHalf}
                      />
                      <fieldset className={flow.recommendation}>
                        <legend>{t("reviewRecommendation")}</legend>
                        {(["yes", "no", null] as const).map((value) => (
                          <label key={String(value)}>
                            <input
                              type="radio"
                              name="recommendation"
                              checked={draft.recommendation === value}
                              onChange={() => change({ recommendation: value })}
                            />
                            {t(
                              value === "yes"
                                ? "reviewRecommendationYes"
                                : value === "no"
                                  ? "reviewRecommendationNo"
                                  : "reviewUnanswered",
                            )}
                          </label>
                        ))}
                      </fieldset>
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <p className={flow.visualizationLabel}>
                        {t("ratingVisualizationYourRating")}
                      </p>
                      <RatingVisualization
                        review={{
                          coreValues: draft.coreValues ?? {},
                          genreValues: draft.genreValues ?? {},
                          trajectory: draft.trajectory ?? [],
                        }}
                        coreDimensions={config.coreDimensions}
                        genreDefinitions={config.genreDefinitions}
                        scale={scale}
                        variant="full"
                      />
                      <p>{t("reviewSuggestedDisclaimer")}</p>
                      <p>
                        <strong>{t("reviewSuggestedRating")}: </strong>
                        {suggestedRating ?? t("reviewNoSuggestion")}
                      </p>
                      {suggestedRating != null && (
                        <Button
                          onClick={() =>
                            change({ finalRating: suggestedRating })
                          }
                        >
                          {t("reviewUseSuggestion")}
                        </Button>
                      )}
                      <div className={styles.formField}>
                        <label>{t("reviewFinalRating")}</label>
                        <RatingDimensionInput
                          id="final-rating"
                          value={draft.finalRating ?? null}
                          max={scale}
                          allowHalfStars={allowHalf}
                          onChange={(value) => change({ finalRating: value })}
                          label={t("reviewFinalRating")}
                        />
                      </div>
                    </>
                  )}
                  {step === 4 && (
                    <>
                      <p>
                        <strong>{t("reviewFinalRating")}: </strong>
                        {draft.finalRating ?? t("reviewUnanswered")}
                      </p>
                      <div className={styles.formField}>
                        <label htmlFor="review-body">{t("reviewBody")}</label>
                        <textarea
                          id="review-body"
                          rows={6}
                          maxLength={50000}
                          value={draft.review ?? ""}
                          placeholder={t("reviewBodyPlaceholder")}
                          onChange={(e) =>
                            change({ review: e.target.value || null })
                          }
                        />
                      </div>
                      <div className={flow.actions}>
                        <Button
                          variant="primary"
                          disabled={!draft.finalRating}
                          onClick={finalize}
                        >
                          {t("reviewSaveRating")}
                        </Button>
                        {review && (
                          <Button onClick={remove}>{t("reviewDelete")}</Button>
                        )}
                      </div>
                      <ExternalPostingStep
                        providers={config.externalProviders}
                        slug={slug!}
                        review={review}
                        disabled={dirty || busy}
                        onBusy={setBusy}
                        onSave={setReview}
                      />
                    </>
                  )}
                </fieldset>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button disabled={busy} onClick={close}>
              {t("reviewClose")}
            </Button>
            <Button
              disabled={busy || loading || !config || step === 0}
              onClick={() => move(step - 1)}
            >
              {t("reviewBack")}
            </Button>
            {step < 4 && (
              <Button
                variant="primary"
                disabled={busy || loading || !config}
                onClick={() => move(step + 1)}
              >
                {t("reviewNext")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CoreRatingStep({
  dimensions,
  values,
  onChange,
  scale,
  allowHalfStars,
}: {
  dimensions: RatingDimension[];
  values: Record<string, number>;
  onChange: (key: string, value: number | null) => void;
  scale: number;
  allowHalfStars: boolean;
}) {
  if (dimensions.length === 0) return null;
  return (
    <div className={flow.dimensionList}>
      {dimensions.map((dim) => (
        <RatingDimensionInput
          key={dim.key}
          id={`core-${dim.key}`}
          value={values[dim.key] ?? null}
          max={scale}
          allowHalfStars={allowHalfStars}
          onChange={(value) => onChange(dim.key, value)}
          label={dim.name}
          description={dim.description}
          required={dim.required}
        />
      ))}
    </div>
  );
}

function GenreRatingStep({
  definitions,
  values,
  onChange,
  scale,
  allowHalfStars,
}: {
  definitions: GenreRatingDefinition[];
  values: Record<string, Record<string, number>>;
  onChange: (
    termId: string,
    dimensionKey: string,
    value: number | null,
  ) => void;
  scale: number;
  allowHalfStars: boolean;
}) {
  const { t } = useTranslation("books");
  if (definitions.length === 0) {
    return <p>{t("reviewNoGenres")}</p>;
  }
  return (
    <div className={flow.genreList}>
      {definitions.map((def) => (
        <section key={def.genreTermId}>
          <h3 className={flow.genreTitle}>
            {def.selectedGenreName && def.selectedGenreName !== def.genreName
              ? `${def.genreName} › ${def.selectedGenreName}`
              : def.genreName}
            {def.inheritedFrom ? (
              <span
                style={{
                  marginLeft: "var(--space-2)",
                  color: "var(--color-text-muted)",
                  fontWeight: 400,
                }}
              >
                ({t("reviewGenreInheritedFrom", { genre: def.inheritedFrom })})
              </span>
            ) : null}
          </h3>
          <div className={flow.dimensionList}>
            {def.dimensions.map((dim) => (
              <RatingDimensionInput
                key={`${def.genreTermId}-${dim.key}`}
                id={`genre-${def.genreTermId}-${dim.key}`}
                value={values[def.genreTermId]?.[dim.key] ?? null}
                max={scale}
                allowHalfStars={allowHalfStars}
                onChange={(value) => onChange(def.genreTermId, dim.key, value)}
                label={dim.name}
                description={dim.description}
                required={dim.required}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TrajectoryStep({
  points,
  onUpdate,
  onRemove,
  scale,
  allowHalfStars,
}: {
  points: TrajectoryPoint[];
  onUpdate: (point: TrajectoryPoint) => void;
  onRemove: (progress: number) => void;
  scale: number;
  allowHalfStars: boolean;
}) {
  const { t } = useTranslation("books");
  const stops = [25, 50, 75, 100];
  const increment = allowHalfStars ? 0.5 : 1;
  const ratings = Array.from(
    { length: (scale - 1) / increment + 1 },
    (_, i) => scale - i * increment,
  );
  return (
    <div
      className={flow.trajectory}
      role="group"
      aria-label={t("reviewStepTrajectory")}
    >
      <div className={flow.axisLabels} aria-hidden="true">
        {ratings.map((rating) => (
          <span key={rating}>{Number.isInteger(rating) ? rating : ""}</span>
        ))}
      </div>
      {stops.map((progress) => (
        <div key={progress} className={flow.trajectoryColumn}>
          <div className={flow.trajectoryPoints}>
            {ratings.map((rating) => {
              const selected = points.some(
                (p) => p.progress === progress && p.rating === rating,
              );
              return (
                <button
                  type="button"
                  key={rating}
                  aria-pressed={selected}
                  aria-label={t("reviewTrajectoryPoint", { progress, rating })}
                  onClick={() =>
                    selected
                      ? onRemove(progress)
                      : onUpdate({ progress, rating })
                  }
                >
                  <span aria-hidden="true"></span>
                </button>
              );
            })}
          </div>
          <span className={flow.progressLabel}>{progress}%</span>
        </div>
      ))}
    </div>
  );
}

function ExternalPostingStep({
  providers,
  slug,
  review,
  disabled,
  onBusy,
  onSave,
}: {
  providers: ExternalProviderInfo[];
  slug: string;
  review: BookReview | null;
  disabled: boolean;
  onBusy: (value: boolean) => void;
  onSave: (value: BookReview) => void;
}) {
  const { t } = useTranslation("books");
  const [posting, setPosting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const postingLock = useRef(false);
  async function post(key: string) {
    if (postingLock.current || disabled) return;
    postingLock.current = true;
    setPosting(key);
    onBusy(true);
    setError(null);
    try {
      const response = await api<ReviewResponse>(
        `/books/${slug}/review/external/${encodeURIComponent(key)}`,
        { method: "POST" },
      );
      if (response.data.review) onSave(response.data.review);
    } catch {
      setError(t("reviewPostFailed"));
    } finally {
      postingLock.current = false;
      setPosting(null);
      onBusy(false);
    }
  }
  if (!providers.length) return null;
  return (
    <section className={flow.external}>
      <h3>{t("reviewExternalTitle")}</h3>
      <p>{t("reviewExternalHint")}</p>
      {error && <p role="alert">{error}</p>}
      {providers.map((provider) => {
        const status = review?.externalPosts[provider.key]?.status;
        return (
          <div key={provider.key}>
            <h4>{provider.label}</h4>
            <p role="status">
              {!provider.enabled
                ? t("reviewExternalNotConfigured", { provider: provider.label })
                : !provider.userAuthorized
                  ? t("reviewExternalUnauthorized", {
                      provider: provider.label,
                    })
                  : status === "posted"
                    ? t("reviewExternalPosted", { provider: provider.label })
                    : status === "failed"
                      ? t("reviewExternalFailed", { provider: provider.label })
                      : status === "previously_posted"
                        ? t("reviewExternalEdited")
                        : status === "unavailable"
                          ? t("reviewExternalUnavailable")
                          : null}
            </p>
            {provider.enabled && provider.userAuthorized && (
              <Button
                disabled={
                  disabled ||
                  posting !== null ||
                  review?.status !== "completed" ||
                  !review.finalRating ||
                  status === "posted" ||
                  status === "unavailable"
                }
                onClick={() => void post(provider.key)}
              >
                {posting === provider.key
                  ? t("reviewPosting")
                  : t("reviewPostExternal", { provider: provider.label })}
              </Button>
            )}
          </div>
        );
      })}
    </section>
  );
}
