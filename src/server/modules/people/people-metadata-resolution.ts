import type { MetadataService } from "../metadata/service.js";
import type { MetadataPolicyService } from "../metadata/policy.js";
import type { PeopleService } from "./service.js";

export interface PersonMetadataResolutionInput {
  personId: string;
  userId?: string;
}

export interface PersonMetadataResolutionResult {
  log: string[];
  providerCount: number;
}

export async function runPersonMetadataResolution(
  metadata: MetadataService,
  metadataPolicy: MetadataPolicyService,
  people: PeopleService,
  input: PersonMetadataResolutionInput,
): Promise<PersonMetadataResolutionResult> {
  const log: string[] = [];
  const person = await people.getPersonRow(input.personId);
  if (!person) throw new Error("Person not found");

  const hints: Record<string, unknown> = {};
  if (person.name) hints.name = person.name;

  const identifiers = await people.listPersonProviderIdentifiers(input.personId);
  const wikidata = identifiers.find((identifier) => identifier.provider === "wikidata");
  if (wikidata) hints.qid = wikidata.identifier;

  const matchingRules = await metadataPolicy.getMatchingRules("people");

  try {
    const results = await metadata.refreshMetadata(
      "person",
      input.personId,
      {
        subjectType: "person",
        subjectId: input.personId,
        hints,
        userId: input.userId,
        matchingRules,
        mediaModule: "people",
      },
      "people",
    );
    if (results.length > 0) log.push(`providers:${results.length}`);
    return { log, providerCount: results.length };
  } catch (err) {
    log.push(
      `providers-failed:${err instanceof Error ? err.message : "unknown"}`,
    );
    return { log, providerCount: 0 };
  }
}