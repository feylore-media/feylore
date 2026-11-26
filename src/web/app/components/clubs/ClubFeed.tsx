import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ClubFeedItem, ClubFeedPage } from "@shared/clubs";
import { UserIdentity } from "../../../components/users";
import { api } from "../../api";
import pageStyles from "../../pages/pages.module.css";

export function ClubFeed({ clubId }: { clubId: string }) {
  const { t } = useTranslation("clubs");
  const [items, setItems] = useState<ClubFeedItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (append = false) => {
      const params = new URLSearchParams();
      if (append && cursor) params.set("cursor", cursor);
      const qs = params.toString();
      void api<{ data: ClubFeedPage }>(
        `/clubs/${clubId}/feed${qs ? `?${qs}` : ""}`,
      )
        .then((r) => {
          setItems((prev) =>
            append ? [...prev, ...r.data.items] : r.data.items,
          );
          setCursor(r.data.nextCursor);
        })
        .finally(() => setLoading(false));
    },
    [clubId, cursor],
  );

  useEffect(() => {
    load(false);
  }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && items.length === 0) {
    return <p className={pageStyles.lead}>{t("loadingFeed")}</p>;
  }

  if (items.length === 0) {
    return <p className={pageStyles.lead}>{t("noFeedItems")}</p>;
  }

  return (
    <div>
      <ul className={pageStyles.list}>
        {items.map((item) => (
          <li key={item.id} className={pageStyles.listItem}>
            <span>
              <UserIdentity
                user={{
                  username: item.actorUsername,
                  displayName: item.actorDisplayName,
                  cosmetics: item.actorCosmetics ?? null,
                }}
                variant="compact"
              />{" "}
              {item.summary}
            </span>
            {item.topicId && (
              <>
                {" "}
                <Link to={`/clubs/${clubId}/topics/${item.topicId}`}>
                  {t("viewTopic")}
                </Link>
              </>
            )}
            <span className={pageStyles.lead}>
              {" "}
              · {new Date(item.createdAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      {cursor && (
        <button type="button" onClick={() => load(true)}>
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}
