import { useState, useEffect, useCallback } from "react";
import type {
  PeoplePaginatedResponse,
  PeopleListQuery,
} from "@shared/people";
import { api } from "../api";

export function usePeopleList(
  endpoint: string,
  initialQuery: PeopleListQuery,
) {
  const [data, setData] = useState<PeoplePaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<PeopleListQuery>(initialQuery);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(query.page));
      params.set("size", String(query.size));
      params.set("sort", query.sort);
      if (query.letter) params.set("letter", query.letter);
      if (query.entityType) params.set("entityType", query.entityType);

      const result = await api<{ data: PeoplePaginatedResponse }>(
        `${endpoint}?${params.toString()}`,
      );
      setData(result.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [endpoint, query]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const setPage = useCallback((page: number) => {
    setQuery((q) => ({ ...q, page }));
  }, []);

  const setLetter = useCallback((letter: string | undefined) => {
    setQuery((q) => ({ ...q, letter, page: 1 }));
  }, []);

  const setSort = useCallback((sort: "az" | "za") => {
    setQuery((q) => ({ ...q, sort, page: 1 }));
  }, []);

  return {
    data,
    loading,
    error,
    query,
    setPage,
    setLetter,
    setSort,
  };
}
