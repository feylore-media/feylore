import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ArtistDetail } from "@shared/music";
import { api } from "../../api";
import { AlbumCard } from "../../../components/music/AlbumCard";
import { AlbumGrid } from "../../../components/music/AlbumGrid";
import { LoadingState } from "../../../components/states";
import styles from "../../../components/music/music.module.css";

export function ArtistDetailPage() {
  const { t } = useTranslation("music");
  const { slug } = useParams<{ slug: string }>();
  const [artist, setArtist] = useState<ArtistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    void api<{ data: ArtistDetail }>(`/music/artists/${slug}`)
      .then((r) => setArtist(r.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <LoadingState />;
  if (error || !artist) {
    return <p className={styles.cardMeta}>{error ?? t("loadError")}</p>;
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>{artist.name}</h1>
      {artist.albums.length === 0 ? (
        <p className={styles.cardMeta}>{t("noAlbums")}</p>
      ) : (
        <AlbumGrid>
          {artist.albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </AlbumGrid>
      )}
    </div>
  );
}
