export interface SearchQuery {
  q: string;
  types?: string[];
  cursor?: string;
  limit?: number;
}

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  snippet?: string;
  slug?: string;
  href?: string;
}

export interface SearchIndex {
  upsert(doc: {
    entityType: string;
    entityId: string;
    title: string;
    body?: string;
  }): Promise<void>;
  remove(entityType: string, entityId: string): Promise<void>;
  query(
    query: SearchQuery,
  ): Promise<{ results: SearchResult[]; nextCursor?: string }>;
}
