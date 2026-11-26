export {
  createPendingIdentityFields,
  slugifyTitle,
  looksLikeMediaId,
  pickAvailableSlug,
  slugCollisionCandidates,
} from "../../../shared/media-identity.js";

export {
  generateEntityId,
  generateUniqueEntityId,
} from "./generate-entity-id.js";

export {
  allocateCanonicalSlugFromTitle,
  type SlugTakenFn,
} from "./allocate-slug.js";
