import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SelectionExperience } from "@shared/club-selection-experience";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import styles from "./clubs.module.css";

function RankRow({
  id,
  title,
  index,
  length,
  onMove,
  onRemove,
  disabled,
}: {
  id: string;
  title: string;
  index: number;
  length: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("clubs");
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={styles.selectionRankRow}
    >
      <span>
        {index + 1}. {title}
      </span>
      <div>
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("selectionDrag", { title })}
        >
          {t("selectionReorder")}
        </button>
        <button
          type="button"
          disabled={disabled || index === 0}
          onClick={() => onMove(index, index - 1)}
          aria-label={t("selectionMoveUpNamed", { title })}
        >
          {t("selectionMoveUp")}
        </button>
        <button
          type="button"
          disabled={disabled || index === length - 1}
          onClick={() => onMove(index, index + 1)}
          aria-label={t("selectionMoveDownNamed", { title })}
        >
          {t("selectionMoveDown")}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label={t("selectionRemoveNamed", { title })}
        >
          {t("selectionRemove")}
        </button>
      </div>
    </li>
  );
}
export function SelectionBallot({
  clubId,
  round,
  onSaved,
}: {
  clubId: string;
  round: SelectionExperience;
  onSaved: () => void;
}) {
  const { t } = useTranslation("clubs");
  const [ranking, setRanking] = useState(round.viewerBallot),
    [saved, setSaved] = useState(round.viewerBallot.length > 0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const choices = new Map(round.viewerChoices.map((c) => [c.id, c.title]));
  for (const c of round.candidates)
    if (c.eligible) choices.set(c.id, c.snapshot.title);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const change = (value: string[]) => {
    setRanking(value);
    setSaved(false);
  };
  const move = (from: number, to: number) =>
    change(arrayMove(ranking, from, to));
  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (over && over.id !== active.id)
      move(
        ranking.indexOf(String(active.id)),
        ranking.indexOf(String(over.id)),
      );
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!round.canVote) return;
    setBusy(true);
    try {
      await api(`/clubs/${clubId}/selection-rounds/${round.id}/ballot`, {
        method: "POST",
        body: JSON.stringify({ ranking }),
      });
      setSaved(true);
      setError(false);
      onSaved();
    } catch {
      setError(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  if (round.method === "random_draw") return null;
  return (
    <section>
      <h3>
        {t(
          round.method === "ranked_choice"
            ? "selectionYourRanking"
            : "selectionYourVote",
        )}
      </h3>
      <p>
        {t(
          round.method === "ranked_choice"
            ? "selectionRankingRule"
            : "selectionSingleRule",
        )}
      </p>
      <form onSubmit={(e) => void submit(e)}>
        {round.method === "simple_poll" ? (
          <fieldset disabled={!round.canVote || busy}>
            <legend>{t("selectionChooseOne")}</legend>
            {[...choices].map(([id, title]) => (
              <label className={styles.selectionVoteChoice} key={id}>
                <input
                  type="radio"
                  name="selection-vote"
                  value={id}
                  checked={ranking[0] === id}
                  onChange={() => change([id])}
                />
                {title}
              </label>
            ))}
          </fieldset>
        ) : (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={dragEnd}
            >
              <SortableContext
                items={ranking}
                strategy={verticalListSortingStrategy}
              >
                <ol className={styles.selectionRanking}>
                  {ranking.map((id, index) => (
                    <RankRow
                      key={id}
                      id={id}
                      title={
                        choices.get(id) ?? t("selectionUnavailableCandidate")
                      }
                      index={index}
                      length={ranking.length}
                      onMove={move}
                      disabled={!round.canVote}
                      onRemove={() =>
                        change(ranking.filter((candidate) => candidate !== id))
                      }
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
            {round.canVote && (
              <div className={styles.selectionRankChoices}>
                {[...choices]
                  .filter(([id]) => !ranking.includes(id))
                  .map(([id, title]) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => change([...ranking, id])}
                      aria-label={t("selectionRankNamed", { title })}
                    >
                      {t("selectionAddRanking")}: {title}
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
        {saved && <p role="status">{t("selectionBallotSubmitted")}</p>}
        {round.canVote && (
          <Button
            disabled={busy || ranking.length === 0 || ranking.length > 500}
            type="submit"
          >
            {t(
              round.viewerBallot.length
                ? "selectionReplaceBallot"
                : "selectionSubmitBallot",
            )}
          </Button>
        )}
        {error && <p role="alert">{t("selectionMutationError")}</p>}
      </form>
    </section>
  );
}
