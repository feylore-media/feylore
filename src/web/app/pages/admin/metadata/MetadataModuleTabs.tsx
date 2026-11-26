import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import styles from "../../../../components/metadata/metadata-settings.module.css";
import type { MediaModuleId } from "@shared/media-modules";

export function MetadataModuleTabs({
  enabledModules,
  basePath,
  activeModuleId,
}: {
  enabledModules: MediaModuleId[];
  basePath: string;
  activeModuleId: MediaModuleId;
}) {
  const { t } = useTranslation("metadata");

  return (
    <nav className={styles.moduleTabs} aria-label={t("title")}>
      {enabledModules.map((id) => (
        <NavLink
          key={id}
          to={`${basePath}/${id}`}
          className={({ isActive }) =>
            isActive || id === activeModuleId
              ? styles.moduleTabActive
              : styles.moduleTab
          }
        >
          {t(`modules.${id}`)}
        </NavLink>
      ))}
    </nav>
  );
}
