import { useOutletContext } from "react-router";
import { LoadingState } from "../../../../components/states";
import type { MediaModuleId } from "@shared/media-modules";
import styles from "../../../../components/metadata/metadata-settings.module.css";
import { MetadataAggregationSection } from "./MetadataAggregationSection";
import { useMetadataModuleSettings } from "./useMetadataModuleSettings";

export function MetadataAggregationPage() {
  const { moduleId } = useOutletContext<{ moduleId: MediaModuleId }>();
  const { moduleData, loading, loadError, message, setMessage } =
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
    <MetadataAggregationSection
      moduleId={moduleId}
      moduleData={moduleData}
      message={message}
      setMessage={setMessage}
    />
  );
}
