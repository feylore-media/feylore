import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  createDefaultPolicy,
  getProcessingModuleDefinition,
  isProcessingModuleId,
  normalizePolicy,
  patchProcessingPolicySchema,
  PROCESSING_MODULES,
  PROCESSING_TEMPLATE_FIELDS,
  resolveEnabledProcessingModules,
  type ModuleProcessingPolicy,
  type ProcessingModuleId,
} from "../../../shared/processing-policy.js";
import {
  renderPathTemplate,
  renderTitleTemplate,
  SAMPLE_METADATA,
  validateTemplateFields,
  type ProcessingTemplateMetadata,
} from "../../../shared/processing-templates.js";
import { ValidationError } from "../../../shared/errors.js";
import type { SystemSettingsService } from "../settings/system-service.js";
import type { FileService } from "../files/service.js";
import { archiveOriginalToTarGz } from "../ingest/original-retention.js";
import {
  ProcessingDestinationResolver,
  type StorageLocationInfo,
} from "./destination-resolver.js";

const PROCESSING_POLICIES_KEY = "processing.policies";

export interface ProcessingModuleCapabilities {
  ingestAvailable: boolean;
  conversionAvailable: boolean;
  archiveAvailable: boolean;
  readAlongAvailable: boolean;
}

export interface ProcessingModuleView {
  moduleId: ProcessingModuleId;
  name: string;
  i18nKey: string;
  policy: ModuleProcessingPolicy;
  templateFields: readonly string[];
  destination: ReturnType<ProcessingDestinationResolver["resolveModuleDestination"]>;
  archiveDestination: ReturnType<
    ProcessingDestinationResolver["resolveArchiveDestination"]
  > | null;
  capabilities: ProcessingModuleCapabilities;
}

export class ProcessingPolicyService {
  private readonly destinationResolver = new ProcessingDestinationResolver();

  constructor(
    private readonly db: Database,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  async getPoliciesRecord(): Promise<
    Partial<Record<ProcessingModuleId, ModuleProcessingPolicy>>
  > {
    const row = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, PROCESSING_POLICIES_KEY),
    });
    const raw = row?.value as
      | { policies?: Partial<Record<string, ModuleProcessingPolicy>> }
      | undefined;
    return (raw?.policies ?? {}) as Partial<
      Record<ProcessingModuleId, ModuleProcessingPolicy>
    >;
  }

  private async savePoliciesRecord(
    policies: Record<ProcessingModuleId, ModuleProcessingPolicy>,
  ): Promise<void> {
    const existing = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, PROCESSING_POLICIES_KEY),
    });
    const value = { policies };
    if (existing) {
      await this.db
        .update(schema.systemSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(schema.systemSettings.key, PROCESSING_POLICIES_KEY));
    } else {
      await this.db.insert(schema.systemSettings).values({
        key: PROCESSING_POLICIES_KEY,
        value,
      });
    }
  }

  async getPolicy(moduleId: ProcessingModuleId): Promise<ModuleProcessingPolicy> {
    const record = await this.getPoliciesRecord();
    return normalizePolicy(moduleId, record[moduleId]);
  }

  async getAllPolicies(): Promise<
    Record<ProcessingModuleId, ModuleProcessingPolicy>
  > {
    const record = await this.getPoliciesRecord();
    const result = {} as Record<ProcessingModuleId, ModuleProcessingPolicy>;
    for (const mod of PROCESSING_MODULES) {
      result[mod.id] = normalizePolicy(mod.id, record[mod.id]);
    }
    return result;
  }

  private validatePolicyPatch(
    moduleId: ProcessingModuleId,
    patch: Partial<ModuleProcessingPolicy>,
  ): void {
    if (patch.readAlong !== undefined && moduleId !== "books") {
      throw new ValidationError(
        "readAlong is only supported for the books module",
      );
    }

    const current = createDefaultPolicy(moduleId);
    const merged = normalizePolicy(moduleId, {
      ...current,
      ...patch,
      fileOperations: { ...current.fileOperations, ...patch.fileOperations },
      conversion: { ...current.conversion, ...patch.conversion },
      originalRetention: {
        ...current.originalRetention,
        ...patch.originalRetention,
      },
    });

    for (const [label, template] of [
      ["titleTemplate", merged.titleTemplate],
      ["pathTemplate", merged.pathTemplate],
    ] as const) {
      const fieldError = validateTemplateFields(moduleId, template);
      if (fieldError) {
        throw new ValidationError(`${label}: ${fieldError}`);
      }
    }

    const titlePreview = renderTitleTemplate(
      merged.titleTemplate,
      SAMPLE_METADATA[moduleId],
      moduleId,
      "epub",
    );
    if (!titlePreview || titlePreview === "Untitled.epub") {
      if (!merged.titleTemplate.includes("{Title}")) {
        // allow templates without title if other fields present
      }
    }
  }

  async updatePolicy(
    moduleId: ProcessingModuleId,
    patch: unknown,
  ): Promise<ModuleProcessingPolicy> {
    if (!isProcessingModuleId(moduleId)) {
      throw new ValidationError("Invalid processing module");
    }
    const parsed = patchProcessingPolicySchema.parse(patch);
    this.validatePolicyPatch(moduleId, parsed);

    const record = await this.getPoliciesRecord();
    const updated = normalizePolicy(moduleId, {
      ...record[moduleId],
      ...parsed,
    });

    const all = await this.getAllPolicies();
    all[moduleId] = updated;
    await this.savePoliciesRecord(all);
    await this.syncLibraryPolicy(moduleId, updated);
    return updated;
  }

  private async syncLibraryPolicy(
    moduleId: ProcessingModuleId,
    policy: ModuleProcessingPolicy,
  ): Promise<void> {
    const contentTypeMap: Partial<
      Record<ProcessingModuleId, "book" | "audiobook" | "music" | "movies" | "tv">
    > = {
      books: "book",
      comics: "book",
      audiobooks: "audiobook",
      music: "music",
      movies: "movies",
      tv: "tv",
    };
    const contentType = contentTypeMap[moduleId];
    if (!contentType) return;

    const libraries = await this.db
      .select()
      .from(schema.libraries)
      .where(eq(schema.libraries.contentType, contentType));

    const target = libraries[0];
    if (!target) return;

    await this.db
      .update(schema.libraries)
      .set({
        organizationPolicy: {
          mode: policy.fileOperations.organizeIntoLibrary
            ? "managed"
            : "in_place",
          template: policy.pathTemplate,
        },
        normalizationPolicy:
          moduleId === "books" && policy.conversion.enabled
            ? { epub: { enabled: true, target: "epub-3.3" } }
            : { epub: { enabled: false, target: "epub-3.3" } },
        updatedAt: new Date(),
      })
      .where(eq(schema.libraries.id, target.id));
  }

  async listStorageLocations(): Promise<StorageLocationInfo[]> {
    const rows = await this.db.select().from(schema.storageLocations);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      rootPath: r.rootPath,
      kind: r.kind,
    }));
  }

  async listModules(): Promise<ProcessingModuleView[]> {
    const enabledMedia = await this.systemSettings.getEnabledModules();
    const enabled = resolveEnabledProcessingModules(enabledMedia);
    const policies = await this.getAllPolicies();
    const locations = await this.listStorageLocations();

    return enabled.map((moduleId) => {
      const def = getProcessingModuleDefinition(moduleId);
      const policy = policies[moduleId];
      const destination = this.destinationResolver.resolveModuleDestination(
        moduleId,
        locations,
      );
      const archiveIntent = policy.originalRetention.archiveDestinationIntent;
      const archiveDestination = archiveIntent
        ? this.destinationResolver.resolveArchiveDestination(
            archiveIntent,
            locations,
          )
        : null;

      return {
        moduleId,
        name: def.name,
        i18nKey: def.i18nKey,
        policy,
        templateFields: PROCESSING_TEMPLATE_FIELDS[moduleId],
        destination,
        archiveDestination,
        capabilities: {
          ingestAvailable: def.ingestAvailable,
          conversionAvailable: moduleId === "books",
          archiveAvailable: moduleId === "books",
          readAlongAvailable: false,
        },
      };
    });
  }

  preview(
    moduleId: ProcessingModuleId,
    policy: ModuleProcessingPolicy,
    metadata?: ProcessingTemplateMetadata,
    extension = "epub",
  ): { title: string; path: string; fullPath: string | null } {
    const sample = metadata ?? SAMPLE_METADATA[moduleId];
    const title = renderTitleTemplate(
      policy.titleTemplate,
      sample,
      moduleId,
      extension,
    );
    const dir = renderPathTemplate(policy.pathTemplate, sample, moduleId);
    return {
      title,
      path: dir,
      fullPath: dir ? `${dir}/${title}` : title,
    };
  }

  async archiveOriginalIfEnabled(params: {
    moduleId: ProcessingModuleId;
    files: FileService;
    sourceStorageLocationId: string;
    sourceRelativePath: string;
    archiveBasename: string;
  }): Promise<string[]> {
    if (params.moduleId !== "books") return [];

    const policy = await this.getPolicy(params.moduleId);
    if (!policy.originalRetention.enabled) return [];

    const intent = policy.originalRetention.archiveDestinationIntent;
    if (!intent) {
      return ["original-archive-skipped-no-intent"];
    }

    const locations = await this.listStorageLocations();
    const archiveDest = this.destinationResolver.resolveArchiveDestination(
      intent,
      locations,
    );
    if (!archiveDest.storageLocationId) {
      return ["original-archive-skipped-unresolved"];
    }

    const sourceAdapter = params.files
      .getStorageService()
      .getAdapter(params.sourceStorageLocationId);
    const destAdapter = params.files
      .getStorageService()
      .getAdapter(archiveDest.storageLocationId);

    const archiveRelative = `${intent}/${params.archiveBasename}`;
    await archiveOriginalToTarGz({
      sourceAdapter,
      sourceRelativePath: params.sourceRelativePath,
      destAdapter,
      destRelativeArchivePath: archiveRelative,
    });

    return [`original-archived:${archiveRelative}.tar.gz`];
  }
}
