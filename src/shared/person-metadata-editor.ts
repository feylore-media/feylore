import { z } from "zod";
import type { PeopleEntityType } from "./people.js";
import { PERSON_LINK_KINDS, type PersonLinkKind } from "./people.js";
import type {
  MetadataEditorFieldRow,
  MetadataEditorSourceColumn,
} from "./book-metadata-editor.js";

export interface PersonEditorSummary {
  id: string;
  slug: string;
  entityType: PeopleEntityType;
  name: string;
  sortName: string;
  alternateNames: string[];
  bio: string | null;
  pronouns: string | null;
  personalUrl: string | null;
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  deathPlace: string | null;
  photoFileId: string | null;
  creditCounts: Record<string, number>;
  roleLabels: string[];
}

export interface PersonLinkEditorRow {
  id: string;
  kind: PersonLinkKind;
  label: string | null;
  url: string;
  sourceLabel?: string | null;
}

export interface PersonIdentifierEditorRow {
  provider: string;
  providerLabel: string;
  identifier: string;
  sourceLabel?: string | null;
}

export interface PersonProviderStatus {
  key: string;
  label: string;
  fetchedAt: string | null;
  available: boolean;
}

export interface PersonEvidenceLink {
  kind: PersonLinkKind;
  label: string;
  url: string;
  sourceKey: string;
}

export interface PersonEvidenceIdentifier {
  provider: string;
  identifier: string;
  sourceKey: string;
}

export interface PersonMetadataEditorData {
  person: PersonEditorSummary;
  providerSources: MetadataEditorSourceColumn[];
  fields: MetadataEditorFieldRow[];
  links: PersonLinkEditorRow[];
  linkCandidates: PersonEvidenceLink[];
  identifiers: PersonIdentifierEditorRow[];
  identifierCandidates: PersonEvidenceIdentifier[];
  providers: PersonProviderStatus[];
}

export const personEditFieldEntrySchema = z.object({
  fieldId: z.string(),
  value: z.string().nullish(),
});

export const setPersonMetadataFieldsSchema = z.object({
  fields: z.array(personEditFieldEntrySchema).min(1),
});

export const setPersonFieldLockSchema = z.object({
  fieldId: z.string(),
  lock: z.boolean(),
});

export const personLinkInputSchema = z.object({
  kind: z.enum(PERSON_LINK_KINDS),
  label: z.string().trim().max(120).optional(),
  url: z.string().trim().url().min(1).max(2048),
  sortOrder: z.number().int().min(0).optional(),
});

export const updatePersonIdentitySchema = z.object({
  name: z.string().trim().min(1).max(500).optional(),
  sortName: z.string().trim().max(500).optional(),
  alternateNames: z.array(z.string().trim().max(500)).optional(),
  bio: z.string().max(20000).nullish(),
  pronouns: z.string().trim().max(100).nullish(),
  personalUrl: z.union([z.string().trim().url().max(2048), z.literal("")]).optional(),
  birthDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  deathDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  birthPlace: z.string().trim().max(500).nullish(),
  deathPlace: z.string().trim().max(500).nullish(),
});

export const personProviderIdentifierSchema = z.object({
  provider: z.string().min(1).max(100),
  identifier: z.string().min(1).max(500),
});

export const mergePeopleSchema = z.object({
  duplicatePeopleId: z.string().min(1),
});

export const peopleDuplicateCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  entityType: z.enum(["person", "group", "organization"]),
  creditCounts: z.record(z.number()),
  score: z.number(),
});
