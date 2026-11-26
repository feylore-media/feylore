import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProfileCosmetics } from "@shared/profile-platform";
import type { ShelfEditorPublic } from "@shared/shelves";
import { api } from "../../app/api";
import { UserHandle, UserIdentity } from "../users";
import styles from "./shelf-editor.module.css";

interface UserSearchResult {
  id: string;
  username: string;
  displayName: string;
  cosmetics?: ProfileCosmetics | null;
}

interface ShelfEditorsControlProps {
  editors: ShelfEditorPublic[];
  onChange: (editors: ShelfEditorPublic[]) => void;
  confirmEmptyEditors: boolean;
  onConfirmEmptyEditorsChange: (confirmed: boolean) => void;
}

export function ShelfEditorsControl({
  editors,
  onChange,
  confirmEmptyEditors,
  onConfirmEmptyEditorsChange,
}: ShelfEditorsControlProps) {
  const { t } = useTranslation("shelves");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      void api<{ data: UserSearchResult[] }>(
        `/users/search?q=${encodeURIComponent(query.trim())}`,
      ).then((r) => setResults(r.data));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  function addEditor(user: UserSearchResult) {
    if (editors.some((e) => e.userId === user.id)) return;
    onChange([
      ...editors,
      {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        cosmetics: user.cosmetics ?? null,
      },
    ]);
    setQuery("");
    setResults([]);
    setSearchOpen(false);
  }

  function removeEditor(userId: string) {
    onChange(editors.filter((e) => e.userId !== userId));
  }

  return (
    <div className={styles.editorsSection}>
      <h4 className={styles.sectionTitle}>{t("editorsTitle")}</h4>
      <p className={styles.sectionLead}>{t("editorsLead")}</p>

      {editors.length > 0 && (
        <ul className={styles.editorsList}>
          {editors.map((e) => (
            <li key={e.userId} className={styles.editorRow}>
              <span className={styles.editorName}>
                <UserIdentity
                  user={{
                    username: e.username,
                    displayName: e.displayName,
                    cosmetics: e.cosmetics ?? null,
                  }}
                  variant="compact"
                />
              </span>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => removeEditor(e.userId)}
              >
                {t("removeEditor")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!searchOpen ? (
        <button
          type="button"
          className={styles.addAction}
          onClick={() => setSearchOpen(true)}
        >
          + {t("addPeople")}
        </button>
      ) : (
        <div className={styles.searchWrap}>
          <input
            id="editorSearch"
            className={styles.controlFull}
            type="search"
            placeholder={t("searchUsersPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          {results.length > 0 && (
            <ul className={styles.searchResults}>
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={styles.searchResultItem}
                    onClick={() => addEditor(u)}
                  >
                    {/* Selection affordance, not navigation: no nested link. */}
                    <span>
                      {u.displayName} <UserHandle username={u.username} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editors.length === 0 && (
        <div className={styles.callout}>
          <p>{t("emptyEditorsHint")}</p>
          <label className={styles.calloutLabel}>
            <input
              type="checkbox"
              checked={confirmEmptyEditors}
              onChange={(e) => onConfirmEmptyEditorsChange(e.target.checked)}
            />
            {t("confirmEmptyEditors")}
          </label>
        </div>
      )}
    </div>
  );
}
