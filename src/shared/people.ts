import { z } from "zod";

export const PEOPLE_ENTITY_TYPES = ["person", "group", "organization"] as const;
export type PeopleEntityType = (typeof PEOPLE_ENTITY_TYPES)[number];

export const PERSON_LINK_KINDS = [
  "website",
  "wikipedia",
  "imdb",
  "instagram",
  "bluesky",
  "musicbrainz",
  "openlibrary",
  "facebook",
  "x",
  "social",
  "other",
] as const;
export type PersonLinkKind = (typeof PERSON_LINK_KINDS)[number];

export const peopleListQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  size: z.coerce.number().min(1).max(100).default(42),
  sort: z.enum(["az", "za"]).default("az"),
  letter: z.string().length(1).optional(),
  entityType: z.enum(PEOPLE_ENTITY_TYPES).optional(),
});

export type PeopleListQuery = z.infer<typeof peopleListQuerySchema>;

export interface PeopleEntityCard {
  id: string;
  slug: string;
  name: string;
  entityType: PeopleEntityType;
  photoFileId: string | null;
  roleLabels: string[];
  nextWork: {
    title: string;
    date: string;
    targetType: string;
    slug: string;
  } | null;
}

export interface PeopleEntitySummary {
  id: string;
  slug: string;
  name: string;
  entityType: PeopleEntityType;
  photoFileId: string | null;
}

export interface PeopleEntityProfile {
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
  links: PersonLink[];
  credits: PeopleCreditItem[];
  relationships: PeopleRelationshipItem[];
}

export interface PersonLink {
  id: string;
  kind: PersonLinkKind;
  label: string | null;
  url: string;
  sortOrder: number;
  sourceLabel?: string | null;
}

export interface PeopleCreditItem {
  id: string;
  targetType: string;
  targetId: string;
  targetSlug: string | null;
  targetTitle: string;
  targetCoverFileId: string | null;
  role: string;
  character: string | null;
  sortOrder: number;
  releaseDate: string | null;
  seriesName: string | null;
  seriesPosition: number | null;
}

export interface PeopleRelationshipItem {
  relatedPeopleId: string;
  relatedName: string;
  relatedSlug: string;
  relatedEntityType: PeopleEntityType;
  relatedPhotoFileId: string | null;
  relationshipType: string;
  sortOrder: number;
}

export interface PeoplePaginatedResponse {
  items: PeopleEntityCard[];
  pagination: {
    page: number;
    size: number;
    total: number;
    totalPages: number;
  };
  availableLetters: string[];
}
