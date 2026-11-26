import { eq, and } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { NotFoundError, ForbiddenError, ValidationError } from "../../../shared/errors.js";
import type {
  DownloadPreparePayload,
  DownloadPublic,
} from "../../../shared/downloads.js";

export interface DownloadEnrichment {
  title?: string | null;
  format?: string | null;
  representationId?: string | null;
}

export class DownloadService {
  constructor(private readonly db: Database) {}

  async listForUser(userId: string) {
    return this.db
      .select()
      .from(schema.downloads)
      .where(eq(schema.downloads.userId, userId));
  }

  async getById(id: string, userId: string) {
    const download = await this.db.query.downloads.findFirst({
      where: eq(schema.downloads.id, id),
    });
    if (!download || download.userId !== userId) {
      throw new NotFoundError();
    }
    return download;
  }

  async create(userId: string, fileId: string, deviceId?: string) {
    const id = generateId();
    await this.db.insert(schema.downloads).values({
      id,
      userId,
      fileId,
      deviceId,
      status: "queued",
    });
    return id;
  }

  async markInProgress(
    id: string,
    bytesTotal?: number,
    preparePayload?: DownloadPreparePayload,
  ) {
    await this.db
      .update(schema.downloads)
      .set({
        status: "in_progress",
        bytesTotal,
        preparePayload,
        updatedAt: new Date(),
      })
      .where(eq(schema.downloads.id, id));
  }

  async updateProgress(id: string, bytesDownloaded: number) {
    await this.db
      .update(schema.downloads)
      .set({ bytesDownloaded, updatedAt: new Date() })
      .where(eq(schema.downloads.id, id));
  }

  async markAvailable(id: string, bytesTotal?: number) {
    await this.db
      .update(schema.downloads)
      .set({
        status: "available",
        bytesTotal,
        updatedAt: new Date(),
      })
      .where(eq(schema.downloads.id, id));
  }

  async markFailed(id: string, _error?: string) {
    await this.db
      .update(schema.downloads)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(schema.downloads.id, id));
  }

  async patchForUser(
    id: string,
    userId: string,
    update: { bytesDownloaded?: number; status?: "available" },
  ) {
    const download = await this.getById(id, userId);
    if (update.bytesDownloaded != null) {
      if (download.status !== "in_progress" && download.status !== "queued") {
        throw new ValidationError("Cannot update progress for this download");
      }
      await this.updateProgress(id, update.bytesDownloaded);
    }
    if (update.status === "available") {
      if (download.status !== "in_progress") {
        throw new ValidationError("Download must be in progress to complete");
      }
      await this.markAvailable(id, download.bytesTotal ?? undefined);
    }
    return this.getById(id, userId);
  }

  async remove(id: string, userId: string) {
    const download = await this.getById(id, userId);
    await this.db
      .update(schema.downloads)
      .set({ status: "removed", updatedAt: new Date() })
      .where(eq(schema.downloads.id, id));
    return download;
  }

  async resolveEnrichment(fileId: string): Promise<DownloadEnrichment> {
    const links = await this.db
      .select({ representation: schema.representations })
      .from(schema.representationFiles)
      .innerJoin(
        schema.representations,
        eq(
          schema.representationFiles.representationId,
          schema.representations.id,
        ),
      )
      .where(eq(schema.representationFiles.fileId, fileId));

    if (links.length === 0) return {};

    const rep = links[0]!.representation;
    let title: string | null = null;

    if (rep.manifestationId) {
      const manifestation =
        await this.db.query.creativeWorkManifestations.findFirst({
          where: eq(schema.creativeWorkManifestations.id, rep.manifestationId),
        });
      if (manifestation) {
        const expression =
          await this.db.query.creativeWorkExpressions.findFirst({
            where: eq(
              schema.creativeWorkExpressions.id,
              manifestation.expressionId,
            ),
          });
        if (expression?.workType === "book") {
          const book = await this.db.query.books.findFirst({
            where: eq(schema.books.id, expression.workId),
          });
          title = book?.title ?? null;
        } else if (expression?.workType === "audiobook") {
          const audiobook = await this.db.query.audiobooks.findFirst({
            where: eq(schema.audiobooks.id, expression.workId),
          });
          title = audiobook?.title ?? null;
        }
      }
    }

    if (!title) {
      const track = await this.db.query.musicTracks.findFirst({
        where: eq(schema.musicTracks.representationId, rep.id),
      });
      if (track) {
        const album = await this.db.query.albums.findFirst({
          where: eq(schema.albums.id, track.albumId),
        });
        title = album
          ? `${track.title} — ${album.title}`
          : track.title;
      }
    }

    return {
      title,
      format: rep.format,
      representationId: rep.id,
    };
  }

  toPublic(
    d: typeof schema.downloads.$inferSelect,
    enrichment?: DownloadEnrichment,
  ): DownloadPublic {
    return {
      id: d.id,
      fileId: d.fileId,
      deviceId: d.deviceId,
      status: d.status,
      bytesTotal: d.bytesTotal ?? null,
      bytesDownloaded: d.bytesDownloaded ?? null,
      preparePayload: d.preparePayload ?? null,
      createdAt: d.createdAt.toISOString(),
      title: enrichment?.title,
      format: enrichment?.format,
      representationId: enrichment?.representationId,
    };
  }
}

export class DeviceService {
  constructor(private readonly db: Database) {}

  async listForUser(userId: string) {
    return this.db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.userId, userId));
  }

  async getForUser(deviceId: string, userId: string) {
    const device = await this.db.query.devices.findFirst({
      where: and(
        eq(schema.devices.id, deviceId),
        eq(schema.devices.userId, userId),
      ),
    });
    if (!device) throw new NotFoundError("Device not found");
    return device;
  }

  async register(userId: string, name: string, userAgent?: string) {
    const id = generateId();
    await this.db.insert(schema.devices).values({
      id,
      userId,
      name,
      userAgent,
    });
    return id;
  }

  async touch(id: string) {
    await this.db
      .update(schema.devices)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.devices.id, id));
  }

  async update(
    deviceId: string,
    userId: string,
    input: { name?: string; settingsJson?: Record<string, unknown> },
  ) {
    const device = await this.getForUser(deviceId, userId);
    const updates: Partial<typeof schema.devices.$inferInsert> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.settingsJson !== undefined) updates.settingsJson = input.settingsJson;
    if (Object.keys(updates).length === 0) return device;

    await this.db
      .update(schema.devices)
      .set(updates)
      .where(eq(schema.devices.id, device.id));
    return this.getForUser(deviceId, userId);
  }

  async updateState(
    deviceId: string,
    userId: string,
    stateJson: Record<string, unknown>,
  ) {
    await this.getForUser(deviceId, userId);
    await this.db
      .update(schema.devices)
      .set({ stateJson })
      .where(eq(schema.devices.id, deviceId));
    return this.getForUser(deviceId, userId);
  }

  async revoke(id: string, userId: string) {
    const device = await this.getForUser(id, userId);
    await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.deviceId, device.id));
    await this.db.delete(schema.devices).where(eq(schema.devices.id, id));
  }

  toPublic(d: typeof schema.devices.$inferSelect) {
    return {
      id: d.id,
      name: d.name,
      userAgent: d.userAgent,
      settingsJson: d.settingsJson ?? {},
      stateJson: d.stateJson ?? {},
      lastSeenAt: d.lastSeenAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
    };
  }

  toPublicSummary(d: typeof schema.devices.$inferSelect) {
    return {
      id: d.id,
      name: d.name,
      userAgent: d.userAgent,
      settingsJson: d.settingsJson ?? {},
      lastSeenAt: d.lastSeenAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
    };
  }
}
