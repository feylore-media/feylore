import { z } from "zod";

export const INGEST_PIPELINE_STATUSES = [
  "discovered",
  "queued",
  "analyzing",
  "identifying",
  "metadata_resolved",
  "normalizing",
  "organizing",
  "completed",
] as const;

export type IngestPipelineStatus = (typeof INGEST_PIPELINE_STATUSES)[number];

export const INGEST_TERMINAL_STATES = [
  "failed",
  "needs_attention",
  "duplicate",
  "unsupported",
] as const;

export type IngestTerminalState = (typeof INGEST_TERMINAL_STATES)[number];

export const INGEST_FILE_LIFECYCLES = [
  "incoming",
  "discovered",
  "claimed",
  "processing",
  "destination_prepared",
  "destination_verified",
  "source_retired",
] as const;

export type IngestFileLifecycle = (typeof INGEST_FILE_LIFECYCLES)[number];

export const INGEST_SOURCE_KINDS = ["filesystem", "upload"] as const;
export type IngestSourceKind = (typeof INGEST_SOURCE_KINDS)[number];

export const ORGANIZATION_POLICY_MODES = ["in_place", "managed"] as const;
export type OrganizationPolicyMode = (typeof ORGANIZATION_POLICY_MODES)[number];

export interface IngestStageLogEntry {
  stage: string;
  at: string;
  message: string;
}

export interface IngestItemSummary {
  id: string;
  status: IngestPipelineStatus;
  terminalState: IngestTerminalState | null;
  fileLifecycle: IngestFileLifecycle;
  sourceKind: IngestSourceKind;
  originalFilename: string;
  detectedContentType: string | null;
  detectedDomain: string | null;
  targetLibraryId: string | null;
  progress: number;
  error: string | null;
  workType: string | null;
  workId: string | null;
  duplicateOfWorkType: string | null;
  duplicateOfWorkId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface IngestItemDetail extends IngestItemSummary {
  sourcePath: string;
  sourceIdentity: string;
  destinationRelativePath: string | null;
  stageLog: IngestStageLogEntry[];
  warnings: string[];
  retryCount: number;
}

export const ingestItemListQuerySchema = z.object({
  status: z.enum(INGEST_PIPELINE_STATUSES).optional(),
  terminalState: z.enum(INGEST_TERMINAL_STATES).optional(),
  processing: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export const createIngestRootSchema = z.object({
  name: z.string().min(1),
  storageLocationId: z.string().uuid(),
  enabled: z.boolean().optional(),
  recursive: z.boolean().optional(),
  contentTypeHint: z.string().optional(),
  defaultLibraryId: z.string().uuid().optional(),
});

export const updateIngestRootSchema = createIngestRootSchema.partial();

export const createLibrarySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  contentType: z.enum(["book"]).default("book"),
  enabled: z.boolean().optional(),
  storageLocationId: z.string().uuid().optional(),
  organizationPolicy: z
    .object({
      mode: z.enum(ORGANIZATION_POLICY_MODES),
      template: z.string().optional(),
    })
    .optional(),
  normalizationPolicy: z
    .object({
      epub: z
        .object({
          enabled: z.boolean(),
          target: z.literal("epub-3.3"),
        })
        .optional(),
    })
    .optional(),
  supportedFormats: z.array(z.string()).optional(),
});

export const updateLibrarySchema = createLibrarySchema.partial();

export function isIngestProcessing(item: {
  status: IngestPipelineStatus;
  terminalState: IngestTerminalState | null;
}): boolean {
  if (item.terminalState) return false;
  return item.status !== "completed";
}

export function isIngestActive(item: {
  status: IngestPipelineStatus;
  terminalState: IngestTerminalState | null;
}): boolean {
  if (item.terminalState) return false;
  return item.status !== "completed" && item.status !== "discovered";
}

export const INGEST_UPLOAD_STAGING_PREFIX = ".ingest-uploads";

export const INGEST_TEMP_FILE_PATTERNS = [
  /\.part$/i,
  /\.tmp$/i,
  /\.crdownload$/i,
  /\.download$/i,
  /\.partial$/i,
  /~$/,
];
