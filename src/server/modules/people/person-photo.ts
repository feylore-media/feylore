import { outboundFetchBuffer } from "../metadata/outbound-fetch.js";
import type { FileService } from "../files/service.js";
import type { MetadataProvenanceService } from "../metadata/provenance.js";
import type { PeopleService } from "./service.js";
import { NotFoundError, ValidationError } from "../../../shared/errors.js";
import { FEYLORE_SOURCE_KEY } from "../../../shared/metadata-source-category.js";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_TIMEOUT_MS = 20_000;

function extensionFor(mediaType: string): string {
  switch (mediaType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return ".jpg";
  }
}

export interface AdoptPersonPhotoInput {
  personId: string;
  url: string;
  sourceKey: string;
  userId?: string;
}

export async function adoptPersonPhoto(
  people: PeopleService,
  files: FileService,
  provenance: MetadataProvenanceService,
  input: AdoptPersonPhotoInput,
): Promise<{ fileId: string }> {
  const person = await people.getPersonRow(input.personId);
  if (!person) throw new NotFoundError("People entity not found");

  const { data, mediaType } = await outboundFetchBuffer(input.url, {
    maxBytes: MAX_PHOTO_BYTES,
    maxRedirects: 5,
    timeoutMs: PHOTO_TIMEOUT_MS,
  });

  const resolvedType =
    mediaType && mediaType !== "application/octet-stream"
      ? mediaType
      : undefined;
  if (resolvedType && !ALLOWED_PHOTO_TYPES.includes(resolvedType)) {
    throw new ValidationError(`Unsupported image type: ${resolvedType}`);
  }

  const storageLocationId = await files.getManagedStorageLocationId();
  if (!storageLocationId) {
    throw new ValidationError("No managed storage location is available");
  }

  const finalType = resolvedType ?? "image/jpeg";
  const relativePath = `people/${person.slug}/photo${extensionFor(finalType)}`;
  const fileId = await files.storeDerivedFile({
    storageLocationId,
    relativePath,
    data,
    mediaType: finalType,
  });

  await people.updatePersonFields(input.personId, { photoFileId: fileId });

  const isFeylore = input.sourceKey === FEYLORE_SOURCE_KEY;
  await provenance.upsertProvenance({
    subjectType: "person",
    subjectId: input.personId,
    field: "photo",
    sourceKey: input.sourceKey,
    sourceCategory: isFeylore ? "canonical" : "provider",
    origin: isFeylore ? "edit" : "adopt",
    userId: input.userId,
  });

  return { fileId };
}