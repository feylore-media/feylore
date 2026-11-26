import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ShelfPublic } from "@shared/shelves";
import { SHELF_SCOPE_IDS } from "@shared/shelf-scopes";
import type { ShelfScopeId } from "@shared/shelf-scopes";
import { ShelfVisibilityIndicator } from "./ShelfVisibilityIndicator";
import { ShelfIcon } from "../icons/ShelfIcon";
import pageStyles from "../../app/pages/pages.module.css";

interface ShelvesPageProps {
  shelves: ShelfPublic[];
}

export function ShelvesList({ shelves }: ShelvesPageProps) {
  const { t } = useTranslation("shelves");

  return (
    <ul className={pageStyles.list}>
      {shelves.map((s) => (
        <li key={s.id} className={pageStyles.listItem}>
          <Link to={`/shelves/${s.id}`}>
            <ShelfIcon iconId={s.icon} identity className={pageStyles.listIcon} />
            {s.name}
            <ShelfVisibilityIndicator
              visibility={s.visibility}
              isOwner={s.isOwner}
            />
          </Link>
          <span className={pageStyles.lead}>
            {" "}
            · {t(`scopes.${s.scope as ShelfScopeId}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export { SHELF_SCOPE_IDS };
