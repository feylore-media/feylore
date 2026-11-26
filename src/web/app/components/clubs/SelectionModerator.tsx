import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  SelectionAudit,
  SelectionExperience,
} from "@shared/club-selection-experience";
import type { ShelfPublic } from "@shared/shelves";
import { shelfRuleSummary } from "@shared/shelf-rule-summary";
import { api } from "../../api";
import { Button, TextField } from "../../../components/primitives";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import styles from "./clubs.module.css";

const dateFields = [
  "nominationStartsAt",
  "nominationEndsAt",
  "votingStartsAt",
  "votingEndsAt",
  "nextReadStartsAt",
] as const;
function localDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function SelectionConfigurationDialog({
  clubId,
  round,
  onClose,
  onSaved,
}: {
  clubId: string;
  round?: SelectionExperience;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const { t } = useTranslation("clubs"),
    frozen = Boolean(round && round.phase !== "draft");
  const [title, setTitle] = useState(round?.title ?? ""),
    [method, setMethod] = useState(round?.method ?? "simple_poll"),
    [limit, setLimit] = useState(String(round?.nominationLimit ?? 2)),
    [tie, setTie] = useState(round?.configuration.tieBehavior ?? "moderator"),
    [visibility, setVisibility] = useState(
      round?.configuration.resultVisibility ?? "after_completion",
    ),
    [excluded, setExcluded] = useState(
      round?.configuration.excludePreviouslyRead ?? false,
    ),
    [dates, setDates] = useState(
      Object.fromEntries(
        dateFields.map((key) => [key, localDate(round?.[key])]),
      ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const mutableDates = frozen
        ? dateFields.filter(
            (key) => !key.endsWith("StartsAt") || key === "nextReadStartsAt",
          )
        : dateFields;
      const schedule = Object.fromEntries(
        mutableDates.map((key) => [
          key,
          dates[key] ? new Date(dates[key]!).toISOString() : null,
        ]),
      );
      const body = frozen
        ? schedule
        : {
            title,
            method,
            nominationLimit: Number(limit),
            configuration: {
              tieBehavior: tie,
              resultVisibility: visibility,
              excludePreviouslyRead: excluded,
            },
            ...schedule,
          };
      const response = await api<{ data: { id?: string } }>(
        `/clubs/${clubId}/selection-rounds${round ? "/" + round.id : ""}`,
        { method: round ? "PATCH" : "POST", body: JSON.stringify(body) },
      );
      onSaved(response.data.id);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>
            {t(round ? "selectionConfigure" : "selectionCreate")}
          </DialogTitle>
          <DialogDescription>
            {t(
              frozen ? "selectionFrozenNotice" : "selectionConfigurationNotice",
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form onSubmit={(e) => void save(e)} className={styles.selectionForm}>
            <fieldset disabled={frozen}>
              <legend>{t("selectionRules")}</legend>
              <TextField
                id="round-title"
                label={t("selectionTitle")}
                required
                maxLength={300}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <label>
                {t("readSelectionMethod")}
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                >
                  {["simple_poll", "ranked_choice", "random_draw"].map((m) => (
                    <option key={m} value={m}>
                      {t(`selectionMethod_${m}`)}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                id="round-limit"
                label={t("selectionNominationLimit")}
                type="number"
                min={1}
                max={100}
                required
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={excluded}
                  onChange={(e) => setExcluded(e.target.checked)}
                />
                {t("selectionExcludePrevious")}
              </label>
              {method !== "random_draw" && (
                <label>
                  {t("selectionTieBehavior")}
                  <select
                    value={tie}
                    onChange={(e) => setTie(e.target.value as typeof tie)}
                  >
                    {["moderator", "random", "runoff"].map((v) => (
                      <option key={v} value={v}>
                        {t(`selectionTie_${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                {t("selectionResultVisibility")}
                <select
                  value={visibility}
                  onChange={(e) =>
                    setVisibility(e.target.value as typeof visibility)
                  }
                >
                  {["after_completion", "during_voting"].map((v) => (
                    <option key={v} value={v}>
                      {t(`selectionVisibility_${v}`)}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <fieldset>
              <legend>{t("selectionSchedule")}</legend>
              {dateFields
                .filter(
                  (key) =>
                    !frozen ||
                    !key.endsWith("StartsAt") ||
                    key === "nextReadStartsAt",
                )
                .filter(
                  (key) =>
                    method !== "random_draw" || !key.startsWith("voting"),
                )
                .map((key) => (
                  <TextField
                    key={key}
                    id={`round-${key}`}
                    type="datetime-local"
                    label={t(`selectionDate_${key}`)}
                    value={dates[key]}
                    min={
                      frozen && key !== "nextReadStartsAt"
                        ? localDate(round?.[key]) || undefined
                        : undefined
                    }
                    onChange={(e) =>
                      setDates({ ...dates, [key]: e.target.value })
                    }
                  />
                ))}
            </fieldset>
            <Button type="submit" disabled={busy}>
              {t("selectionSaveConfiguration")}
            </Button>
            {error && <p role="alert">{t("selectionConfigurationError")}</p>}
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
export function SelectionModerator({
  clubId,
  round,
  onSaved,
}: {
  clubId: string;
  round: SelectionExperience;
  onSaved: () => void;
}) {
  const { t } = useTranslation("clubs");
  const [configuring, setConfiguring] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [pending, setPending] = useState<SelectionAudit | null>(null),
    [selectedTie, setSelectedTie] = useState(""),
    [shelves, setShelves] = useState<ShelfPublic[] | null>(null),
    [shelfId, setShelfId] = useState("");
  if (!round.canModerate) return null;
  const act = async (action: string, body: unknown = {}) => {
    setBusy(true);
    setError(false);
    try {
      const result = await api<{ data: SelectionAudit }>(
        `/clubs/${clubId}/selection-rounds/${round.id}/${action}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      if (action === "finalize")
        setPending(result.data.requiresTieResolution ? result.data : null);
      onSaved();
    } catch {
      setError(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  const phase = (value: string) => void act("transition", { phase: value });
  const closed =
    round.votingEndsAt && new Date(round.votingEndsAt).getTime() <= Date.now();
  const shelf = shelves?.find((s) => s.id === shelfId);
  return (
    <details className={styles.selectionModerator}>
      <summary>{t("selectionModeratorActions")}</summary>
      <div className={styles.selectionActions}>
        {!["completed", "cancelled"].includes(round.phase) && (
          <Button disabled={busy} onClick={() => setConfiguring(true)}>
            {t(
              round.phase === "draft"
                ? "selectionConfigure"
                : "selectionExtendDates",
            )}
          </Button>
        )}
        {round.phase === "draft" && (
          <Button disabled={busy} onClick={() => phase("nominations_open")}>
            {t("selectionOpenNominations")}
          </Button>
        )}
        {round.phase === "nominations_open" && (
          <Button disabled={busy} onClick={() => phase("nominations_closed")}>
            {t("selectionCloseNominations")}
          </Button>
        )}
        {round.phase === "nominations_closed" && (
          <>
            <Button disabled={busy} onClick={() => phase("nominations_open")}>
              {t("selectionReopenNominations")}
            </Button>
            {round.method !== "random_draw" && (
              <Button
                disabled={busy || round.eligibleCount === 0}
                onClick={() => phase("voting_open")}
              >
                {t("selectionOpenVoting")}
              </Button>
            )}
          </>
        )}
        {round.phase === "voting_open" &&
          !closed &&
          (!round.votingStartsAt ||
            new Date(round.votingStartsAt).getTime() <= Date.now()) && (
            <Button disabled={busy} onClick={() => void act("close-voting")}>
              {t("selectionCloseVoting")}
            </Button>
          )}
        {((round.method === "random_draw" &&
          round.phase === "nominations_closed") ||
          (round.phase === "voting_open" &&
            (closed || round.method === "random_draw"))) && (
          <Button
            disabled={busy || round.eligibleCount === 0}
            onClick={() => void act("finalize")}
          >
            {t(
              round.method === "random_draw"
                ? "selectionDraw"
                : "selectionFinalize",
            )}
          </Button>
        )}
        {!["completed", "cancelled"].includes(round.phase) && (
          <Button disabled={busy} onClick={() => phase("cancelled")}>
            {t("selectionCancelRound")}
          </Button>
        )}
        {["draft", "nominations_open"].includes(round.phase) && (
          <Button
            disabled={busy}
            onClick={() => {
              void api<{ data: ShelfPublic[] }>("/shelves?scope=books")
                .then((r) =>
                  setShelves(
                    r.data.filter(
                      (s) => s.scope === "books" || s.scope === "global",
                    ),
                  ),
                )
                .catch(() => setError(true));
            }}
          >
            {t("selectionImportShelf")}
          </Button>
        )}
      </div>
      {pending?.requiresTieResolution && (
        <section>
          <h3>{t("selectionModeratorTie")}</h3>
          <label>
            {t("selectionChooseTieWinner")}
            <select
              value={selectedTie}
              onChange={(e) => setSelectedTie(e.target.value)}
            >
              <option value="">{t("selectionChooseOne")}</option>
              {pending.tiedIds.map((id) => (
                <option key={id} value={id}>
                  {round.candidates.find((c) => c.id === id)?.snapshot.title ??
                    t("selectionUnavailableCandidate")}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={busy || !selectedTie}
            onClick={() => void act("finalize", { candidateId: selectedTie })}
          >
            {t("selectionFinalize")}
          </Button>
        </section>
      )}
      {shelves && (
        <section>
          <label>
            {t("selectionShelfSource")}
            <select
              value={shelfId}
              onChange={(e) => setShelfId(e.target.value)}
            >
              <option value="">{t("selectionChooseShelf")}</option>
              {shelves.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {shelf && <p>{shelfRuleSummary(shelf.membershipExpression)}</p>}
          <Button
            disabled={busy || !shelfId}
            onClick={() => void act("shelf", { shelfId })}
          >
            {t("selectionImportShelf")}
          </Button>
        </section>
      )}
      {error && <p role="alert">{t("selectionMutationError")}</p>}
      {configuring && (
        <SelectionConfigurationDialog
          clubId={clubId}
          round={round}
          onClose={() => setConfiguring(false)}
          onSaved={() => {
            setConfiguring(false);
            onSaved();
          }}
        />
      )}
    </details>
  );
}
