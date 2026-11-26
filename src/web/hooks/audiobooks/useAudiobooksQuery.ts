import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { AudiobookListItem, AudiobookSortField } from "@shared/audiobooks";
import type { PaginatedResponse } from "@shared/api";
import { api } from "../../app/api";
import { useDebouncedValue } from "../books/useDebouncedSearchParam";

export interface AudiobooksQueryFilters {
  q?: string;
  sort?: AudiobookSortField;
  order?: "asc" | "desc";
  view?: "all" | "continue" | "recent";
  author?: string;
  narrator?: string;
  series?: string;
  genre?: string;
  favorite?: boolean;
}

const SORT_FIELDS: AudiobookSortField[] = [
  "title",
  "addedAt",
  "updatedAt",
  "author",
];

function parseFilters(
  params: URLSearchParams,
  defaults: AudiobooksQueryFilters,
): AudiobooksQueryFilters {
  const sortParam = params.get("sort");
  const sort =
    sortParam && SORT_FIELDS.includes(sortParam as AudiobookSortField)
      ? (sortParam as AudiobookSortField)
      : defaults.sort ?? "title";

  const orderParam = params.get("order");
  const order = orderParam === "desc" ? "desc" : defaults.order ?? "asc";

  const viewParam = params.get("view");
  const view =
    viewParam === "continue" || viewParam === "recent"
      ? viewParam
      : defaults.view ?? "all";

  const favoriteParam = params.get("favorite");
  let favorite: boolean | undefined;
  if (favoriteParam === "true") favorite = true;
  else if (favoriteParam === "false") favorite = false;
  else favorite = defaults.favorite;

  return {
    q: params.get("q") ?? defaults.q ?? undefined,
    sort,
    order,
    view,
    author: params.get("author") ?? defaults.author ?? undefined,
    narrator: params.get("narrator") ?? defaults.narrator ?? undefined,
    series: params.get("series") ?? defaults.series ?? undefined,
    genre: params.get("genre") ?? defaults.genre ?? undefined,
    favorite,
  };
}

function buildQueryString(
  filters: AudiobooksQueryFilters,
  cursor?: string,
  limit?: number,
): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.view && filters.view !== "all") params.set("view", filters.view);
  if (filters.author) params.set("author", filters.author);
  if (filters.narrator) params.set("narrator", filters.narrator);
  if (filters.series) params.set("series", filters.series);
  if (filters.genre) params.set("genre", filters.genre);
  if (filters.favorite === true) params.set("favorite", "true");
  else if (filters.favorite === false) params.set("favorite", "false");
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));
  return params.toString();
}

export interface UseAudiobooksQueryOptions {
  debounceSearch?: boolean;
  limit?: number;
  enabled?: boolean;
  defaultView?: "all" | "continue" | "recent";
  defaultFavorite?: boolean;
}

export function useAudiobooksQuery(options: UseAudiobooksQueryOptions = {}) {
  const {
    debounceSearch = true,
    limit,
    enabled = true,
    defaultView = "all",
    defaultFavorite,
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => {
    const defaults: AudiobooksQueryFilters = { view: defaultView };
    if (defaultFavorite === true) defaults.favorite = true;
    return parseFilters(searchParams, defaults);
  }, [searchParams, defaultView, defaultFavorite]);

  const rawQ = filters.q ?? "";
  const debouncedQ = useDebouncedValue(rawQ, debounceSearch ? 300 : 0);
  const effectiveFilters = useMemo(
    () => ({ ...filters, q: debounceSearch ? debouncedQ : rawQ }),
    [filters, debounceSearch, debouncedQ, rawQ],
  );

  const [audiobooks, setAudiobooks] = useState<AudiobookListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = buildQueryString(effectiveFilters, undefined, limit);

  const loadInitial = useCallback(() => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    setNextCursor(null);
    void api<PaginatedResponse<AudiobookListItem>>(`/audiobooks?${queryKey}`)
      .then((r) => {
        setAudiobooks(r.data);
        setNextCursor(r.page.nextCursor);
      })
      .catch((e: Error) => {
        setError(e.message);
        setAudiobooks([]);
        setNextCursor(null);
      })
      .finally(() => setLoading(false));
  }, [queryKey, enabled]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore || !enabled) return;
    setLoadingMore(true);
    const qs = buildQueryString(effectiveFilters, nextCursor, limit);
    void api<PaginatedResponse<AudiobookListItem>>(`/audiobooks?${qs}`)
      .then((r) => {
        setAudiobooks((prev) => [...prev, ...r.data]);
        setNextCursor(r.page.nextCursor);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingMore(false));
  }, [effectiveFilters, nextCursor, loadingMore, limit, enabled]);

  const setFilter = useCallback(
    (patch: Partial<AudiobooksQueryFilters>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const apply = (key: keyof AudiobooksQueryFilters, param: string) => {
          const val = patch[key];
          if (val === undefined) return;
          if (val === "" || val === false) next.delete(param);
          else if (val === true) next.set(param, "true");
          else next.set(param, String(val));
        };
        apply("q", "q");
        apply("sort", "sort");
        apply("order", "order");
        apply("view", "view");
        apply("author", "author");
        apply("narrator", "narrator");
        apply("series", "series");
        apply("genre", "genre");
        apply("favorite", "favorite");
        next.delete("cursor");
        return next;
      });
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(() => {
      const next = new URLSearchParams();
      if (defaultView && defaultView !== "all") next.set("view", defaultView);
      if (defaultFavorite === true) next.set("favorite", "true");
      return next;
    });
  }, [setSearchParams, defaultView, defaultFavorite]);

  const setSearchInput = useCallback(
    (q: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set("q", q);
        else next.delete("q");
        next.delete("cursor");
        return next;
      });
    },
    [setSearchParams],
  );

  return {
    audiobooks,
    loading,
    loadingMore,
    error,
    nextCursor,
    filters: effectiveFilters,
    rawQ,
    loadMore,
    reload: loadInitial,
    setFilter,
    clearFilters,
    setSearchInput,
    hasActiveFilters:
      Boolean(effectiveFilters.q) ||
      Boolean(effectiveFilters.author) ||
      Boolean(effectiveFilters.narrator) ||
      Boolean(effectiveFilters.series) ||
      Boolean(effectiveFilters.genre) ||
      effectiveFilters.favorite === true,
  };
}

export async function fetchAudiobooks(
  filters: AudiobooksQueryFilters & { limit?: number },
): Promise<AudiobookListItem[]> {
  const qs = buildQueryString(filters, undefined, filters.limit);
  const r = await api<PaginatedResponse<AudiobookListItem>>(`/audiobooks?${qs}`);
  return r.data;
}
