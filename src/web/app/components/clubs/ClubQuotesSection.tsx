import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClubQuotePublic } from "@shared/clubs";
import { Button } from "../../../components/primitives";
import { UserIdentity } from "../../../components/users";
import { formatLocatorLabel } from "../../../components/work-detail/locatorPreview";
import { ClubQuotesDialog } from "./ClubQuotesDialog";
import styles from "./clubs.module.css";
import pageStyles from "../../pages/pages.module.css";

export function ClubQuotesSection({
  clubId,
  isMember,
  quotes: quotesProp,
  onRefresh,
}: {
  clubId: string;
  isMember: boolean;
  quotes?: ClubQuotePublic[];
  onRefresh?: () => void;
}) {
  const { t } = useTranslation("clubs");
  const preloaded = quotesProp !== undefined;
  const [quotes, setQuotes] = useState<ClubQuotePublic[]>(quotesProp ?? []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  useEffect(() => {
    if (quotesProp !== undefined) {
      setQuotes(quotesProp);
    }
  }, [quotesProp]);

  if (!preloaded) return null;
  if (quotes.length === 0 && !isMember) return null;

  return (
    <>
      <section
        className={styles.clubSection}
        aria-labelledby="club-quotes-heading"
      >
        <div className={styles.clubSectionHeaderRow}>
          <h2 id="club-quotes-heading" className={styles.clubSectionLabel}>
            {t("quotes")}
          </h2>
          <div className={styles.clubSectionActions}>
            {isMember && (
              <Button type="button" onClick={() => setComposeOpen(true)}>
                {t("shareQuote")}
              </Button>
            )}
            <Button type="button" onClick={() => setDialogOpen(true)}>
              {t("viewAllQuotes")}
            </Button>
          </div>
        </div>

        {quotes.length === 0 ? (
          <p className={pageStyles.lead}>{t("noQuotes")}</p>
        ) : (
          <ul className={styles.clubQuoteList}>
            {quotes.map((quote) => (
              <ClubQuoteItem key={quote.id} quote={quote} />
            ))}
          </ul>
        )}
      </section>

      <ClubQuotesDialog
        clubId={clubId}
        isMember={isMember}
        open={dialogOpen}
        composeOpen={composeOpen}
        onComposeOpenChange={setComposeOpen}
        onOpenChange={setDialogOpen}
        onChanged={onRefresh}
      />
    </>
  );
}

function ClubQuoteItem({ quote }: { quote: ClubQuotePublic }) {
  const { t } = useTranslation("clubs");

  return (
    <li className={styles.clubQuoteItem}>
      <blockquote className={styles.clubQuoteText}>{quote.text}</blockquote>
      <p className={styles.clubQuoteMeta}>
        <UserIdentity
          user={{
            username: quote.authorUsername,
            displayName: quote.authorDisplayName,
            cosmetics: quote.authorCosmetics ?? null,
          }}
          variant="compact"
        />
        <span className={pageStyles.lead}>
          {quote.locator ? ` · ${formatLocatorLabel(quote.locator)}` : ""}
          {" · "}
          {new Date(quote.createdAt).toLocaleDateString()}
        </span>
        {quote.sourceAnnotationId ? (
          <span className={styles.clubQuoteSourceTag}>
            {" "}
            · {t("quoteFromJournal")}
          </span>
        ) : null}
      </p>
    </li>
  );
}
