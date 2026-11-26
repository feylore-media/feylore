import { eq, and, isNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import type { MetadataProviderRegistry } from "./registry.js";
import { getMetadataSourceCategory } from "../../../shared/metadata-source-category.js";
import type { MetadataFetchContext } from "../../../shared/metadata-contract/index.js";
import type { MetadataSourceDescriptor } from "../../../shared/metadata-contract/index.js";
import type { MediaModuleId } from "../../../shared/media-modules.js";
import {
  resolveEditionFormatPreference,
} from "../../../shared/metadata-edition-preference.js";
import { readConfiguredEditionFormatPreference } from "./edition-preference.js";
import {
  decryptConfig,
  encryptConfig,
} from "../../security/secrets.js";
import type {
  ConnectionStatus,
  SourceAvailabilityStatus,
} from "../../../shared/metadata-settings.js";

export class MetadataService {
  private connectionCache = new Map<
    string,
    { status: ConnectionStatus; message?: string; at: number }
  >();

  constructor(
    private readonly db: Database,
    private readonly registry: MetadataProviderRegistry,
    private readonly encryptionSecret: string,
  ) {}

  async listProviders() {
    return this.db
      .select({
        id: schema.metadataProviders.id,
        key: schema.metadataProviders.key,
        contractVersion: schema.metadataProviders.contractVersion,
        enabled: schema.metadataProviders.enabled,
        hasConfig: schema.metadataProviders.configEncrypted,
      })
      .from(schema.metadataProviders);
  }

  async getProviderRow(key: string) {
    return this.db.query.metadataProviders.findFirst({
      where: eq(schema.metadataProviders.key, key),
    });
  }

  async upsertProvider(input: {
    key: string;
    contractVersion: string;
    enabled?: boolean;
    configEncrypted?: string;
  }) {
    const existing = await this.db.query.metadataProviders.findFirst({
      where: eq(schema.metadataProviders.key, input.key),
    });
    if (existing) {
      await this.db
        .update(schema.metadataProviders)
        .set({
          enabled: input.enabled ?? existing.enabled,
          configEncrypted: input.configEncrypted ?? existing.configEncrypted,
          updatedAt: new Date(),
        })
        .where(eq(schema.metadataProviders.id, existing.id));
      return existing.id;
    }
    const id = generateId();
    await this.db.insert(schema.metadataProviders).values({
      id,
      key: input.key,
      contractVersion: input.contractVersion,
      enabled: input.enabled ?? false,
      configEncrypted: input.configEncrypted,
    });
    return id;
  }

  async getEnabledProviderKeys(): Promise<string[]> {
    const rows = await this.db
      .select({ key: schema.metadataProviders.key })
      .from(schema.metadataProviders)
      .where(eq(schema.metadataProviders.enabled, true));
    return rows.map((r) => r.key);
  }

  async getEnabledProviderKeysForModule(
    mediaModule: MediaModuleId,
  ): Promise<string[]> {
    const enabled = await this.getEnabledProviderKeys();
    return enabled.filter((key) => {
      const d = this.registry.getDescriptor(key);
      if (!d?.mediaModules.includes(mediaModule)) return false;
      if (d.implemented === false) return false;
      return getMetadataSourceCategory(d) === "provider";
    });
  }

  decryptProviderConfig(encrypted: string | null | undefined) {
    if (!encrypted) return undefined;
    try {
      return decryptConfig(this.encryptionSecret, encrypted);
    } catch {
      try {
        return JSON.parse(
          Buffer.from(encrypted, "base64").toString("utf8"),
        ) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    }
  }

  encryptProviderConfig(config: Record<string, unknown>): string {
    return encryptConfig(this.encryptionSecret, config);
  }

  async loadProviderConfigs(): Promise<Map<string, Record<string, unknown>>> {
    const rows = await this.listProviders();
    const configs = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (!row.hasConfig) continue;
      const config = this.decryptProviderConfig(row.hasConfig);
      if (config) configs.set(row.key, config);
    }
    return configs;
  }

  getAvailabilityStatus(
    descriptor: MetadataSourceDescriptor,
    enabled: boolean,
    configured: boolean,
  ): SourceAvailabilityStatus {
    if (descriptor.implemented === false) return "not_implemented";
    const requiresConfig = descriptor.configSchema?.some((f) => f.required);
    if (requiresConfig && !configured) return "configuration_required";
    if (configured) return "configured";
    if (enabled) return "available";
    return "available";
  }

  getConnectionStatus(key: string): ConnectionStatus {
    const cached = this.connectionCache.get(key);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
      return cached.status;
    }
    return "unknown";
  }

  setConnectionStatus(
    key: string,
    status: ConnectionStatus,
    message?: string,
  ): void {
    this.connectionCache.set(key, { status, message, at: Date.now() });
  }

  async listProvidersWithDescriptors(mediaModule?: MediaModuleId) {
    const dbRows = await this.listProviders();
    const dbByKey = new Map(dbRows.map((r) => [r.key, r]));
    const descriptors = this.registry.listDescriptors(mediaModule);

    return descriptors.map((descriptor) => {
      const row = dbByKey.get(descriptor.id);
      const enabled = row?.enabled ?? false;
      const configured = !!row?.hasConfig;
      return {
        key: descriptor.id,
        name: descriptor.name,
        sourceType: descriptor.sourceType,
        sourceCategory: getMetadataSourceCategory(descriptor),
        mediaModules: descriptor.mediaModules,
        fields: descriptor.fields,
        region: descriptor.region,
        configSchema: descriptor.configSchema,
        enabled,
        configured,
        implemented: descriptor.implemented !== false,
        availabilityStatus: this.getAvailabilityStatus(
          descriptor,
          enabled,
          configured,
        ),
        connectionStatus: this.getConnectionStatus(descriptor.id),
        contractVersion: row?.contractVersion ?? "feylore.metadata.provider.v1",
      };
    });
  }

  async testProviderConnection(
    key: string,
    configOverride?: Record<string, unknown>,
  ) {
    const provider = this.registry.get(key);
    if (!provider?.testConnection) {
      if (provider?.descriptor.implemented === false) {
        return { ok: false, message: "Not yet implemented" };
      }
      return { ok: true, message: "No connection test required" };
    }
    const row = await this.getProviderRow(key);
    const stored = this.decryptProviderConfig(row?.configEncrypted) ?? {};
    const config = configOverride
      ? { ...stored, ...configOverride }
      : stored;
    const result = await provider.testConnection(config);
    this.setConnectionStatus(
      key,
      result.ok ? "connected" : "error",
      result.message,
    );
    return result;
  }

  async storeRecord(input: {
    providerKey: string;
    externalId?: string;
    subjectType?: string;
    subjectId?: string;
    payload: Record<string, unknown>;
  }) {
    const subjectConditions = [
      eq(schema.metadataRecords.providerKey, input.providerKey),
      input.subjectType
        ? eq(schema.metadataRecords.subjectType, input.subjectType)
        : isNull(schema.metadataRecords.subjectType),
      input.subjectId
        ? eq(schema.metadataRecords.subjectId, input.subjectId)
        : isNull(schema.metadataRecords.subjectId),
    ];

    const existing = await this.db.query.metadataRecords.findFirst({
      where: and(...subjectConditions),
    });

    if (existing) {
      await this.db
        .update(schema.metadataRecords)
        .set({
          externalId: input.externalId ?? existing.externalId,
          payload: input.payload,
          fetchedAt: new Date(),
        })
        .where(eq(schema.metadataRecords.id, existing.id));
      return existing.id;
    }

    const id = generateId();
    await this.db.insert(schema.metadataRecords).values({
      id,
      providerKey: input.providerKey,
      externalId: input.externalId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      payload: input.payload,
    });
    return id;
  }

  async setOverride(input: {
    subjectType: string;
    subjectId: string;
    field: string;
    value: unknown;
    userId: string;
  }) {
    const existing = await this.db.query.fieldOverrides.findFirst({
      where: and(
        eq(schema.fieldOverrides.subjectType, input.subjectType),
        eq(schema.fieldOverrides.subjectId, input.subjectId),
        eq(schema.fieldOverrides.field, input.field),
      ),
    });
    if (existing) {
      await this.db
        .update(schema.fieldOverrides)
        .set({ value: input.value, setByUserId: input.userId })
        .where(eq(schema.fieldOverrides.id, existing.id));
    } else {
      await this.db.insert(schema.fieldOverrides).values({
        id: generateId(),
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        field: input.field,
        value: input.value,
        setByUserId: input.userId,
      });
    }
  }

  async getOverrides(subjectType: string, subjectId: string) {
    return this.db
      .select()
      .from(schema.fieldOverrides)
      .where(
        and(
          eq(schema.fieldOverrides.subjectType, subjectType),
          eq(schema.fieldOverrides.subjectId, subjectId),
        ),
      );
  }

  async clearOverride(
    subjectType: string,
    subjectId: string,
    field: string,
  ) {
    await this.db
      .delete(schema.fieldOverrides)
      .where(
        and(
          eq(schema.fieldOverrides.subjectType, subjectType),
          eq(schema.fieldOverrides.subjectId, subjectId),
          eq(schema.fieldOverrides.field, field),
        ),
      );
  }

  async refreshMetadata(
    subjectType: string,
    subjectId: string,
    context: MetadataFetchContext,
    mediaModule: MediaModuleId = "books",
  ) {
    const fetchContext = await this.buildFetchContext(context, mediaModule);
    const enabledKeys = await this.getEnabledProviderKeysForModule(mediaModule);
    const configs = await this.loadProviderConfigs();
    const results = await this.registry.fetchFromEnabled(
      enabledKeys,
      fetchContext,
      configs,
    );
    const overrides = await this.getOverrides(subjectType, subjectId);
    const overriddenFields = new Set(overrides.map((o) => o.field));

    for (const result of results) {
      const payload = { ...result.payload };
      for (const field of overriddenFields) {
        delete payload[field];
      }
      if (Object.keys(payload).length > 0) {
        await this.storeRecord({
          providerKey: result.providerKey,
          externalId: result.externalId,
          subjectType,
          subjectId,
          payload,
        });
      }
    }
    return results;
  }

  async fetchForSubject(
    context: MetadataFetchContext,
    mediaModule: MediaModuleId = "books",
  ) {
    const fetchContext = await this.buildFetchContext(context, mediaModule);
    const enabledKeys = await this.getEnabledProviderKeysForModule(mediaModule);
    const configs = await this.loadProviderConfigs();
    return this.registry.fetchFromEnabled(enabledKeys, fetchContext, configs);
  }

  private async buildFetchContext(
    context: MetadataFetchContext,
    mediaModule: MediaModuleId,
  ): Promise<MetadataFetchContext> {
    let editionFormatPreference = context.editionFormatPreference;
    if (!editionFormatPreference && context.userId) {
      const configured = await readConfiguredEditionFormatPreference(
        this.db,
        context.userId,
      );
      editionFormatPreference = resolveEditionFormatPreference(
        mediaModule,
        configured,
      );
    } else if (!editionFormatPreference) {
      editionFormatPreference = resolveEditionFormatPreference(mediaModule);
    }

    return {
      ...context,
      mediaModule,
      editionFormatPreference,
    };
  }

  async storeTechnicalMetadata(
    fileId: string,
    extractor: string,
    payload: Record<string, unknown>,
  ) {
    const existing = await this.db.query.fileTechnicalMetadata.findFirst({
      where: and(
        eq(schema.fileTechnicalMetadata.fileId, fileId),
        eq(schema.fileTechnicalMetadata.extractor, extractor),
      ),
    });

    if (existing) {
      await this.db
        .update(schema.fileTechnicalMetadata)
        .set({ payload, extractedAt: new Date() })
        .where(eq(schema.fileTechnicalMetadata.id, existing.id));
      return existing.id;
    }

    const id = generateId();
    await this.db.insert(schema.fileTechnicalMetadata).values({
      id,
      fileId,
      extractor,
      payload,
    });
    return id;
  }

  async storeExtractorRecord(input: {
    providerKey: string;
    subjectType: string;
    subjectId: string;
    payload: Record<string, unknown>;
    externalId?: string;
  }) {
    await this.storeRecord({
      providerKey: input.providerKey,
      externalId: input.externalId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      payload: input.payload,
    });
  }
}
