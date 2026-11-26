import { PeopleEntityGrid } from "../../../components/people/PeopleEntityGrid";
import { PeopleAlphabetNav } from "../../../components/people/PeopleAlphabetNav";
import { PeoplePagination } from "../../../components/people/PeoplePagination";
import { usePeopleList } from "../../hooks/usePeopleList";
import styles from "../../../components/people/people.module.css";

interface Props {
  endpoint: string;
  title: string;
}

export function ContextualPeoplePage({ endpoint, title }: Props) {
  const { data, loading, error, query, setPage, setLetter } = usePeopleList(
    endpoint,
    { page: 1, size: 42, sort: "az" },
  );

  return (
    <div>
      <h1 className={styles.pageTitle}>{title}</h1>

      {error && <p className={styles.empty}>{error}</p>}

      {data && (
        <>
          <PeopleAlphabetNav
            activeLetter={query.letter}
            availableLetters={data.availableLetters}
            onSelect={setLetter}
          />

          {loading ? (
            <p className={styles.loading}>Loading…</p>
          ) : (
            <PeopleEntityGrid items={data.items} />
          )}

          <PeoplePagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
