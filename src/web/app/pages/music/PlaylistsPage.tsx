import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { usePlaylists } from "../../../hooks/music/usePlaylists";
import { playlistPath } from "../../../routes/paths";
import styles from "../../../components/music/music.module.css";

export function PlaylistsPage() {
  const { t } = useTranslation("music");
  const { playlists, loading, error } = usePlaylists();

  return (
    <div>
      <h1 className={styles.pageTitle}>{t("playlists")}</h1>
      {loading ? (
        <p className={styles.cardMeta}>{t("loading")}</p>
      ) : error ? (
        <p className={styles.cardMeta}>{t("loadError")}</p>
      ) : playlists.length === 0 ? (
        <p className={styles.cardMeta}>{t("noPlaylists")}</p>
      ) : (
        <ul className={styles.playlistList}>
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <Link to={playlistPath(playlist.slug)} className={styles.playlistLink}>
                <p className={styles.playlistName}>{playlist.name}</p>
                <p className={styles.playlistMeta}>
                  {t("trackCount", { count: playlist.trackCount })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
