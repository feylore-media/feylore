import type { CanonicalFieldId } from "../metadata-fields.js";
import type { MediaModuleId } from "../media-modules.js";
import type { MetadataSourceCategory } from "../metadata-source-category.js";
import type { MetadataMatchingRules } from "../metadata-settings.js";
import type { EditionFormatPreference } from "../metadata-edition-preference.js";

export const METADATA_PROVIDER_CONTRACT =
  "feylore.metadata.provider.v1" as const;

export type MetadataSourceType =
  | "api"
  | "parser"
  | "embedded"
  | "regional"
  | "community"
  | "local";

export type MetadataConfigFieldType =
  | "text"
  | "secret"
  | "url"
  | "select";

export interface MetadataConfigField {
  key: string;
  label: string;
  type: MetadataConfigFieldType;
  required?: boolean;
  description?: string;
  options?: Array<{ value: string; label: string }>;
}

export type MetadataProviderFieldKind = "text" | "number" | "rating";

export interface MetadataProviderFieldDescriptor {
  key: string;
  label: string;
  kind?: MetadataProviderFieldKind;
}

export interface MetadataSourceDescriptor {
  id: string;
  name: string;
  mediaModules: MediaModuleId[];
  sourceType: MetadataSourceType;
  /** Explicit tier; when omitted, derived from sourceType via getMetadataSourceCategory. */
  sourceCategory?: Exclude<MetadataSourceCategory, "canonical">;
  region?: { code: string; label: string };
  /** Canonical fields this source can populate. Custom fields are never listed here. */
  fields: CanonicalFieldId[];
  /** Provider-specific evidence fields (not canonical). */
  providerFields?: MetadataProviderFieldDescriptor[];
  configSchema?: MetadataConfigField[];
  /** Optional seed hint only; prefer metadata policy seed for ordering. */
  defaultPriority?: Partial<Record<CanonicalFieldId, number>>;
  /** When false, source is discoverable but fetch is not implemented. */
  implemented?: boolean;
}

export interface MetadataFetchContext {
  subjectType?: string;
  subjectId?: string;
  fileId?: string;
  hints?: Record<string, unknown>;
  mediaModule?: MediaModuleId;
  editionFormatPreference?: EditionFormatPreference;
  matchingRules?: MetadataMatchingRules;
  userId?: string;
}

export interface MetadataProviderResult {
  externalId?: string;
  payload: Record<string, unknown>;
}

export interface ConnectionTestResult {
  ok: boolean;
  message?: string;
}

export interface MetadataProvider {
  readonly key: string;
  readonly contractVersion: typeof METADATA_PROVIDER_CONTRACT;
  readonly descriptor: MetadataSourceDescriptor;
  fetch(
    context: MetadataFetchContext,
    config?: Record<string, unknown>,
  ): Promise<MetadataProviderResult | null>;
  testConnection?(
    config: Record<string, unknown>,
  ): Promise<ConnectionTestResult>;
}

export interface MetadataProviderRegistration {
  key: string;
  contractVersion: string;
  provider: MetadataProvider;
}
