import { useTranslation } from "react-i18next";
import type { ClubContext } from "@shared/clubs";

const CONTEXT_KEYS: Record<ClubContext, string> = {
  general: "contextGeneral",
  book: "contextBook",
  video: "contextVideo",
  ttrpg: "contextTtrpg",
};

export function ClubContextBadge({ context }: { context: ClubContext }) {
  const { t } = useTranslation("clubs");
  return <span>{t(CONTEXT_KEYS[context])}</span>;
}

export function ClubContextSelect({
  value,
  onChange,
  id,
}: {
  value: ClubContext;
  onChange: (value: ClubContext) => void;
  id?: string;
}) {
  const { t } = useTranslation("clubs");
  const contexts: ClubContext[] = ["general", "book", "video", "ttrpg"];
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as ClubContext)}
    >
      {contexts.map((ctx) => (
        <option key={ctx} value={ctx}>
          {t(CONTEXT_KEYS[ctx])}
        </option>
      ))}
    </select>
  );
}
