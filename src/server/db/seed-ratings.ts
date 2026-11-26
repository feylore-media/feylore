import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Database } from "./client.js";
import * as schema from "./schema.js";
import {
  RATING_SYSTEM_SETTINGS_KEY,
  type RatingSystemSettings,
} from "../../shared/ratings.js";
import { normalizeVocabularyKey } from "../../shared/metadata-formatting.js";

export interface SeedDimensionDescriptor {
  key: string;
  name: string;
  description?: string;
}

const CORE_DIMENSIONS: SeedDimensionDescriptor[] = [
  {
    key: "characters",
    name: "Characters",
    description:
      "How compelling, believable, and well developed the characters are.",
  },
  {
    key: "atmosphere",
    name: "Atmosphere / Worldbuilding",
    description:
      "How immersive the setting, mood, and worldbuilding feel while reading.",
  },
  {
    key: "writing",
    name: "Writing Style",
    description:
      "Craft, prose, voice, and how well the writing serves the story.",
  },
  {
    key: "intrigue",
    name: "Intrigue / Plot",
    description: "How engaging, surprising, and coherent the plot is.",
  },
  {
    key: "logic",
    name: "Logic / Pacing",
    description:
      "Whether events follow logically and the story moves at an effective pace.",
  },
  {
    key: "enjoyment",
    name: "Enjoyment",
    description: "How much you simply enjoyed reading the book.",
  },
];

const NONFICTION_DIMENSIONS: SeedDimensionDescriptor[] = [
  { key: "accuracy", name: "Accuracy" },
  { key: "clarity", name: "Clarity" },
  { key: "depth", name: "Depth" },
  { key: "engagement", name: "Engagement" },
];

const GENRE_DIMENSION_SETS: Record<string, SeedDimensionDescriptor[]> = {
  Fiction: [
    { key: "writing", name: "Writing Style" },
    { key: "characters", name: "Characters" },
    { key: "plot", name: "Plot" },
    { key: "pacing", name: "Pacing" },
    { key: "enjoyment", name: "Enjoyment" },
  ],
  Fantasy: [
    { key: "worldbuilding", name: "Worldbuilding" },
    { key: "characters", name: "Characters" },
    { key: "magicSystem", name: "Magic / Rules" },
    { key: "pacing", name: "Pacing" },
    { key: "prose", name: "Prose" },
  ],
  "Science Fiction": [
    { key: "worldbuilding", name: "Worldbuilding" },
    { key: "ideas", name: "Big Ideas" },
    { key: "characters", name: "Characters" },
    { key: "plotLogic", name: "Plot Logic" },
    { key: "prose", name: "Prose" },
  ],
  Mystery: [
    { key: "fairPlay", name: "Fair Play" },
    { key: "deduction", name: "Deduction" },
    { key: "pacing", name: "Pacing" },
    { key: "characters", name: "Characters" },
    { key: "solution", name: "Solution Satisfaction" },
  ],
  Thriller: [
    { key: "suspense", name: "Suspense" },
    { key: "pacing", name: "Pacing" },
    { key: "plausibility", name: "Plausibility" },
    { key: "characters", name: "Characters" },
    { key: "payoff", name: "Payoff" },
  ],
  Horror: [
    { key: "atmosphere", name: "Atmosphere" },
    { key: "fear", name: "Fear Effectiveness" },
    { key: "pacing", name: "Pacing" },
    { key: "characters", name: "Characters" },
    { key: "prose", name: "Prose" },
  ],
  Romance: [
    { key: "chemistry", name: "Chemistry" },
    { key: "pacing", name: "Pacing" },
    { key: "characterDevelopment", name: "Character Development" },
    { key: "conflictResolution", name: "Conflict Resolution" },
  ],
  "Historical Fiction": [
    { key: "historicalAccuracy", name: "Historical Accuracy" },
    { key: "atmosphere", name: "Atmosphere" },
    { key: "characters", name: "Characters" },
    { key: "pacing", name: "Pacing" },
    { key: "prose", name: "Prose" },
  ],
  Adventure: [
    { key: "pacing", name: "Pacing" },
    { key: "excitement", name: "Excitement" },
    { key: "stakes", name: "Stakes" },
    { key: "characters", name: "Characters" },
    { key: "plotLogic", name: "Plot Logic" },
  ],
  "Children's": [
    { key: "accessibility", name: "Accessibility" },
    { key: "engagement", name: "Engagement" },
    { key: "characters", name: "Characters" },
    { key: "message", name: "Message" },
  ],
  "Young Adult": [
    { key: "voice", name: "Voice" },
    { key: "characterGrowth", name: "Character Growth" },
    { key: "pacing", name: "Pacing" },
    { key: "themes", name: "Themes" },
  ],
  Comics: [
    { key: "artwork", name: "Artwork" },
    { key: "storytelling", name: "Storytelling" },
    { key: "panelFlow", name: "Panel Flow" },
    { key: "characters", name: "Characters" },
  ],
  Manga: [
    { key: "artwork", name: "Artwork" },
    { key: "storytelling", name: "Storytelling" },
    { key: "pacing", name: "Pacing" },
    { key: "characters", name: "Characters" },
  ],
};

const NONFICTION_GENRES = [
  "History",
  "Biography & Memoir",
  "Science",
  "Philosophy",
  "Psychology",
  "Politics",
  "Religion",
  "Business",
  "Technology",
];

function seededSettings(): RatingSystemSettings {
  return {
    mode: "advanced",
    scale: 5,
    supportedScales: [5],
    allowHalfStars: true,
    calculation: {
      useCore: true,
      useGenre: true,
      useTrajectory: false,
      coreWeight: 1,
      genreWeight: 1,
      trajectoryWeight: 0,
      missingValueMode: "ignore",
      rounding: "nearest",
    },
    externalPosting: {
      providers: [
        {
          key: "hardcover",
          enabled: false,
          label: "Hardcover",
          description:
            "Publish your final rating and review to your Hardcover profile.",
        },
      ],
    },
  } satisfies RatingSystemSettings;
}

export async function seedRatings(db: Database): Promise<void> {
  const existingSettings = await db.query.systemSettings.findFirst({
    where: eq(schema.systemSettings.key, RATING_SYSTEM_SETTINGS_KEY),
  });
  if (!existingSettings) {
    const settings = seededSettings();
    await db.insert(schema.systemSettings).values({
      key: RATING_SYSTEM_SETTINGS_KEY,
      value: settings,
    });
  }

  for (const [index, dimension] of CORE_DIMENSIONS.entries()) {
    const existingCore = await db.query.bookRatingDimensions.findFirst({
      where: and(
        eq(schema.bookRatingDimensions.scope, "core"),
        eq(schema.bookRatingDimensions.key, dimension.key),
      ),
    });
    if (!existingCore) {
      await db.insert(schema.bookRatingDimensions).values({
        id: uuidv7(),
        key: dimension.key,
        scope: "core",
        name: dimension.name,
        description: dimension.description ?? null,
        enabled: true,
        displayOrder: index,
        required: false,
        contributesToRating: true,
        weight: 1,
      });
    }
  }

  const terms = await db
    .select()
    .from(schema.metadataVocabularyTerms)
    .where(eq(schema.metadataVocabularyTerms.kind, "genre"));

  const byNormalized = new Map(
    terms.map((t) => [t.normalizedName, t]),
  );

  const dimensionSets = {
    ...GENRE_DIMENSION_SETS,
    ...Object.fromEntries(
      NONFICTION_GENRES.map((name) => [name, NONFICTION_DIMENSIONS]),
    ),
  };

  let displayOrder = 0;
  for (const [genreName, dimensions] of Object.entries(dimensionSets)) {
    const term = byNormalized.get(normalizeVocabularyKey(genreName));
    if (!term) continue;
    const existing = await db.query.bookRatingGenreDefinitions.findFirst({
      where: and(
        eq(schema.bookRatingGenreDefinitions.genreTermId, term.id),
        eq(schema.bookRatingGenreDefinitions.mediaType, "books"),
      ),
    });
    const definitionId = existing?.id ?? uuidv7();
    if (!existing) {
      await db.insert(schema.bookRatingGenreDefinitions).values({
        id: definitionId,
        genreTermId: term.id,
        mediaType: "books",
        inheritanceMode: "custom",
        enabled: true,
        displayOrder,
      });
    }
    displayOrder += 1;

    for (const [index, dimension] of dimensions.entries()) {
      const existingDimension = await db.query.bookRatingDimensions.findFirst({
        where: and(
          eq(schema.bookRatingDimensions.scope, "genre"),
          eq(schema.bookRatingDimensions.genreDefinitionId, definitionId),
          eq(schema.bookRatingDimensions.key, dimension.key),
        ),
      });
      if (existingDimension) continue;
      await db.insert(schema.bookRatingDimensions).values({
        id: uuidv7(),
        key: dimension.key,
        scope: "genre",
        genreDefinitionId: definitionId,
        name: dimension.name,
        description: dimension.description ?? null,
        enabled: true,
        displayOrder: index,
        required: false,
        contributesToRating: true,
        weight: 1,
      });
    }
  }
}
