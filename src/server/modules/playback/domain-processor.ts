import type { Database } from "../../db/client.js";

export interface MediaProcessContext {
  feyloreJobId: string;
  representationId?: string;
  fileId?: string;
  domain?: string;
  db: Database;
  signal: AbortSignal;
}

export interface MediaProcessResult {
  logExcerpt: string;
  technicalMetadata?: Array<{
    fileId: string;
    extractor: string;
    payload: Record<string, unknown>;
  }>;
}

export interface MediaDomainProcessor {
  readonly domain: string;
  canProcess(input: { domain?: string; representationDomainModule?: string }): boolean;
  process(ctx: MediaProcessContext): Promise<MediaProcessResult>;
}
