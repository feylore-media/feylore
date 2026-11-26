import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api";
import type { FieldSourceOrderRow } from "../../../../components/metadata/FieldSourceOrderTable";
import type { MediaModuleId } from "@shared/media-modules";
import type {
  MetadataMatchingRules,
  MetadataPersistence,
  SourceAvailabilityStatus,
  ConnectionStatus,
} from "@shared/metadata-settings";
import type { MetadataConfigField } from "@shared/metadata-contract/index";

export interface ProviderView {
  key: string;
  name: string;
  sourceType: string;
  sourceCategory: string;
  mediaModules: string[];
  fields: string[];
  region?: { code: string; label: string };
  configSchema?: MetadataConfigField[];
  enabled: boolean;
  configured: boolean;
  implemented: boolean;
  availabilityStatus: SourceAvailabilityStatus;
  connectionStatus: ConnectionStatus;
}

export interface ModuleSettings {
  moduleId: MediaModuleId;
  metadataPersistence: MetadataPersistence;
  providers: ProviderView[];
  fieldPriorities: FieldSourceOrderRow[];
  matchingRules: MetadataMatchingRules;
}

interface SettingsResponse {
  enabledModules: MediaModuleId[];
  modules: ModuleSettings[];
}

export function useMetadataModuleSettings(moduleId: MediaModuleId) {
  const { t } = useTranslation("metadata");
  const [moduleData, setModuleData] = useState<ModuleSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<{ data: SettingsResponse }>("/metadata/settings");
      const mod = res.data.modules.find((m) => m.moduleId === moduleId);
      if (mod) {
        setModuleData(mod);
      } else {
        setLoadError(t("saveError"));
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setLoading(false);
    }
  }, [moduleId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    moduleData,
    loading,
    loadError,
    message,
    setMessage,
    reload: load,
  };
}
