import type { Icon as SolarIconComponent } from "@solar-icons/react/lib/types";
import { HomeIcon as HomeOutlineIcon } from "@solar-icons/react/outline/home";
import { WidgetIcon as WidgetOutlineIcon } from "@solar-icons/react/outline/widget";
import { PlanetIcon as PlanetOutlineIcon } from "@solar-icons/react/outline/planet";
import { BookIcon as BookOutlineIcon } from "@solar-icons/react/outline/book";
import { HeadphonesRoundIcon as HeadphonesOutlineIcon } from "@solar-icons/react/outline/headphones-round";
import { MusicNoteIcon as MusicNoteOutlineIcon } from "@solar-icons/react/outline/music-note";
import { VideoFrameIcon as VideoFrameOutlineIcon } from "@solar-icons/react/outline/video-frame";
import { TvIcon as TvOutlineIcon } from "@solar-icons/react/outline/tv";
import { CalendarMinimalisticIcon as CalendarMinimalisticOutlineIcon } from "@solar-icons/react/outline/calendar-minimalistic";
import { GalleryIcon as GalleryOutlineIcon } from "@solar-icons/react/outline/gallery";
import { GamepadIcon as GamepadOutlineIcon } from "@solar-icons/react/outline/gamepad";
import { UsersGroupRoundedIcon as UsersGroupOutlineIcon } from "@solar-icons/react/outline/users-group-rounded";
import { HistoryIcon as HistoryOutlineIcon } from "@solar-icons/react/outline/history";
import { DownloadIcon as DownloadOutlineIcon } from "@solar-icons/react/outline/download";
import { ChartIcon as ChartOutlineIcon } from "@solar-icons/react/outline/chart";
import { HomeIcon as HomeDuotoneIcon } from "@solar-icons/react/line-duotone/home";
import { WidgetIcon as WidgetDuotoneIcon } from "@solar-icons/react/line-duotone/widget";
import { PlanetIcon as PlanetDuotoneIcon } from "@solar-icons/react/line-duotone/planet";
import { BookIcon as BookDuotoneIcon } from "@solar-icons/react/line-duotone/book";
import { HeadphonesRoundIcon as HeadphonesDuotoneIcon } from "@solar-icons/react/line-duotone/headphones-round";
import { MusicNoteIcon as MusicNoteDuotoneIcon } from "@solar-icons/react/line-duotone/music-note";
import { VideoFrameIcon as VideoFrameDuotoneIcon } from "@solar-icons/react/line-duotone/video-frame";
import { TvIcon as TvDuotoneIcon } from "@solar-icons/react/line-duotone/tv";
import { CalendarMinimalisticIcon as CalendarMinimalisticDuotoneIcon } from "@solar-icons/react/line-duotone/calendar-minimalistic";
import { GalleryIcon as GalleryDuotoneIcon } from "@solar-icons/react/line-duotone/gallery";
import { GamepadIcon as GamepadDuotoneIcon } from "@solar-icons/react/line-duotone/gamepad";
import { UsersGroupRoundedIcon as UsersGroupDuotoneIcon } from "@solar-icons/react/line-duotone/users-group-rounded";
import { HistoryIcon as HistoryDuotoneIcon } from "@solar-icons/react/line-duotone/history";
import { DownloadIcon as DownloadDuotoneIcon } from "@solar-icons/react/line-duotone/download";
import { ChartIcon as ChartDuotoneIcon } from "@solar-icons/react/line-duotone/chart";

export type NavIconName =
  | "home"
  | "shelves"
  | "universes"
  | "books"
  | "audiobooks"
  | "music"
  | "movies"
  | "tv"
  | "photos"
  | "ttrpg"
  | "calendar"
  | "clubs"
  | "activity"
  | "downloads"
  | "stats";

type IconPair = {
  outline: SolarIconComponent;
  identity: SolarIconComponent;
};

export const NAV_ICONS: Record<NavIconName, IconPair> = {
  home: { outline: HomeOutlineIcon, identity: HomeDuotoneIcon },
  shelves: { outline: WidgetOutlineIcon, identity: WidgetDuotoneIcon },
  universes: { outline: PlanetOutlineIcon, identity: PlanetDuotoneIcon },
  books: { outline: BookOutlineIcon, identity: BookDuotoneIcon },
  audiobooks: { outline: HeadphonesOutlineIcon, identity: HeadphonesDuotoneIcon },
  music: { outline: MusicNoteOutlineIcon, identity: MusicNoteDuotoneIcon },
  movies: { outline: VideoFrameOutlineIcon, identity: VideoFrameDuotoneIcon },
  tv: { outline: TvOutlineIcon, identity: TvDuotoneIcon },
  photos: { outline: GalleryOutlineIcon, identity: GalleryDuotoneIcon },
  ttrpg: { outline: GamepadOutlineIcon, identity: GamepadDuotoneIcon },
  calendar: {
    outline: CalendarMinimalisticOutlineIcon,
    identity: CalendarMinimalisticDuotoneIcon,
  },
  clubs: { outline: UsersGroupOutlineIcon, identity: UsersGroupDuotoneIcon },
  activity: { outline: HistoryOutlineIcon, identity: HistoryDuotoneIcon },
  downloads: { outline: DownloadOutlineIcon, identity: DownloadDuotoneIcon },
  stats: { outline: ChartOutlineIcon, identity: ChartDuotoneIcon },
};

export { SHELF_ICON_COMPONENTS } from "./shelf-icon-registry";
