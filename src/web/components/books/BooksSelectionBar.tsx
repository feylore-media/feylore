import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api";
import { Button } from "../primitives";
import { SelectionBar, SelectionBarCount } from "../ui/SelectionBar";

interface Shelf {
  id: string;
  name: string;
}

interface BooksSelectionBarProps {
  bookIds: string[];
  onCancel: () => void;
  onDone: () => void;
}

export function BooksSelectionBar({
  bookIds,
  onCancel,
  onDone,
}: BooksSelectionBarProps) {
  const { t } = useTranslation("books");
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void api<{ data: Shelf[] }>("/shelves?scope=books")
      .then((r) => setShelves(r.data))
      .finally(() => setLoading(false));
  }, []);

  async function addAll(shelfId: string) {
    setAdding(true);
    try {
      await Promise.all(
        bookIds.map((bookId) =>
          api(`/shelves/${shelfId}/items`, {
            method: "POST",
            body: JSON.stringify({ subjectType: "book", subjectId: bookId }),
          }),
        ),
      );
      onDone();
    } finally {
      setAdding(false);
    }
  }

  if (bookIds.length === 0) return null;

  return (
    <SelectionBar label={t("selectionBar")}>
      <SelectionBarCount>{t("selected", { count: bookIds.length })}</SelectionBarCount>
      {!loading &&
        shelves.map((s) => (
          <Button
            key={s.id}
            type="button"
            disabled={adding}
            onClick={() => addAll(s.id)}
          >
            {s.name}
          </Button>
        ))}
      <Button type="button" onClick={onCancel}>
        {t("cancel")}
      </Button>
    </SelectionBar>
  );
}
