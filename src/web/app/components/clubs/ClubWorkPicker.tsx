import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClubContext } from "@shared/clubs";
import { api } from "../../api";
import { Button, TextField } from "../../../components/primitives";

const CONTEXT_TYPES: Record<ClubContext, string[]> = {
  general: ["book", "show", "movie"],
  book: ["book"],
  video: ["show", "movie"],
  ttrpg: [],
};

interface SearchHit {
  type: string;
  id: string;
  title: string;
}

interface ClubWorkPickerProps {
  clubId: string;
  context: ClubContext;
  onAdded: () => void;
  addMode?: "work" | "poll";
  pollId?: string;
  showHeading?: boolean;
}

export function ClubWorkPicker({
  clubId,
  context,
  onAdded,
  addMode = "work",
  pollId,
  showHeading = true,
}: ClubWorkPickerProps) {
  const { t } = useTranslation("clubs");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const allowedTypes = new Set(CONTEXT_TYPES[context]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await api<{
        data: SearchHit[];
      }>(`/search?q=${encodeURIComponent(query.trim())}`);
      setResults(
        res.data.filter((row) => allowedTypes.has(row.type)),
      );
    } finally {
      setLoading(false);
    }
  }

  async function addWork(hit: SearchHit, asCurrent: boolean) {
    if (addMode === "poll") {
      if (!pollId) return;
      await api(`/clubs/${clubId}/polls/${pollId}/options`, {
        method: "POST",
        body: JSON.stringify({
          workSubjectType: hit.type,
          workSubjectId: hit.id,
        }),
      });
    } else {
      await api(`/clubs/${clubId}/works`, {
        method: "POST",
        body: JSON.stringify({
          workSubjectType: hit.type,
          workSubjectId: hit.id,
          status: asCurrent ? "current" : "associated",
        }),
      });
    }
    setQuery("");
    setResults([]);
    onAdded();
  }

  if (allowedTypes.size === 0) {
    return <p className="muted">{t("workPickerUnavailable")}</p>;
  }

  return (
    <section style={{ marginBottom: "var(--space-4)" }}>
      {showHeading && (
        <h3 style={{ fontSize: "0.95rem" }}>
          {addMode === "poll" ? t("pollAddManualOption") : t("addWork")}
        </h3>
      )}
      <form
        onSubmit={(e) => void search(e)}
        style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}
      >
        <TextField
          label={t("searchWorkPlaceholder")}
          id="club-work-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchWorkPlaceholder")}
        />
        <Button type="submit" disabled={loading}>
          {t("searchWork")}
        </Button>
      </form>
      {results.length > 0 && (
        <ul style={{ paddingLeft: "1.25rem" }}>
          {results.map((hit) => (
            <li key={`${hit.type}:${hit.id}`} style={{ marginBottom: "var(--space-2)" }}>
              {hit.title}{" "}
              {addMode === "poll" ? (
                <Button type="button" onClick={() => void addWork(hit, false)}>
                  {t("pollAddOption")}
                </Button>
              ) : (
                <>
                  <Button type="button" onClick={() => void addWork(hit, false)}>
                    {t("addWork")}
                  </Button>{" "}
                  <Button type="button" onClick={() => void addWork(hit, true)}>
                    {t("addAsCurrent")}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
