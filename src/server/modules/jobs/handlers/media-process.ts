import { eq } from "drizzle-orm";
import type { JobService } from "../service.js";
import type { Database } from "../../../db/client.js";
import * as schema from "../../../db/schema.js";
import { generateId } from "../../../security/crypto.js";
import { resolveMediaProcessor } from "../../playback/processors/registry.js";

export interface MediaProcessPayload {
  feyloreJobId: string;
  domain?: string;
  representationId?: string;
  fileId?: string;
}

export async function runMediaProcess(
  jobService: JobService,
  db: Database,
  payload: MediaProcessPayload,
) {
  const { feyloreJobId, domain, representationId, fileId } = payload;
  const signal = jobService.registerCancellation(feyloreJobId);

  try {
    await jobService.updateStatus(feyloreJobId, "running");

    if (jobService.isCancelled(signal)) {
      await jobService.updateStatus(feyloreJobId, "cancelled");
      return;
    }

    let representationDomainModule: string | undefined;
    if (representationId) {
      const rep = await db.query.representations.findFirst({
        where: eq(schema.representations.id, representationId),
      });
      representationDomainModule = rep?.domainModule;
    }

    const processor = resolveMediaProcessor({
      domain,
      representationDomainModule,
    });

    if (!processor) {
      await jobService.updateStatus(feyloreJobId, "failed", {
        error: "No media processor for domain",
        logExcerpt: domain
          ? `Unsupported domain: ${domain}`
          : "No media processor registered",
      });
      return;
    }

    const result = await processor.process({
      feyloreJobId,
      representationId,
      fileId,
      domain,
      db,
      signal,
    });

    if (jobService.isCancelled(signal)) {
      await jobService.updateStatus(feyloreJobId, "cancelled");
      return;
    }

    for (const entry of result.technicalMetadata ?? []) {
      await db.insert(schema.fileTechnicalMetadata).values({
        id: generateId(),
        fileId: entry.fileId,
        extractor: entry.extractor,
        payload: entry.payload,
      });
    }

    await jobService.updateStatus(feyloreJobId, "completed", {
      logExcerpt: result.logExcerpt,
    });
  } catch (err) {
    if (jobService.isCancelled(signal)) {
      await jobService.updateStatus(feyloreJobId, "cancelled");
    } else {
      await jobService.updateStatus(feyloreJobId, "failed", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  } finally {
    jobService.clearCancellation(feyloreJobId);
  }
}
