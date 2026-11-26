import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ArtistPublic } from "@shared/music";
import { api } from "../../api";
import { artistPath } from "../../../routes/paths";
import styles from "../../../components/music/music.module.css";

export function MusicArtistsPage() {
  const { t } = useTranslation("music");
  const [artists, setArtists] = useState<ArtistPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void api<{ data: ArtistPublic[] }>("/music/artists")
      .then((r) => setArtists(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? artists.filter((a) => a.name.toLowerCase().includes(q))
      : artists;
  }, [artists, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ArtistPublic[]>();
    for (const artist of filtered) {
      const letter = artist.name.charAt(0).toUpperCase() || "#";
      const key = /[A-Z]/.test(letter) ? letter : "#";
      const list = map.get(key) ?? [];
      list.push(artist);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div>
      <h1 className={styles.pageTitle}>{t("artists")}</h1>
      <p style={{ marginBottom: "var(--space-4)" }}>
        <Link to="/music/artists/people" style={{ color: "var(--color-accent)", textDecoration: "none", fontSize: "0.875rem" }}>
          Browse artists with photos →
        </Link>
      </p>
      <div className={styles.filterBar}>
        <input
          type="search"
          className={styles.filterInput}
          placeholder={t("searchArtists")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t("searchArtists")}
        />
      </div>
      {loading ? (
        <p className={styles.cardMeta}>{t("loading")}</p>
      ) : grouped.length === 0 ? (
        <p className={styles.cardMeta}>{t("noArtists")}</p>
      ) : (
        grouped.map(([letter, names]) => (
          <section key={letter} className={styles.artistGroup}>
            <h2 className={styles.artistGroupLetter}>{letter}</h2>
            <ul className={styles.artistList}>
              {names.map((artist) => (
                <li key={artist.id}>
                  <Link to={artistPath(artist.slug)} className={styles.artistLink}>
                    {artist.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
