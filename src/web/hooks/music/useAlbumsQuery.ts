import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { AlbumListItem, AlbumSortField } from "@shared/music";
import type { PaginatedResponse } from "@shared/api";
import { api } from "../../app/api";
import { useDebouncedValue } from "../books/useDebouncedSearchParam";

export interface AlbumsQueryFilters {
  q?: string;
  sort?: AlbumSortField;
  order?: "asc" | "desc";
  view?: "all" | "recent";
  artist?: string;
  genre?: string;
  favorite?: boolean;
}

const SORT_FIELDS: AlbumSortField[] = [
  "title",
  "addedAt",
  "updatedAt",
  "artist",
  "releaseDate",
];

function parseFilters(
  params: URLSearchParams,
  defaults: AlbumsQueryFilters,
): AlbumsQueryFilters {
  const sortParam = params.get("sort");
  const sort =
    sortParam && SORT_FIELDS.includes(sortParam as AlbumSortField)
      ? (sortParam as AlbumSortField)
      : defaults.sort ?? "title";

  const orderParam = params.get("order");
  const order = orderParam === "desc" ? "desc" : defaults.order ?? "asc";

  const viewParam = params.get("view");
  const view =
    viewParam === "recent" ? "recent" : defaults.view ?? "all";

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
    artist: params.get("artist") ?? defaults.artist ?? undefined,
    genre: params.get("genre") ?? defaults.genre ?? undefined,
    favorite,
  };
}

function buildQueryString(
  filters: AlbumsQueryFilters,
  cursor?: string,
  limit?: number,
): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.view && filters.view !== "all") params.set("view", filters.view);
  if (filters.artist) params.set("artist", filters.artist);
  if (filters.genre) params.set("genre", filters.genre);
  if (filters.favorite === true) params.set("favorite", "true");
  else if (filters.favorite === false) params.set("favorite", "false");
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));
  return params.toString();
}

export interface UseAlbumsQueryOptions {
  debounceSearch?: boolean;
  limit?: number;
  enabled?: boolean;
  defaultView?: "all" | "recent";
  defaultFavorite?: boolean;
}

export function useAlbumsQuery(options: UseAlbumsQueryOptions = {}) {
  const {
    debounceSearch = true,
    limit,
    enabled = true,
    defaultView = "all",
    defaultFavorite,
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => {
    const defaults: AlbumsQueryFilters = { view: defaultView };
    if (defaultFavorite === true) defaults.favorite = true;
    return parseFilters(searchParams, defaults);
  }, [searchParams, defaultView, defaultFavorite]);

  const rawQ = filters.q ?? "";
  const debouncedQ = useDebouncedValue(rawQ, debounceSearch ? 300 : 0);
  const effectiveFilters = useMemo(
    () => ({ ...filters, q: debounceSearch ? debouncedQ : rawQ }),
    [filters, debounceSearch, debouncedQ, rawQ],
  );

  const [albums, setAlbums] = useState<AlbumListItem[]>([]);
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
    void api<PaginatedResponse<AlbumListItem>>(`/music/albums?${queryKey}`)
      .then((r) => {
        setAlbums(r.data);
        setNextCursor(r.page.nextCursor);
      })
      .catch((e: Error) => {
        setError(e.message);
        setAlbums([]);
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
    void api<PaginatedResponse<AlbumListItem>>(`/music/albums?${qs}`)
      .then((r) => {
        setAlbums((prev) => [...prev, ...r.data]);
        setNextCursor(r.page.nextCursor);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingMore(false));
  }, [effectiveFilters, nextCursor, loadingMore, limit, enabled]);

  const setFilter = useCallback(
    (patch: Partial<AlbumsQueryFilters>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const apply = (key: keyof AlbumsQueryFilters, param: string) => {
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
        apply("artist", "artist");
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
    albums,
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
      Boolean(effectiveFilters.artist) ||
      Boolean(effectiveFilters.genre) ||
      effectiveFilters.favorite === true,
  };
}

export async function fetchAlbums(
  filters: AlbumsQueryFilters & { limit?: number },
): Promise<AlbumListItem[]> {
  const qs = buildQueryString(filters, undefined, filters.limit);
  const r = await api<PaginatedResponse<AlbumListItem>>(`/music/albums?${qs}`);
  return r.data;
}
