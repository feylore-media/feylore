import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/primitives";
import styles from "./clubs.module.css";

export function ClubSpoiler({
  reason,
  children,
}: {
  reason?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation("clubs");
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return <span className={styles.clubSpoilerRevealed}>{children}</span>;
  }

  return (
    <div className={styles.clubSpoilerBlock}>
      <p className={styles.clubSpoilerReason}>{reason ?? t("spoilerHidden")}</p>
      <Button type="button" onClick={() => setRevealed(true)}>
        {t("revealSpoiler")}
      </Button>
    </div>
  );
}
