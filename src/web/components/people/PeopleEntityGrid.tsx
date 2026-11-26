import { PeopleEntityCard } from "./PeopleEntityCard";
import type { PeopleEntityCard as PeopleEntityCardType } from "@shared/people";
import styles from "./people.module.css";

interface Props {
  items: PeopleEntityCardType[];
}

export function PeopleEntityGrid({ items }: Props) {
  if (items.length === 0) {
    return <p className={styles.empty}>No people found.</p>;
  }

  return (
    <div className={styles.grid}>
      {items.map((entity) => (
        <PeopleEntityCard key={entity.id} entity={entity} />
      ))}
    </div>
  );
}
