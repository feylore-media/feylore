import { ClubNominations } from "../components/clubs/ClubNominations";
import { ClubReadingRoom } from "../components/clubs/ClubReadingRoom";
import {
  ClubMembersPage,
  ClubStatsPage,
} from "../components/clubs/ClubPresencePages";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ClubContext, ClubDetail, ClubInvitePublic } from "@shared/clubs";
import type { ClubSelectionDefaults } from "@shared/club-selection";
import { api } from "../api";
import { Button, TextField } from "../../components/primitives";
import { UserIdentity } from "../../components/users";
import { parseUsernameInput } from "@shared/user-identity";
import { EmptyState, LoadingState } from "../../components/states";
import { ClubFeed } from "../components/clubs/ClubFeed";
import { ClubContextSelect } from "../components/clubs/ClubContextBadge";
import { ClubSchedulePanel } from "../components/clubs/ClubSchedulePanel";
import { ClubDetailBackLink, ClubHeader } from "../components/clubs/ClubHeader";
import {
  ClubReadingOverview,
  ClubReadPage,
  ClubLibrary,
} from "../components/clubs/ClubReadingExperience";
import { ClubChallenges } from "../components/clubs/ClubChallenges";
import clubStyles from "../components/clubs/clubs.module.css";
import pageStyles from "./pages.module.css";

type ClubTab =
  | "overview"
  | "current-read"
  | "library"
  | "discussions"
  | "nominations"
  | "challenges"
  | "activity"
  | "members"
  | "stats"
  | "settings";

function roleLabel(role: string, t: (key: string) => string): string {
  if (role === "owner") return t("clubs:roleOwner");
  if (role === "moderator") return t("clubs:roleModerator");
  return t("clubs:roleMember");
}

export function ClubDetailPage({
  view = "overview",
}: {
  view?: ClubTab | "read" | "selection";
}) {
  const { id, readId, roundId } = useParams<{
    id: string;
    readId: string;
    roundId: string;
  }>();
  const navigate = useNavigate();
  const { t } = useTranslation("clubs");
  const [detail, setDetail] = useState<ClubDetail | null>(null);
  const [invites, setInvites] = useState<ClubInvitePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVisibility, setEditVisibility] = useState<"private" | "public">(
    "private",
  );
  const [editContext, setEditContext] = useState<ClubContext>("general");
  const [selectionDefaults, setSelectionDefaults] =
    useState<ClubSelectionDefaults | null>(null);
  const [durationDays, setDurationDays] = useState<number | null>(null);
  const tab = view;
  const setTab = (next: ClubTab) =>
    void navigate(`/clubs/${id}${next === "overview" ? "" : `/${next}`}`);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    void api<{ data: ClubDetail }>(`/clubs/${id}`)
      .then((r) => {
        setDetail(r.data);
        setEditName(r.data.club.name);
        setEditDescription(r.data.club.description ?? "");
        setEditVisibility(r.data.club.visibility);
        setEditContext(r.data.club.context);
        setSelectionDefaults(r.data.selectionDefaults ?? null);
        setDurationDays(r.data.readDefaults?.durationDays ?? null);
        if (r.data.canModerate) {
          void api<{ data: ClubInvitePublic[] }>(`/clubs/${id}/invites`)
            .then((inv) => setInvites(inv.data))
            .catch(() => setInvites([]));
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleJoin() {
    if (!id) return;
    await api(`/clubs/${id}/join`, { method: "POST" });
    load();
  }

  async function handleLeave() {
    if (!id) return;
    await api(`/clubs/${id}/leave`, { method: "POST" });
    load();
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm(t("confirmDeleteClub"))) return;
    await api(`/clubs/${id}`, { method: "DELETE" });
    void navigate("/clubs");
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !inviteUsername.trim()) return;
    // `@` is presentation syntax only; never send it as stored identity.
    await api(`/clubs/${id}/invites`, {
      method: "POST",
      body: JSON.stringify({ username: parseUsernameInput(inviteUsername) }),
    });
    setInviteUsername("");
    load();
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!id) return;
    await api(`/clubs/${id}/invites/${inviteId}`, { method: "DELETE" });
    load();
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    await api(`/clubs/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editName,
        description: editDescription || null,
        visibility: editVisibility,
        context: editContext,
      }),
    });
    setEditing(false);
    load();
  }

  async function handleRoleChange(
    userId: string,
    role: "moderator" | "member",
  ) {
    if (!id) return;
    await api(`/clubs/${id}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    load();
  }

  async function handleRemoveMember(userId: string) {
    if (!id) return;
    if (!window.confirm(t("confirmRemoveMember"))) return;
    await api(`/clubs/${id}/members/${userId}`, { method: "DELETE" });
    load();
  }

  async function handleSaveDefaults(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !selectionDefaults) return;
    await api(`/clubs/${id}/defaults`, {
      method: "PATCH",
      body: JSON.stringify({
        selection: selectionDefaults,
        reading: { durationDays },
      }),
    });
    load();
  }

  if (loading) return <LoadingState />;
  if (error || !detail || !id) {
    return (
      <EmptyState titleKey="notFound" ns="clubs" detailKey="backToClubs" />
    );
  }

  const { club, members, canEdit, canModerate, canAdmin, isMember, canJoin } =
    detail;
  if (tab === "settings" && !canModerate)
    return (
      <EmptyState titleKey="notFound" ns="clubs" detailKey="backToClubs" />
    );

  const tabs: { key: ClubTab; label: string }[] = [
    { key: "overview", label: t("tabOverview") },
    { key: "current-read", label: t("tabCurrentRead") },
    { key: "discussions", label: t("tabDiscussions") },
    { key: "nominations", label: t("tabNominations") },
    { key: "library", label: t("tabLibrary") },
    { key: "challenges", label: t("tabChallenges") },
    { key: "members", label: t("tabMembers") },
    { key: "stats", label: t("tabStats") },
  ];

  return (
    <div className={`${pageStyles.page} ${clubStyles.clubDetailPage}`}>
      <ClubDetailBackLink />

      <ClubHeader
        club={club}
        members={members}
        onInvite={canModerate ? () => setTab("settings") : undefined}
        canJoin={canJoin}
        canAdmin={canAdmin}
        canEdit={canEdit}
        isMember={isMember}
        onJoin={() => void handleJoin()}
        onLeave={() => void handleLeave()}
        onOpenSettings={() => setTab("settings")}
        onOpenMembers={() => setTab("members")}
      />

      <nav className={clubStyles.clubTabNav} aria-label={t("clubTabs")}>
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={
              tab === item.key ||
              (tab === "selection" && item.key === "nominations")
                ? `${clubStyles.clubTabButton} ${clubStyles.clubTabButtonActive}`
                : clubStyles.clubTabButton
            }
            aria-current={
              tab === item.key ||
              (tab === "selection" && item.key === "nominations")
                ? "page"
                : undefined
            }
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <ClubReadingOverview clubId={id} isMember={isMember} />
      )}
      {(tab === "current-read" || tab === "read") && (
        <ClubReadPage clubId={id} readId={readId} isMember={isMember} />
      )}
      {tab === "library" && <ClubLibrary clubId={id} />}
      {(tab === "selection" || tab === "nominations") && (
        <ClubNominations
          clubId={id}
          roundId={roundId}
          canModerate={canModerate}
        />
      )}

      {tab === "challenges" && <ClubChallenges clubId={id} />}

      {tab === "activity" && <ClubFeed clubId={id} />}
      {tab === "discussions" && (
        <ClubReadingRoom clubId={id} isMember={isMember} />
      )}

      {tab === "members" && <ClubMembersPage clubId={id} />}
      {tab === "stats" && <ClubStatsPage clubId={id} />}
      {tab === "settings" && canEdit && (
        <div className={clubStyles.clubSettingsSection}>
          <section className={clubStyles.clubSettingsBlock}>
            <h2 className={clubStyles.clubSettingsBlockTitle}>
              {t("settingsGeneral")}
            </h2>
            {editing ? (
              <form className={pageStyles.form} onSubmit={handleSaveSettings}>
                <TextField
                  label={t("clubName")}
                  id="editClubName"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
                <TextField
                  label={t("description")}
                  id="editClubDescription"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
                <label className={pageStyles.lead}>
                  {t("visibility")}
                  <select
                    value={editVisibility}
                    onChange={(e) =>
                      setEditVisibility(e.target.value as "private" | "public")
                    }
                  >
                    <option value="private">{t("visibilityPrivate")}</option>
                    <option value="public">{t("visibilityPublic")}</option>
                  </select>
                </label>
                <label className={pageStyles.lead}>
                  {t("context")}
                  <ClubContextSelect
                    value={editContext}
                    onChange={setEditContext}
                  />
                </label>
                <Button type="submit" variant="primary">
                  {t("save")}
                </Button>
                <Button type="button" onClick={() => setEditing(false)}>
                  {t("cancel")}
                </Button>
              </form>
            ) : (
              <Button type="button" onClick={() => setEditing(true)}>
                {t("settingsEditGeneral")}
              </Button>
            )}
          </section>

          {tab === "settings" && canModerate && (
            <section className={clubStyles.clubSettingsBlock}>
              <h2>{t("settingsMembership")}</h2>
              {canModerate && (
                <>
                  <h3>{t("invite")}</h3>
                  <form className={pageStyles.form} onSubmit={handleInvite}>
                    <TextField
                      label={t("inviteUsername")}
                      id="inviteUsername"
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      required
                    />
                    <Button type="submit" variant="primary">
                      {t("sendInvite")}
                    </Button>
                  </form>

                  {invites.length > 0 && (
                    <>
                      <h3>{t("pendingInvites")}</h3>
                      <ul className={pageStyles.list}>
                        {invites.map((inv) => (
                          <li key={inv.id} className={pageStyles.listItem}>
                            <UserIdentity
                              user={{
                                username: inv.inviteeUsername,
                                displayName: inv.inviteeDisplayName,
                                cosmetics: inv.inviteeCosmetics ?? null,
                              }}
                              variant="compact"
                            />
                            <Button
                              type="button"
                              onClick={() => void handleRevokeInvite(inv.id)}
                            >
                              {t("revokeInvite")}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}

              <h3>{t("members")}</h3>
              <ul className={pageStyles.list}>
                {members.map((member) => (
                  <li key={member.userId} className={pageStyles.listItem}>
                    <span>
                      <UserIdentity
                        user={{
                          username: member.username,
                          displayName: member.displayName,
                          cosmetics: member.cosmetics ?? null,
                        }}
                        variant="compact"
                      />{" "}
                      — {roleLabel(member.role, t)}
                    </span>
                    {canAdmin && member.role !== "owner" && (
                      <span style={{ marginLeft: "var(--space-2)" }}>
                        {member.role === "member" ? (
                          <Button
                            type="button"
                            onClick={() =>
                              void handleRoleChange(member.userId, "moderator")
                            }
                          >
                            {t("promoteModerator")}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            onClick={() =>
                              void handleRoleChange(member.userId, "member")
                            }
                          >
                            {t("demoteMember")}
                          </Button>
                        )}
                      </span>
                    )}
                    {canModerate &&
                      member.role !== "owner" &&
                      member.role !== "moderator" && (
                        <Button
                          type="button"
                          onClick={() => void handleRemoveMember(member.userId)}
                        >
                          {t("removeMember")}
                        </Button>
                      )}
                    {canModerate &&
                      member.role === "moderator" &&
                      !canAdmin && (
                        <Button
                          type="button"
                          onClick={() => void handleRemoveMember(member.userId)}
                        >
                          {t("removeMember")}
                        </Button>
                      )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={clubStyles.clubSettingsBlock}>
            <h2 className={clubStyles.clubSettingsBlockTitle}>
              {t("settingsReading")}
            </h2>
            <form className={pageStyles.form} onSubmit={handleSaveDefaults}>
              <TextField
                label={t("settingsDurationDays")}
                id="durationDays"
                type="number"
                min={1}
                max={365}
                value={durationDays ?? ""}
                onChange={(e) =>
                  setDurationDays(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
              <Button type="submit">{t("save")}</Button>
            </form>
            <ClubSchedulePanel
              clubId={id}
              context={club.context}
              canModerate={canModerate}
              currentWork={detail.currentWork}
              showCurrentWork={false}
            />
          </section>

          {selectionDefaults && (
            <section className={clubStyles.clubSettingsBlock}>
              <h2 className={clubStyles.clubSettingsBlockTitle}>
                {t("settingsSelection")}
              </h2>
              <form className={pageStyles.form} onSubmit={handleSaveDefaults}>
                <TextField
                  id="nominationDays"
                  type="number"
                  min={1}
                  max={90}
                  label={t("settingsNominationDays")}
                  value={selectionDefaults.nominationDays}
                  onChange={(e) =>
                    setSelectionDefaults({
                      ...selectionDefaults,
                      nominationDays: Number(e.target.value),
                    })
                  }
                  required
                />
                <TextField
                  id="votingDays"
                  type="number"
                  min={1}
                  max={90}
                  label={t("settingsVotingDays")}
                  value={selectionDefaults.votingDays}
                  onChange={(e) =>
                    setSelectionDefaults({
                      ...selectionDefaults,
                      votingDays: Number(e.target.value),
                    })
                  }
                  required
                />
                <TextField
                  id="nominationLimit"
                  type="number"
                  min={1}
                  max={100}
                  label={t("settingsNominationLimit")}
                  value={selectionDefaults.nominationLimit}
                  onChange={(e) =>
                    setSelectionDefaults({
                      ...selectionDefaults,
                      nominationLimit: Number(e.target.value),
                    })
                  }
                  required
                />
                <label className={clubStyles.clubSettingsChoice}>
                  {t("settingsMethod")}
                  <select
                    value={selectionDefaults.method}
                    onChange={(e) => {
                      const method = e.target
                        .value as ClubSelectionDefaults["method"];
                      setSelectionDefaults({
                        ...selectionDefaults,
                        method,
                        configuration:
                          method === "random_draw"
                            ? {
                                ...selectionDefaults.configuration,
                                tieBehavior: "moderator",
                                resultVisibility: "after_completion",
                              }
                            : selectionDefaults.configuration,
                      });
                    }}
                  >
                    <option value="simple_poll">
                      {t("selectionMethod_simple_poll")}
                    </option>
                    <option value="ranked_choice">
                      {t("selectionMethod_ranked_choice")}
                    </option>
                    <option value="random_draw">
                      {t("selectionMethod_random_draw")}
                    </option>
                  </select>
                </label>
                {selectionDefaults.method !== "random_draw" && (
                  <label className={clubStyles.clubSettingsChoice}>
                    {t("settingsTieBehavior")}
                    <select
                      value={selectionDefaults.configuration.tieBehavior}
                      onChange={(e) =>
                        setSelectionDefaults({
                          ...selectionDefaults,
                          configuration: {
                            ...selectionDefaults.configuration,
                            tieBehavior: e.target
                              .value as ClubSelectionDefaults["configuration"]["tieBehavior"],
                          },
                        })
                      }
                    >
                      <option value="moderator">
                        {t("settingsTieModerator")}
                      </option>
                      <option value="runoff">{t("settingsTieRunoff")}</option>
                      <option value="random">{t("settingsTieRandom")}</option>
                    </select>
                  </label>
                )}
                <label className={clubStyles.clubSettingsCheckbox}>
                  <input
                    type="checkbox"
                    checked={
                      selectionDefaults.configuration.excludePreviouslyRead
                    }
                    onChange={(e) =>
                      setSelectionDefaults({
                        ...selectionDefaults,
                        configuration: {
                          ...selectionDefaults.configuration,
                          excludePreviouslyRead: e.target.checked,
                        },
                      })
                    }
                  />
                  {t("settingsExcludeRead")}
                </label>
                {selectionDefaults.method !== "random_draw" && (
                  <label className={clubStyles.clubSettingsChoice}>
                    {t("settingsResultVisibility")}
                    <select
                      value={selectionDefaults.configuration.resultVisibility}
                      onChange={(e) =>
                        setSelectionDefaults({
                          ...selectionDefaults,
                          configuration: {
                            ...selectionDefaults.configuration,
                            resultVisibility: e.target
                              .value as ClubSelectionDefaults["configuration"]["resultVisibility"],
                          },
                        })
                      }
                    >
                      <option value="after_completion">
                        {t("settingsResultsAfter")}
                      </option>
                      <option value="during_voting">
                        {t("settingsResultsDuring")}
                      </option>
                    </select>
                  </label>
                )}
                <Button type="submit" variant="primary">
                  {t("save")}
                </Button>
              </form>
            </section>
          )}
          {canAdmin && (
            <section className={clubStyles.clubSettingsBlock}>
              <h2 className={clubStyles.clubSettingsBlockTitle}>
                {t("settingsDanger")}
              </h2>
              <Button type="button" onClick={() => void handleDelete()}>
                {t("delete")}
              </Button>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
