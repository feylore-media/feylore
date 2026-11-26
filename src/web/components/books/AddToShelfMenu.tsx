import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api";
import { Button } from "../primitives";
import {
  CompactMenuAnchor,
  CompactMenuDivider,
  CompactMenuItem,
  CompactMenuPanel,
} from "../ui";
import menuStyles from "../ui/compact-menu.module.css";
import styles from "./books.module.css";

interface Shelf {
  id: string;
  name: string;
}

interface AddToShelfMenuProps {
  bookId: string;
  memberShelfIds?: string[];
  onAdded?: () => void;
}

export function AddToShelfMenu({
  bookId,
  memberShelfIds = [],
  onAdded,
}: AddToShelfMenuProps) {
  const { t } = useTranslation("books");
  const [open, setOpen] = useState(false);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void api<{ data: Shelf[] }>("/shelves?scope=books").then((r) =>
      setShelves(r.data),
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function addToShelf(shelfId: string) {
    await api(`/shelves/${shelfId}/items`, {
      method: "POST",
      body: JSON.stringify({ subjectType: "book", subjectId: bookId }),
    });
    setOpen(false);
    onAdded?.();
  }

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const res = await api<{ data: { id: string } }>("/shelves", {
      method: "POST",
      body: JSON.stringify({
        name: newName.trim(),
        scope: "books",
        visibility: "private",
      }),
    });
    await addToShelf(res.data.id);
    setNewName("");
    setCreating(false);
  }

  return (
    <CompactMenuAnchor ref={anchorRef}>
      <Button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {t("addToShelf")}
      </Button>
      {open && (
        <CompactMenuPanel ref={panelRef}>
          {shelves.length === 0 && !creating && (
            <p className={styles.cardMeta} style={{ padding: "var(--space-2)" }}>
              {t("noShelvesYet")}
            </p>
          )}
          {shelves.map((s) => {
            const isMember = memberShelfIds.includes(s.id);
            return (
              <CompactMenuItem
                key={s.id}
                member={isMember}
                disabled={isMember}
                onClick={() => addToShelf(s.id)}
              >
                {s.name}
                {isMember ? ` (${t("alreadyOnShelf")})` : ""}
              </CompactMenuItem>
            );
          })}
          <CompactMenuDivider />
          {creating ? (
            <form className={menuStyles.create} onSubmit={createAndAdd}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("newShelfName")}
                aria-label={t("newShelfName")}
                autoFocus
              />
              <Button type="submit" variant="primary">
                {t("create")}
              </Button>
              <Button type="button" onClick={() => setCreating(false)}>
                {t("cancel")}
              </Button>
            </form>
          ) : (
            <CompactMenuItem onClick={() => setCreating(true)}>
              {t("createShelf")}
            </CompactMenuItem>
          )}
        </CompactMenuPanel>
      )}
    </CompactMenuAnchor>
  );
}

/** @deprecated Use BooksSelectionBar instead */
export function BulkAddToShelf(_props: {
  bookIds: string[];
  onDone?: () => void;
}) {
  return null;
}
