import { eq, asc, count } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import * as schema from "../../../db/schema.js";
import { generateId } from "../../../security/crypto.js";
import { NotFoundError, AppError } from "../../../../shared/errors.js";
import type {
  LiveTvPlaylistPublic,
  LiveTvChannelPublic,
  LiveTvSourceKind,
} from "../../../../shared/tv.js";
import type { PlaybackManifest } from "../../../../shared/playback.js";
import { outboundFetch } from "../../metadata/outbound-fetch.js";
import { parseM3u } from "./m3u-parser.js";

const M3U_MAX_BYTES = 5 * 1024 * 1024;

export class LiveTvService {
  constructor(private readonly db: Database) {}

  async listPlaylists(): Promise<LiveTvPlaylistPublic[]> {
    const rows = await this.db
      .select({
        playlist: schema.liveTvPlaylists,
        channelCount: count(schema.liveTvChannels.id),
      })
      .from(schema.liveTvPlaylists)
      .leftJoin(
        schema.liveTvChannels,
        eq(schema.liveTvChannels.playlistId, schema.liveTvPlaylists.id),
      )
      .groupBy(schema.liveTvPlaylists.id)
      .orderBy(asc(schema.liveTvPlaylists.name));

    return rows.map((row) => this.toPlaylistPublic(row.playlist, row.channelCount));
  }

  async createPlaylist(input: {
    name: string;
    sourceKind: LiveTvSourceKind;
    sourceUrl?: string;
    epgUrl?: string;
    sourceConfig?: Record<string, unknown>;
  }): Promise<string> {
    const id = generateId();
    await this.db.insert(schema.liveTvPlaylists).values({
      id,
      name: input.name,
      sourceKind: input.sourceKind,
      sourceUrl: input.sourceUrl,
      epgUrl: input.epgUrl,
      sourceConfig: input.sourceConfig,
    });
    return id;
  }

  async getPlaylist(id: string): Promise<LiveTvPlaylistPublic> {
    const playlist = await this.db.query.liveTvPlaylists.findFirst({
      where: eq(schema.liveTvPlaylists.id, id),
    });
    if (!playlist) throw new NotFoundError("Live TV playlist not found");

    const [{ value: channelCount }] = await this.db
      .select({ value: count(schema.liveTvChannels.id) })
      .from(schema.liveTvChannels)
      .where(eq(schema.liveTvChannels.playlistId, id));

    return this.toPlaylistPublic(playlist, channelCount);
  }

  async updatePlaylist(
    id: string,
    input: Partial<{
      name: string;
      sourceKind: LiveTvSourceKind;
      sourceUrl: string;
      epgUrl: string;
      sourceConfig: Record<string, unknown>;
    }>,
  ) {
    await this.getPlaylist(id);
    await this.db
      .update(schema.liveTvPlaylists)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.liveTvPlaylists.id, id));
  }

  async deletePlaylist(id: string) {
    await this.getPlaylist(id);
    await this.db
      .delete(schema.liveTvPlaylists)
      .where(eq(schema.liveTvPlaylists.id, id));
  }

  async listChannels(playlistId: string): Promise<LiveTvChannelPublic[]> {
    await this.getPlaylist(playlistId);
    const rows = await this.db
      .select()
      .from(schema.liveTvChannels)
      .where(eq(schema.liveTvChannels.playlistId, playlistId))
      .orderBy(
        asc(schema.liveTvChannels.sortOrder),
        asc(schema.liveTvChannels.name),
      );

    return rows.map((row) => this.toChannelPublic(row));
  }

  async createChannel(
    playlistId: string,
    input: {
      name: string;
      groupTitle?: string;
      logoUrl?: string;
      streamUrl: string;
      tvgId?: string;
      sortOrder?: number;
      enabled?: boolean;
    },
  ): Promise<string> {
    await this.getPlaylist(playlistId);
    const id = generateId();
    await this.db.insert(schema.liveTvChannels).values({
      id,
      playlistId,
      name: input.name,
      groupTitle: input.groupTitle,
      logoUrl: input.logoUrl,
      streamUrl: input.streamUrl,
      tvgId: input.tvgId,
      sortOrder: input.sortOrder ?? 0,
      enabled: input.enabled ?? true,
    });
    return id;
  }

  async getChannel(id: string): Promise<LiveTvChannelPublic> {
    const channel = await this.db.query.liveTvChannels.findFirst({
      where: eq(schema.liveTvChannels.id, id),
    });
    if (!channel) throw new NotFoundError("Live TV channel not found");
    return this.toChannelPublic(channel);
  }

  async updateChannel(
    id: string,
    input: Partial<{
      name: string;
      groupTitle: string;
      logoUrl: string;
      streamUrl: string;
      tvgId: string;
      sortOrder: number;
      enabled: boolean;
    }>,
  ) {
    await this.getChannel(id);
    await this.db
      .update(schema.liveTvChannels)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.liveTvChannels.id, id));
  }

  async deleteChannel(id: string) {
    await this.getChannel(id);
    await this.db
      .delete(schema.liveTvChannels)
      .where(eq(schema.liveTvChannels.id, id));
  }

  async getPlaybackManifest(channelId: string): Promise<PlaybackManifest> {
    const channel = await this.db.query.liveTvChannels.findFirst({
      where: eq(schema.liveTvChannels.id, channelId),
    });
    if (!channel || !channel.enabled) {
      throw new NotFoundError("Live TV channel not found");
    }

    const isHls =
      channel.streamUrl.includes(".m3u8") ||
      channel.streamUrl.includes("m3u8?");

    return {
      subject: { type: "live_tv_channel", id: channel.id },
      representationId: channel.id,
      title: channel.name,
      subtitle: channel.groupTitle ?? undefined,
      artworkUrl: channel.logoUrl ?? undefined,
      mediaKind: "video",
      sources: [
        {
          fileId: channel.id,
          url: channel.streamUrl,
          mimeType: isHls ? "application/vnd.apple.mpegurl" : undefined,
        },
      ],
      sessionMode: "persistent",
    };
  }

  async syncPlaylist(playlistId: string): Promise<number> {
    const playlist = await this.db.query.liveTvPlaylists.findFirst({
      where: eq(schema.liveTvPlaylists.id, playlistId),
    });
    if (!playlist) throw new NotFoundError("Live TV playlist not found");

    if (playlist.sourceKind !== "m3u") {
      throw new AppError(
        "LIVE_TV_SYNC_UNSUPPORTED",
        "Only M3U playlists can be synced",
        400,
      );
    }
    if (!playlist.sourceUrl) {
      throw new AppError(
        "LIVE_TV_SOURCE_MISSING",
        "Playlist has no source URL configured",
        400,
      );
    }

    await this.db
      .update(schema.liveTvPlaylists)
      .set({ syncInProgress: true, lastError: null, updatedAt: new Date() })
      .where(eq(schema.liveTvPlaylists.id, playlistId));

    try {
      const { status, body } = await outboundFetch(playlist.sourceUrl, {
        maxBytes: M3U_MAX_BYTES,
      });
      if (status < 200 || status >= 300) {
        throw new Error(`HTTP ${status}`);
      }

      const entries = parseM3u(body);
      await this.db
        .delete(schema.liveTvChannels)
        .where(eq(schema.liveTvChannels.playlistId, playlistId));

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        await this.db.insert(schema.liveTvChannels).values({
          id: generateId(),
          playlistId,
          name: entry.name,
          groupTitle: entry.groupTitle,
          logoUrl: entry.logoUrl,
          streamUrl: entry.streamUrl,
          tvgId: entry.tvgId,
          sortOrder: i,
          enabled: true,
        });
      }

      await this.db
        .update(schema.liveTvPlaylists)
        .set({
          syncInProgress: false,
          lastSyncedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.liveTvPlaylists.id, playlistId));

      return entries.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      await this.db
        .update(schema.liveTvPlaylists)
        .set({
          syncInProgress: false,
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(schema.liveTvPlaylists.id, playlistId));
      throw err;
    }
  }

  private toPlaylistPublic(
    playlist: typeof schema.liveTvPlaylists.$inferSelect,
    channelCount: number,
  ): LiveTvPlaylistPublic {
    return {
      id: playlist.id,
      name: playlist.name,
      sourceKind: playlist.sourceKind as LiveTvSourceKind,
      epgUrl: playlist.epgUrl,
      syncInProgress: playlist.syncInProgress,
      lastSyncedAt: playlist.lastSyncedAt?.toISOString() ?? null,
      lastError: playlist.lastError,
      channelCount,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString(),
    };
  }

  private toChannelPublic(
    channel: typeof schema.liveTvChannels.$inferSelect,
  ): LiveTvChannelPublic {
    return {
      id: channel.id,
      playlistId: channel.playlistId,
      name: channel.name,
      groupTitle: channel.groupTitle,
      logoUrl: channel.logoUrl,
      tvgId: channel.tvgId,
      sortOrder: channel.sortOrder,
      enabled: channel.enabled,
    };
  }
}
