import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClubListItem } from "@shared/clubs";
import { api } from "../api";
import { Button } from "../../components/primitives";
import { LoadingState } from "../../components/states";
import {
  ClubCreateModal,
  type ClubCreateValues,
} from "../components/clubs/ClubCreateModal";
import { ClubListRow } from "../components/clubs/ClubListRow";
import clubStyles from "../components/clubs/clubs.module.css";
import pageStyles from "./pages.module.css";

export function ClubsPage() {
  const { t } = useTranslation("clubs");
  const [clubs, setClubs] = useState<ClubListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void api<{ data: ClubListItem[] }>("/clubs")
      .then((r) => setClubs(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(values: ClubCreateValues) {
    await api("/clubs", {
      method: "POST",
      body: JSON.stringify({
        name: values.name,
        description: values.description || undefined,
        visibility: values.visibility,
        context: values.context,
      }),
    });
    load();
  }

  async function handleJoin(clubId: string) {
    setJoiningId(clubId);
    try {
      await api(`/clubs/${clubId}/join`, { method: "POST" });
      load();
    } finally {
      setJoiningId(null);
    }
  }

  const memberClubs = clubs.filter((c) => c.isMember);
  const joinableClubs = clubs.filter((c) => c.canJoin);

  if (loading) {
    return (
      <div className={pageStyles.page}>
        <LoadingState />
      </div>
    );
  }

  return (
    <div className={pageStyles.page}>
      <header className={clubStyles.pageHeader}>
        <h1 className={clubStyles.pageTitle}>{t("title")}</h1>
        <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
          {t("createClub")}
        </Button>
      </header>

      <section className={clubStyles.section} aria-labelledby="your-clubs-heading">
        <h2 id="your-clubs-heading" className={clubStyles.sectionTitle}>
          {t("yourClubs")}
        </h2>
        {memberClubs.length === 0 ? (
          <p className={clubStyles.sectionEmpty}>{t("noYourClubs")}</p>
        ) : (
          <ul className={clubStyles.list}>
            {memberClubs.map((club) => (
              <ClubListRow key={club.id} club={club} variant="member" />
            ))}
          </ul>
        )}
      </section>

      <section
        className={clubStyles.section}
        aria-labelledby="joinable-clubs-heading"
      >
        <h2 id="joinable-clubs-heading" className={clubStyles.sectionTitle}>
          {t("joinableClubs")}
        </h2>
        {joinableClubs.length === 0 ? (
          <p className={clubStyles.sectionEmpty}>{t("noJoinableClubs")}</p>
        ) : (
          <ul className={clubStyles.list}>
            {joinableClubs.map((club) => (
              <ClubListRow
                key={club.id}
                club={club}
                variant="joinable"
                onJoin={handleJoin}
                joining={joiningId === club.id}
              />
            ))}
          </ul>
        )}
      </section>

      <ClubCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
      />
    </div>
  );
}
