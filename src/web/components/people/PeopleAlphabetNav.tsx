import styles from "./people.module.css";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

interface Props {
  activeLetter?: string;
  availableLetters: string[];
  onSelect: (letter: string | undefined) => void;
}

export function PeopleAlphabetNav({
  activeLetter,
  availableLetters,
  onSelect,
}: Props) {
  return (
    <nav className={styles.alphabetNav} aria-label="Alphabet navigation">
      <button
        onClick={() => onSelect(undefined)}
        className={!activeLetter ? styles.alphabetNavActive : undefined}
      >
        All
      </button>
      {ALPHABET.map((letter) => {
        const available = availableLetters.includes(letter);
        return (
          <button
            key={letter}
            onClick={() => available && onSelect(letter)}
            disabled={!available}
            className={[
              activeLetter === letter ? styles.alphabetNavActive : "",
              !available ? styles.alphabetNavDisabled : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}
