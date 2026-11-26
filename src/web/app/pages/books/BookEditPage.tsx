import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { BookDetail } from "@shared/books";
import type { SlugStatus } from "@shared/media-identity";
import { api } from "../../api";
import { Button, TextField } from "../../../components/primitives";
import { bookPath } from "../../../routes/paths";
import styles from "../../../components/books/books.module.css";

export function BookEditPage() {
  const { t } = useTranslation("books");
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isNew = !slug || slug === "new";
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [authors, setAuthors] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew || !slug) return;
    void api<{ data: BookDetail }>(`/books/${slug}`).then((r) => {
      setTitle(r.data.title);
      setSubtitle(r.data.subtitle ?? "");
      setDescription(r.data.description ?? "");
      setAuthors(r.data.authors.map((a) => a.name).join(", "));
    });
  }, [slug, isNew]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const authorList = authors
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const body = {
      title,
      subtitle: subtitle || undefined,
      description: description || undefined,
      authors: authorList.length ? authorList : undefined,
    };

    try {
      if (isNew) {
        const res = await api<{
          data: { id: string; slug: string; slugStatus: SlugStatus };
        }>("/books", {
          method: "POST",
          body: JSON.stringify(body),
        });
        navigate(bookPath(res.data.slug));
      } else {
        await api(`/books/${slug}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        navigate(bookPath(slug!));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.managementPage}>
      <h1 className={styles.pageTitle}>
        {isNew ? t("createTitle") : t("editTitle")}
      </h1>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}
      <form className={styles.managementForm} onSubmit={onSubmit}>
        <TextField
          label={t("titleField")}
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <TextField
          label={t("subtitleField")}
          id="subtitle"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
        />
        <TextField
          label={t("descriptionField")}
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextField
          label={t("authorsLabel")}
          id="authors"
          value={authors}
          onChange={(e) => setAuthors(e.target.value)}
        />
        <div className={styles.managementActions}>
          <Button type="submit" variant="primary" disabled={saving}>
            {t("save")}
          </Button>
          <Button type="button" onClick={() => navigate(-1)}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
