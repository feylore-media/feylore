import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ShelfPublic } from "@shared/shelves";
import { BookCover } from "./BookCover";
import { ShelfVisibilityIndicator } from "../shelves/ShelfVisibilityIndicator";
import styles from "./books.module.css";

interface ShelfPreviewCardProps {
  shelf: ShelfPublic;
  coverFileIds?: (string | null)[];
  itemCount?: number;
  canEdit?: boolean;
}

export function ShelfPreviewCard({
  shelf,
  coverFileIds = [],
  itemCount,
  canEdit,
}: ShelfPreviewCardProps) {
  const { t } = useTranslation("books");
  const slots = coverFileIds.slice(0, 4);
  while (slots.length < 4) slots.push(null);

  return (
    <Link to={`/shelves/${shelf.id}`} className={styles.shelfPreview}>
      <div className={styles.shelfPreviewCovers}>
        {slots.map((id, i) => (
          <div key={i} className={styles.shelfPreviewCoverSlot}>
            {id ? (
              <BookCover
                coverFileId={id}
                title={shelf.name}
                size="small"
              />
            ) : (
              <div className={styles.coverPlaceholder} style={{ height: "100%" }}>
                {" "}
              </div>
            )}
          </div>
        ))}
      </div>
      <span className={styles.shelfPreviewName}>
        {shelf.name}
        <ShelfVisibilityIndicator
          visibility={shelf.visibility}
          isOwner={shelf.isOwner}
          canEdit={canEdit}
          compact
        />
      </span>
      {itemCount != null && (
        <span className={styles.shelfPreviewMeta}>
          {t("shelfItemCount", { count: itemCount })}
        </span>
      )}
    </Link>
  );
}
