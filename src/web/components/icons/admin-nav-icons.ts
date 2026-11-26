import type { Icon as SolarIconComponent } from "@solar-icons/react/lib/types";
import type { AdminNavIconName } from "@shared/admin-sections";
import { WidgetIcon } from "@solar-icons/react/outline/widget";
import { ServerIcon } from "@solar-icons/react/outline/server";
import { ListIcon } from "@solar-icons/react/outline/list";
import { TagIcon } from "@solar-icons/react/outline/tag";
import { SortIcon } from "@solar-icons/react/outline/sort";
import { RefreshIcon } from "@solar-icons/react/outline/refresh";
import { UsersGroupRoundedIcon } from "@solar-icons/react/outline/users-group-rounded";
import { ShieldMinimalisticIcon } from "@solar-icons/react/outline/shield-minimalistic";
import { PlugCircleIcon } from "@solar-icons/react/outline/plug-circle";
import { PaletteIcon } from "@solar-icons/react/outline/palette";
import { DocumentTextIcon } from "@solar-icons/react/outline/document-text";
import { ChartIcon } from "@solar-icons/react/outline/chart";
import { PulseIcon } from "@solar-icons/react/outline/pulse";
import { SettingsIcon } from "@solar-icons/react/outline/settings";
import { StarIcon } from "@solar-icons/react/outline/star";

export const ADMIN_NAV_ICONS: Record<AdminNavIconName, SolarIconComponent> = {
  dashboard: ChartIcon,
  status: PulseIcon,
  modules: WidgetIcon,
  storage: ServerIcon,
  processing: SettingsIcon,
  jobs: ListIcon,
  metadataProviders: TagIcon,
  metadataAggregation: SortIcon,
  metadataFormatting: PaletteIcon,
  conversion: RefreshIcon,
  users: UsersGroupRoundedIcon,
  roles: ShieldMinimalisticIcon,
  integrations: PlugCircleIcon,
  appearance: PaletteIcon,
  configuration: SettingsIcon,
  ratings: StarIcon,
  audit: DocumentTextIcon,
};
