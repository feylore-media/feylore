import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { AdminPage } from "./AdminPage";
import pageStyles from "../pages.module.css";
import adminStyles from "./admin.module.css";
import {
  type ExternalProviderInfo,
  type GenreRatingDefinition,
  type RatingDimension,
  type RatingSystemSettings,
} from "@shared/ratings";
import { Button, TextField } from "../../../components/primitives";
import type { VocabularyTermDto } from "@shared/metadata-formatting";

interface AdminConfigResponse {
  data: {
    settings: RatingSystemSettings;
    coreDimensions: RatingDimension[];
    genreDefinitions: GenreRatingDefinition[];
    genreTerms: VocabularyTermDto[];
    externalProviders: ExternalProviderInfo[];
  };
}

function DimensionEditor({
  initial,
  scope,
  genreTermId,
  onSave,
  onCancel,
}: {
  initial: RatingDimension | null;
  scope: "core" | "genre";
  genreTermId?: string;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const [key, setKey] = useState(initial?.key ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [weight, setWeight] = useState(initial?.weight ?? 1);
  const [required, setRequired] = useState(initial?.required ?? false);
  const [contributes, setContributes] = useState(
    initial?.contributesToRating ?? true,
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [displayOrder, setDisplayOrder] = useState(initial?.displayOrder ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        id: initial?.id,
        key,
        name,
        description: description || null,
        weight: Number(weight),
        required,
        contributesToRating: contributes,
        enabled,
        displayOrder: Number(displayOrder),
      };
      if (scope === "genre" && genreTermId) {
        payload.genreTermId = genreTermId;
      }
      await onSave(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      {error && <p role="alert">{error}</p>}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        <TextField
          label={t("ratingsDimensionKey")}
          id={`dim-key-${scope}-${key || genreTermId || "new"}`}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <TextField
          label={t("ratingsDimensionName")}
          id={`dim-name-${scope}-${name || genreTermId || "new"}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className={pageStyles.formField}>
        <label htmlFor={`dim-desc-${key}`}>{t("ratingsDimensionDescription")}</label>
        <textarea
          id={`dim-desc-${key}`}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={undefined}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--space-3)",
          marginTop: "var(--space-3)",
        }}
      >
        <TextField
          label={t("ratingsDimensionWeight")}
          id={`dim-weight-${key}`}
          type="number"
          min={0}
          step={0.25}
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
        />
        <TextField
          label={t("ratingsDimensionOrder")}
          id={`dim-order-${key}`}
          type="number"
          value={displayOrder}
          onChange={(e) => setDisplayOrder(Number(e.target.value))}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", justifyContent: "flex-end" }}>
          <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            {t("ratingsDimensionRequired")}
          </label>
          <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={contributes}
              onChange={(e) => setContributes(e.target.checked)}
            />
            {t("ratingsDimensionContributes")}
          </label>
          <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {t("ratingsDimensionEnabled")}
          </label>
        </div>
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        <Button variant="primary" disabled={busy || !key || !name} onClick={() => void submit()}>
          {busy ? "…" : t("ratingsSave")}
        </Button>
        <Button onClick={onCancel}>{t("cancel")}</Button>
      </div>
    </div>
  );
}

function SettingsEditor({
  settings,
  providers,
  onSave,
  onSaved,
}: {
  settings: RatingSystemSettings;
  providers: ExternalProviderInfo[];
  onSave: (patch: Partial<RatingSystemSettings>) => Promise<void>;
  onSaved: () => void;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerKeys = providers.map((p) => p.key);
  const editing = providerKeys.includes((draft.externalPosting?.providers?.[0] ?? { key: "" }).key)
    ? draft.externalPosting.providers
    : providers.map((p) => ({
        key: p.key,
        enabled: draft.externalPosting?.providers?.find((x) => x.key === p.key)?.enabled ?? false,
        label: p.label,
        description: p.description ?? "",
      }));

  function setProviderEnabled(key: string, enabled: boolean) {
    setDraft((d) => ({
      ...d,
      externalPosting: {
        providers: editing.map((p) => (p.key === key ? { ...p, enabled } : p)),
      },
    }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "var(--space-3)" }}>
        <div className={pageStyles.formField}>
          <label htmlFor="rating-mode">{t("ratingsMode")}</label>
          <select
            id="rating-mode"
            value={draft.mode}
            onChange={(e) => setDraft({ ...draft, mode: e.target.value as RatingSystemSettings["mode"] })}
          >
            <option value="advanced">{t("ratingsModeAdvanced")}</option>
            <option value="simple">{t("ratingsModeSimple")}</option>
          </select>
        </div>
        <div className={pageStyles.formField}>
          <label htmlFor="rating-scale">{t("ratingsScale")}</label>
          <select
            id="rating-scale"
            value={draft.scale}
            onChange={(e) => setDraft({ ...draft, scale: Number(e.target.value) as 5 | 10 })}
          >
            <option value={5}>★ 1–5</option>
            <option value={10}>★ 1–10</option>
          </select>
        </div>
      </div>

      <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: "var(--space-3)" }}>
        <input
          type="checkbox"
          checked={draft.allowHalfStars}
          onChange={(e) => setDraft({ ...draft, allowHalfStars: e.target.checked })}
        />
        {t("ratingsAllowHalfStars")}
      </label>

      <h4 style={{ margin: "var(--space-5) 0 var(--space-2)" }}>{t("ratingsCalculationTitle")}</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "var(--space-3)" }}>
        {(["useCore", "useGenre", "useTrajectory"] as const).map((flag) => (
          <label key={flag} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.calculation[flag]}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  calculation: { ...draft.calculation, [flag]: e.target.checked },
                })
              }
            />
            {t(`ratings${flag[0].toUpperCase()}${flag.slice(1)}`)}
          </label>
        ))}
        <div className={pageStyles.formField}>
          <label htmlFor="calc-core-weight">{t("ratingsCoreWeight")}</label>
          <input
            id="calc-core-weight"
            type="number"
            min={0}
            step={0.25}
            value={draft.calculation.coreWeight}
            onChange={(e) =>
              setDraft({
                ...draft,
                calculation: { ...draft.calculation, coreWeight: Number(e.target.value) },
              })
            }
          />
        </div>
        <div className={pageStyles.formField}>
          <label htmlFor="calc-genre-weight">{t("ratingsGenreWeight")}</label>
          <input
            id="calc-genre-weight"
            type="number"
            min={0}
            step={0.25}
            value={draft.calculation.genreWeight}
            onChange={(e) =>
              setDraft({
                ...draft,
                calculation: { ...draft.calculation, genreWeight: Number(e.target.value) },
              })
            }
          />
        </div>
        <div className={pageStyles.formField}>
          <label htmlFor="calc-traj-weight">{t("ratingsTrajectoryWeight")}</label>
          <input
            id="calc-traj-weight"
            type="number"
            min={0}
            step={0.25}
            value={draft.calculation.trajectoryWeight}
            onChange={(e) =>
              setDraft({
                ...draft,
                calculation: { ...draft.calculation, trajectoryWeight: Number(e.target.value) },
              })
            }
          />
        </div>
        <div className={pageStyles.formField}>
          <label htmlFor="calc-missing">{t("ratingsMissingMode")}</label>
          <select
            id="calc-missing"
            value={draft.calculation.missingValueMode}
            onChange={(e) =>
              setDraft({
                ...draft,
                calculation: {
                  ...draft.calculation,
                  missingValueMode: e.target.value as "ignore" | "neutral",
                },
              })
            }
          >
            <option value="ignore">{t("ratingsMissingIgnore")}</option>
            <option value="neutral">{t("ratingsMissingNeutral")}</option>
          </select>
        </div>
        <div className={pageStyles.formField}>
          <label htmlFor="calc-rounding">{t("ratingsRounding")}</label>
          <select
            id="calc-rounding"
            value={draft.calculation.rounding}
            onChange={(e) =>
              setDraft({
                ...draft,
                calculation: {
                  ...draft.calculation,
                  rounding: e.target.value as "nearest" | "floor" | "ceil" | "none",
                },
              })
            }
          >
            <option value="nearest">{t("ratingsRoundingNearest")}</option>
            <option value="floor">{t("ratingsRoundingFloor")}</option>
            <option value="ceil">{t("ratingsRoundingCeil")}</option>
            <option value="none">{t("ratingsRoundingNone")}</option>
          </select>
        </div>
      </div>

      <h4 style={{ margin: "var(--space-5) 0 var(--space-2)" }}>{t("ratingsExternalProvidersTitle")}</h4>
      {providers.length === 0 ? (
        <p style={{ color: "var(--color-ink-muted)" }}>—</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {providers.map((provider) => (
            <label
              key={provider.key}
              style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={editing.find((p) => p.key === provider.key)?.enabled ?? false}
                onChange={(e) => setProviderEnabled(provider.key, e.target.checked)}
              />
              <span>{provider.label}</span>
              <span style={{ color: "var(--color-ink-muted)", fontSize: "0.875rem" }}>
                {provider.description}
              </span>
            </label>
          ))}
        </div>
      )}

      <div style={{ marginTop: "var(--space-5)" }}>
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          {busy ? "…" : t("ratingsSave")}
        </Button>
      </div>
    </div>
  );
}

export function AdminRatingsPage() {
  const { t } = useTranslation(["admin", "common"]);
  const [config, setConfig] = useState<AdminConfigResponse["data"] | null>(null);
  const [editingCore, setEditingCore] = useState<RatingDimension | null | "new">(null);
  const [editingGenre, setEditingGenre] = useState<{
    termId: string;
    dimension: RatingDimension | null;
  } | null>(null);
  const [genresOpen, setGenresOpen] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [genreSearch, setGenreSearch] = useState("");
  const [showAllGenres, setShowAllGenres] = useState(false);

  const loadConfig = useCallback(async () => {
    const res = await api<AdminConfigResponse>("/admin/ratings/config");
    setConfig(res.data);
  }, []);
  useEffect(() => {
    void loadConfig();
  }, [loadConfig, refreshKey]);

  async function saveSettings(patch: Partial<RatingSystemSettings>) {
    await api<{ data: { settings: RatingSystemSettings } }>("/admin/ratings/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  async function saveCoreDimension(payload: Record<string, unknown>) {
    await api("/admin/ratings/dimensions/core", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    setEditingCore(null);
    setRefreshKey((k) => k + 1);
  }

  async function saveGenreDimension(payload: Record<string, unknown>) {
    await api("/admin/ratings/dimensions/genre", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    setEditingGenre(null);
    setRefreshKey((k) => k + 1);
  }

  async function deleteDimension(id: string) {
    await api(`/admin/ratings/dimensions/${id}`, { method: "DELETE" });
    setRefreshKey((k) => k + 1);
  }

  async function toggleGenre(termId: string, enabled: boolean, displayOrder: number) {
    await api(`/admin/ratings/genres/${termId}`, {
      method: "PUT",
      body: JSON.stringify({ genreTermId: termId, enabled, displayOrder }),
    });
    setRefreshKey((k) => k + 1);
  }

  if (!config) return <LoadingPlaceholder />;

  const definitionsByTerm = new Map(
    config.genreDefinitions
      .filter((definition) => definition.mediaType === "books")
      .map((definition) => [definition.genreTermId, definition]),
  );
  const flatGenreTerms = flattenGenreTerms(config.genreTerms);
  const termById = new Map(flatGenreTerms.map(({ term }) => [term.id, term]));
  const genreRows = flatGenreTerms.filter(({ term }) => {
    if (!term.enabled) return false;
    if (genreSearch && !term.name.toLowerCase().includes(genreSearch.toLowerCase())) return false;
    if (showAllGenres || definitionsByTerm.has(term.id)) return true;
    let parentId = term.parentId;
    while (parentId) {
      if (definitionsByTerm.has(parentId)) return true;
      parentId = termById.get(parentId)?.parentId ?? null;
    }
    return false;
  });

  return (
    <AdminPage title={t("ratingsTitle")} description={t("ratingsDescription")}>
      <section className={pageStyles.settingsSection}>
        <h3>{t("ratingsMode")}</h3>
        <SettingsEditor
          key={refreshKey}
          settings={config.settings}
          providers={config.externalProviders}
          onSave={saveSettings}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      </section>

      <section className={pageStyles.settingsSection}>
        <h3>{t("ratingsCoreDimensionsTitle")}</h3>
        <p style={{ color: "var(--color-ink-muted)", fontSize: "0.9375rem", margin: "0 0 var(--space-3)" }}>
          {t("ratingsCoreDimensionsDescription")}
        </p>
        <DimensionList
          dimensions={config.coreDimensions.filter((d) => d.scope === "core")}
          onAdd={() => setEditingCore("new")}
          onEdit={(dim) => setEditingCore(dim)}
          onDelete={(dim) => void deleteDimension(dim.id)}
          onNewOpen={editingCore === "new"}
        />
        {editingCore && (
          <DimensionEditor
            initial={editingCore === "new" ? null : editingCore}
            scope="core"
            onSave={saveCoreDimension}
            onCancel={() => setEditingCore(null)}
          />
        )}
      </section>

      <section className={pageStyles.settingsSection}>
        <h3>{t("ratingsGenreDimensionsTitle")}</h3>
        <p style={{ color: "var(--color-ink-muted)", fontSize: "0.9375rem", margin: "0 0 var(--space-3)" }}>
          {t("ratingsGenreDimensionsDescription")}
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "end", marginBottom: "var(--space-3)" }}>
          <TextField id="ratings-genre-search" label={t("formattingSearch")} value={genreSearch} onChange={(event) => setGenreSearch(event.target.value)} />
          <label><input type="checkbox" checked={showAllGenres} onChange={(event) => setShowAllGenres(event.target.checked)} /> {t("ratingsShowAllGenres")}</label>
        </div>
        {genreRows.map(({ term, depth }) => {
          const configured = definitionsByTerm.get(term.id);
          let inherited = configured?.inheritanceMode === "inherit" ? undefined : configured;
          let parentId = term.parentId;
          while (!inherited && parentId) {
            const parentDefinition = definitionsByTerm.get(parentId);
            if (parentDefinition?.enabled && parentDefinition.inheritanceMode === "custom") inherited = parentDefinition;
            parentId = termById.get(parentId)?.parentId ?? null;
          }
          const def = configured ?? {
            genreTermId: term.id,
            genreName: term.name,
            parentGenreName: term.parentId ? (termById.get(term.parentId)?.name ?? null) : null,
            mediaType: "books",
            inheritanceMode: inherited ? "inherit" as const : "custom" as const,
            enabled: false,
            displayOrder: term.sortOrder ?? 0,
            dimensions: [],
          };
          const open = genresOpen[def.genreTermId] ?? false;
          return (
            <div key={def.genreTermId} className={adminStyles.adminPanel} style={{ marginBottom: "var(--space-3)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3)", paddingLeft: `calc(var(--space-3) + ${depth * 1.25}rem)` }}>
                <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={def.enabled}
                    onChange={(e) =>
                      void toggleGenre(def.genreTermId, e.target.checked, def.displayOrder)
                    }
                  />
                  <strong>{def.genreName}</strong>
                  {!configured && inherited ? (
                    <span style={{ color: "var(--color-ink-muted)", fontWeight: 400 }}>
                      {t("ratingsInheritsFrom", { genre: inherited.genreName })}
                    </span>
                  ) : null}
                  {def.parentGenreName ? (
                    <span style={{ color: "var(--color-ink-muted)", fontWeight: 400 }}>
                      ({def.parentGenreName})
                    </span>
                  ) : null}
                </label>
                <button
                  type="button"
                  onClick={() => setGenresOpen({ ...genresOpen, [def.genreTermId]: !open })}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--color-ink-muted)" }}
                >
                  {open ? "−" : "+"}
                </button>
              </div>
              {open && (
                <div style={{ padding: "0 var(--space-3) var(--space-3)" }}>
                  <DimensionList
                    dimensions={def.dimensions}
                    onAdd={() => setEditingGenre({ termId: def.genreTermId, dimension: null })}
                    onEdit={(dim) => setEditingGenre({ termId: def.genreTermId, dimension: dim })}
                    onDelete={(dim) => void deleteDimension(dim.id)}
                    onNewOpen={editingGenre?.termId === def.genreTermId && editingGenre.dimension === null}
                  />
                  {editingGenre?.termId === def.genreTermId && (
                    <DimensionEditor
                      initial={editingGenre.dimension}
                      scope="genre"
                      genreTermId={def.genreTermId}
                      onSave={saveGenreDimension}
                      onCancel={() => setEditingGenre(null)}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </AdminPage>
  );
}

function flattenGenreTerms(
  terms: VocabularyTermDto[],
  depth = 0,
): Array<{ term: VocabularyTermDto; depth: number }> {
  return terms.flatMap((term) => [
    { term, depth },
    ...flattenGenreTerms(term.children, depth + 1),
  ]);
}

function DimensionList({
  dimensions,
  onAdd,
  onEdit,
  onDelete,
  onNewOpen,
}: {
  dimensions: RatingDimension[];
  onAdd: () => void;
  onEdit: (dim: RatingDimension) => void;
  onDelete: (dim: RatingDimension) => void;
  onNewOpen: boolean;
}) {
  const { t } = useTranslation(["admin", "common"]);
  return (
    <div>
      {dimensions.map((dim) => (
        <div
          key={dim.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-2) 0",
            borderBottom: "1px solid var(--color-divider)",
          }}
        >
          <span style={{ opacity: dim.enabled ? 1 : 0.5 }}>{dim.name}</span>
          <span style={{ color: "var(--color-ink-muted)", fontSize: "0.875rem" }}>
            {dim.key}
          </span>
          {dim.required && <span aria-label={t("ratingsDimensionRequired")}>*</span>}
          <span style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
            <button type="button" onClick={() => onEdit(dim)} style={linkButtonStyles}>
              {t("edit")}
            </button>
            <button type="button" onClick={() => onDelete(dim)} style={linkButtonStyles}>
              {t("delete")}
            </button>
          </span>
        </div>
      ))}
      <div style={{ marginTop: "var(--space-3)" }}>
        <Button onClick={onAdd} disabled={onNewOpen}>
          {t("add")}
        </Button>
      </div>
    </div>
  );
}

const linkButtonStyles: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--color-accent)",
  cursor: "pointer",
  fontSize: "0.875rem",
};

function LoadingPlaceholder() {
  return <p>Loading…</p>;
}
