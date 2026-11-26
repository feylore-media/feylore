import type {
  IngestPipelineStatus,
  IngestTerminalState,
} from "../../../shared/ingest.js";
import type { IngestStageLogEntry } from "../../db/schema.js";
import type { DetectionHints } from "./domain-router.js";

export interface DetectionResult {
  domain: string | null;
  contentType: string | null;
  format: string | null;
  confidence: "high" | "low" | "none";
}

export interface IngestContext {
  ingestItemId: string;
  sourceStorageLocationId: string;
  sourcePath: string;
  sourceChecksum: string | null;
  sourceSize: number;
  originalFilename: string;
  fileId: string | null;
  targetLibraryId: string | null;
  userId: string | null;
  workType: string | null;
  workId: string | null;
  representationId: string | null;
  manifestationId: string | null;
  metadata: Record<string, unknown>;
}

export interface IdentificationResult {
  workType: string;
  workId?: string;
  representationId?: string;
  manifestationId?: string;
  provisionalTitle: string;
  format: string;
}

export interface MetadataResult {
  title?: string;
  authors?: string[];
  series?: string;
  metadataLog: string[];
}

export interface NormalizationResult {
  normalizedPath?: string;
  skipped?: boolean;
  log: string[];
}

export interface OrganizationResult {
  destinationRelativePath: string;
  fileId: string;
  log: string[];
}

export interface WorkRepresentationResult {
  workType: string;
  workId: string;
  expressionId: string;
  manifestationId: string | null;
  representationId: string;
}

export interface IngestDomainProcessor {
  readonly domain: string;
  canHandle(detection: DetectionResult): boolean;
  detect(
    filename: string,
    mediaType?: string | null,
    hints?: DetectionHints,
  ): DetectionResult;
  identify(ctx: IngestContext): Promise<IdentificationResult>;
  createWorkRepresentation(
    ctx: IngestContext,
    identified: IdentificationResult,
  ): Promise<WorkRepresentationResult>;
  resolveMetadata(ctx: IngestContext): Promise<MetadataResult>;
  normalize?(ctx: IngestContext): Promise<NormalizationResult>;
  organize(ctx: IngestContext): Promise<OrganizationResult>;
  findDuplicateByChecksum(
    checksum: string,
  ): Promise<{ workType: string; workId: string } | null>;
}

export interface PipelineUpdate {
  status?: IngestPipelineStatus;
  terminalState?: IngestTerminalState | null;
  fileLifecycle?: IngestContext extends never ? never : string;
  progress?: number;
  error?: string | null;
  stageLogEntry?: IngestStageLogEntry;
  detectedDomain?: string | null;
  detectedContentType?: string | null;
  targetLibraryId?: string | null;
  workType?: string | null;
  workId?: string | null;
  fileId?: string | null;
  destinationRelativePath?: string | null;
  duplicateOfWorkType?: string | null;
  duplicateOfWorkId?: string | null;
  warnings?: string[];
}
