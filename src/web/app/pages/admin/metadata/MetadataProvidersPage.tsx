import { useOutletContext } from "react-router";
import { LoadingState } from "../../../../components/states";
import type { MediaModuleId } from "@shared/media-modules";
import styles from "../../../../components/metadata/metadata-settings.module.css";
import { MetadataProvidersSection } from "./MetadataProvidersSection";
import { useMetadataModuleSettings } from "./useMetadataModuleSettings";

export function MetadataProvidersPage() {
  const { moduleId } = useOutletContext<{ moduleId: MediaModuleId }>();
  const { moduleData, loading, loadError, message, setMessage, reload } =
    useMetadataModuleSettings(moduleId);

  if (loading) return <LoadingState />;
  if (loadError) {
    return (
      <p className={styles.messageError} role="alert">
        {loadError}
      </p>
    );
  }
  if (!moduleData) return <LoadingState />;

  return (
    <MetadataProvidersSection
      moduleId={moduleId}
      moduleData={moduleData}
      message={message}
      setMessage={setMessage}
      onReload={reload}
    />
  );
}
