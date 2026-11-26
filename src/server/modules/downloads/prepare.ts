import type { JobService } from "../jobs/service.js";
import type { FileService } from "../files/service.js";
import type { RepresentationService } from "../representations/service.js";
import type { EpubPublicationService } from "../books/epub-publication.js";
import type { PlaybackService } from "../playback/service.js";
import type { DownloadService } from "./service.js";
import type { DownloadPreparePayload } from "../../../shared/downloads.js";

export interface DownloadPrepareJobPayload {
  downloadId: string;
  fileId: string;
  userId: string;
  representationId?: string;
  feyloreJobId: string;
}

interface ManifestLink {
  href?: string;
  children?: ManifestLink[];
  alternates?: ManifestLink[];
}

function collectHrefs(links: ManifestLink[] | undefined): string[] {
  if (!links) return [];
  const hrefs: string[] = [];
  for (const link of links) {
    if (link.href) hrefs.push(link.href);
    hrefs.push(...collectHrefs(link.children));
    hrefs.push(...collectHrefs(link.alternates));
  }
  return hrefs;
}

function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

export function collectManifestUrls(manifest: {
  readingOrder?: ManifestLink[];
  resources?: ManifestLink[];
  toc?: ManifestLink[];
}): string[] {
  return dedupeUrls([
    ...collectHrefs(manifest.readingOrder),
    ...collectHrefs(manifest.resources),
    ...collectHrefs(manifest.toc),
  ]);
}

export async function runDownloadPrepare(
  jobService: JobService,
  downloads: DownloadService,
  files: FileService,
  representations: RepresentationService,
  epubPublication: EpubPublicationService,
  playback: PlaybackService,
  payload: DownloadPrepareJobPayload,
) {
  const { downloadId, fileId, userId, representationId, feyloreJobId } =
    payload;
  const signal = jobService.registerCancellation(feyloreJobId);

  try {
    await jobService.updateStatus(feyloreJobId, "running");

    await downloads.getById(downloadId, userId);

    const file = await files.getFile(fileId);
    if (file.missingAt) {
      throw new Error("File is missing from storage");
    }

    if (jobService.isCancelled(signal)) {
      await jobService.updateStatus(feyloreJobId, "cancelled");
      await downloads.markFailed(downloadId, "Cancelled");
      return;
    }

    let rep =
      representationId != null
        ? await representations.get(representationId)
        : null;

    if (representationId != null) {
      await playback.ensureRepresentationAccess(userId, representationId);
      const fileLinks =
        await representations.listFilesForRepresentation(representationId);
      if (!fileLinks.some((l) => l.fileId === fileId)) {
        throw new Error("File is not linked to the specified representation");
      }
    } else {
      const reps = await representations.findByFileId(fileId);
      rep = reps.find((r) => r.format === "epub") ?? reps[0] ?? null;
      if (rep) {
        await playback.ensureRepresentationAccess(userId, rep.id);
      }
    }

    let preparePayload: DownloadPreparePayload;
    const bytesTotal = file.size;

    if (rep?.format === "epub") {
      const manifestUrl = `/api/v1/representations/${rep.id}/publication/manifest`;
      const baseUrl = `/api/v1/representations/${rep.id}/publication/resource`;
      const { manifest } = await epubPublication.buildManifest(fileId, baseUrl);
      const resourceUrls = collectManifestUrls(
        manifest as {
          readingOrder?: ManifestLink[];
          resources?: ManifestLink[];
          toc?: ManifestLink[];
        },
      );
      preparePayload = {
        representationId: rep.id,
        urls: dedupeUrls([manifestUrl, ...resourceUrls]),
      };
    } else {
      preparePayload = {
        representationId: rep?.id,
        urls: [`/api/v1/files/${fileId}/content`],
      };
    }

    await downloads.markInProgress(downloadId, bytesTotal, preparePayload);
    await jobService.updateStatus(feyloreJobId, "completed", {
      logExcerpt: `Prepared ${preparePayload.urls.length} URL(s) for download`,
    });
  } catch (err) {
    if (jobService.isCancelled(signal)) {
      await jobService.updateStatus(feyloreJobId, "cancelled");
    } else {
      await downloads.markFailed(
        downloadId,
        err instanceof Error ? err.message : "Unknown error",
      );
      await jobService.updateStatus(feyloreJobId, "failed", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  } finally {
    jobService.clearCancellation(feyloreJobId);
  }
}
