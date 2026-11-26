import path from "node:path";
import type { ProcessingPolicyService } from "./policy-service.js";
import type {
  ModuleProcessingPolicy,
  ProcessingModuleId,
} from "../../../shared/processing-policy.js";
import {
  buildDestinationRelativePath,
  type ProcessingTemplateMetadata,
} from "../../../shared/processing-templates.js";

const COMICS_EXTENSIONS = new Set([".cbz", ".cbr"]);

export function resolveProcessingModuleFromFilename(
  filename: string,
  domain: string,
): ProcessingModuleId | null {
  const ext = path.extname(filename).toLowerCase();
  if (COMICS_EXTENSIONS.has(ext)) return "comics";
  switch (domain) {
    case "book":
      return "books";
    case "audiobook":
      return "audiobooks";
    case "music":
      return "music";
    case "movies":
      return "movies";
    case "tv":
      return "tv";
    default:
      return null;
  }
}

export class ProcessingPolicyResolver {
  constructor(private readonly policies: ProcessingPolicyService) {}

  async getPolicyForModule(
    moduleId: ProcessingModuleId,
  ): Promise<ModuleProcessingPolicy> {
    return this.policies.getPolicy(moduleId);
  }

  async getPolicyForIngest(params: {
    filename: string;
    domain: string;
  }): Promise<{ moduleId: ProcessingModuleId; policy: ModuleProcessingPolicy } | null> {
    const moduleId = resolveProcessingModuleFromFilename(
      params.filename,
      params.domain,
    );
    if (!moduleId) return null;
    const policy = await this.getPolicyForModule(moduleId);
    return { moduleId, policy };
  }

  buildOrganizePath(params: {
    moduleId: ProcessingModuleId;
    policy: ModuleProcessingPolicy;
    metadata: ProcessingTemplateMetadata;
    originalFilename: string;
    extension: string;
  }): string {
    if (!params.policy.fileOperations.organizeIntoLibrary) {
      return path.posix.basename(params.originalFilename);
    }
    return buildDestinationRelativePath({
      pathTemplate: params.policy.pathTemplate,
      titleTemplate: params.policy.titleTemplate,
      metadata: params.metadata,
      moduleId: params.moduleId,
      extension: params.extension,
      renameFiles: params.policy.fileOperations.renameFiles,
      originalFilename: params.originalFilename,
    });
  }

  archiveOriginalIfEnabled(
    params: Parameters<ProcessingPolicyService["archiveOriginalIfEnabled"]>[0],
  ) {
    return this.policies.archiveOriginalIfEnabled(params);
  }
}
