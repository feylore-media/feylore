import { Link } from "react-router";
import type { PeopleEntityCard as PeopleEntityCardType } from "@shared/people";
import styles from "./people.module.css";

interface Props {
  entity: PeopleEntityCardType;
}

export function PeopleEntityCard({ entity }: Props) {
  return (
    <Link to={`/people/${entity.slug}`} className={styles.card}>
      {entity.photoFileId ? (
        <img
          src={`/api/v1/files/${entity.photoFileId}`}
          alt={entity.name}
          className={styles.cardPhoto}
          loading="lazy"
        />
      ) : (
        <div className={styles.cardPhotoPlaceholder}>
          {entity.name.charAt(0)}
        </div>
      )}
      <div className={styles.cardName}>{entity.name}</div>
      {entity.roleLabels.length > 0 && (
        <div className={styles.cardRole}>
          {entity.roleLabels.join(" · ")}
        </div>
      )}
      {entity.nextWork && (
        <div className={styles.cardNextWork}>
          {entity.nextWork.title}
          {entity.nextWork.date && (
            <> — {new Date(entity.nextWork.date).getFullYear()}</>
          )}
        </div>
      )}
    </Link>
  );
}
