import path from "node:path";
import type { ProcessingModuleId } from "../../../../shared/processing-policy.js";
import type { ProcessingTemplateMetadata } from "../../../../shared/processing-templates.js";
import type { ProcessingPolicyResolver } from "../../processing/policy-resolver.js";
import type { FileService } from "../../files/service.js";
import type { RepresentationService } from "../../representations/service.js";
import { buildInPlaceDestinationPath } from "../organizers/books.js";
import { IngestFileLifecycle } from "../file-lifecycle.js";
import type { IngestContext, OrganizationResult } from "../domain-processor.js";

export async function organizeIngestFile(params: {
  ctx: IngestContext;
  moduleId: ProcessingModuleId;
  processingPolicyResolver: ProcessingPolicyResolver;
  files: FileService;
  representations: RepresentationService;
  fileLifecycle: IngestFileLifecycle;
  libraryStorageLocationId: string;
  metadata: ProcessingTemplateMetadata;
  originalFilename: string;
}): Promise<OrganizationResult> {
  const {
    ctx,
    moduleId,
    processingPolicyResolver,
    files,
    representations,
    fileLifecycle,
    libraryStorageLocationId,
    metadata,
    originalFilename,
  } = params;

  if (!ctx.fileId || !ctx.representationId) {
    throw new Error("Missing file or representation for organization");
  }

  const processingPolicy =
    await processingPolicyResolver.getPolicyForModule(moduleId);

  const sourceFile = await files.getFile(ctx.fileId);
  const sourceAdapter = files
    .getStorageService()
    .getAdapter(sourceFile.storageLocationId);
  const destAdapter = files
    .getStorageService()
    .getAdapter(libraryStorageLocationId);

  const ext = path.extname(originalFilename).replace(/^\./, "") || "bin";

  const destRelative = processingPolicy.fileOperations.organizeIntoLibrary
    ? processingPolicyResolver.buildOrganizePath({
        moduleId,
        policy: processingPolicy,
        metadata,
        originalFilename,
        extension: ext,
      })
    : buildInPlaceDestinationPath(originalFilename);

  const sameLocation = sourceFile.storageLocationId === libraryStorageLocationId;

  if (sameLocation && sourceFile.relativePath === destRelative) {
    return {
      destinationRelativePath: destRelative,
      fileId: ctx.fileId,
      log: ["already-at-destination"],
    };
  }

  await fileLifecycle.verifySource(
    sourceAdapter,
    sourceFile.relativePath,
    sourceFile.size,
    sourceFile.checksum ?? undefined,
  );

  const commit = await fileLifecycle.moveToDestination(
    sourceAdapter,
    destAdapter,
    sourceFile.relativePath,
    destRelative,
    sameLocation,
  );

  await fileLifecycle.retireSource(
    sourceAdapter,
    sourceFile.relativePath,
    commit,
  );

  let resultFileId = ctx.fileId;

  if (sameLocation) {
    await files.updateFilePath(ctx.fileId, destRelative, {
      checksum: commit.checksum,
      size: commit.size,
    });
  } else {
    const newFileId = await files.registerFileAtLocation({
      storageLocationId: libraryStorageLocationId,
      relativePath: destRelative,
      size: commit.size,
      checksum: commit.checksum,
      mediaType: sourceFile.mediaType ?? undefined,
    });
    await representations.relinkContentFile(
      ctx.representationId,
      ctx.fileId,
      newFileId,
    );
    await files.removeFileRecord(ctx.fileId);
    resultFileId = newFileId;
  }

  return {
    destinationRelativePath: destRelative,
    fileId: resultFileId,
    log: [`organized-to:${destRelative}`],
  };
}
