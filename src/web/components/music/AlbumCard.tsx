import { Link } from "react-router";
import type { AlbumListItem } from "@shared/music";
import { AlbumCover } from "./AlbumCover";
import { albumPath } from "../../routes/paths";
import styles from "./music.module.css";

export interface AlbumCardProps {
  album: AlbumListItem;
}

export function AlbumCard({ album }: AlbumCardProps) {
  return (
    <Link to={albumPath(album.slug)} className={styles.card}>
      <AlbumCover coverFileId={album.coverFileId} title={album.title} />
      <div className={styles.cardTitle}>{album.title}</div>
      {album.artists.length > 0 && (
        <div className={styles.cardMeta}>{album.artists.join(", ")}</div>
      )}
      {album.trackCount > 0 && (
        <div className={styles.cardMeta}>
          {album.trackCount} track{album.trackCount === 1 ? "" : "s"}
        </div>
      )}
    </Link>
  );
}
