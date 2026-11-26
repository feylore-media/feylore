import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PersonEditorSummary,
  PersonIdentifierEditorRow,
  PersonEvidenceIdentifier,
  PersonEvidenceLink,
  PersonLinkEditorRow,
  PersonProviderStatus,
} from "@shared/person-metadata-editor";
import { api } from "../../app/api";
import { Button } from "../primitives";
import { MetadataEditCollapsibleSection } from "../books/metadata-edit/MetadataEditCollapsibleSection";
import styles from "./people.module.css";
import { PERSON_LINK_KINDS } from "@shared/people";

const LINK_KINDS = PERSON_LINK_KINDS;

interface LinkDraft {
  kind: (typeof LINK_KINDS)[number];
  label: string;
  url: string;
}

interface PeopleEditIdentitySectionsProps {
  slug: string;
  person: PersonEditorSummary;
  links: PersonLinkEditorRow[];
  linkCandidates: PersonEvidenceLink[];
  identifiers: PersonIdentifierEditorRow[];
  identifierCandidates: PersonEvidenceIdentifier[];
  providers: PersonProviderStatus[];
  onChanged: () => void;
}

export function PeopleEditIdentitySections({
  slug,
  links,
  linkCandidates,
  identifiers,
  identifierCandidates,
  providers,
  onChanged,
}: PeopleEditIdentitySectionsProps) {
  const { t } = useTranslation("people");

  const [editingLink, setEditingLink] = useState<{
    mode: "new" | "edit";
    id?: string;
  } | null>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraft>({
    kind: "website",
    label: "",
    url: "",
  });
  const [linksSubmitting, setLinksSubmitting] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);

  const [identifierProvider, setIdentifierProvider] = useState("");
  const [identifierValue, setIdentifierValue] = useState("");
  const [identifiersSubmitting, setIdentifiersSubmitting] = useState(false);
  const [identifiersError, setIdentifiersError] = useState<string | null>(null);

  async function adoptLink(candidate: PersonEvidenceLink) {
    setLinksError(null);
    try {
      await api(`/people/${slug}/links/adopt`, {
        method: "POST",
        body: JSON.stringify(candidate),
      });
      onChanged();
    } catch (err) {
      setLinksError(err instanceof Error ? err.message : t("saveLinkError"));
    }
  }

  async function adoptIdentifier(candidate: PersonEvidenceIdentifier) {
    setIdentifiersError(null);
    try {
      await api(`/people/${slug}/identifiers/adopt`, {
        method: "POST",
        body: JSON.stringify(candidate),
      });
      onChanged();
    } catch (err) {
      setIdentifiersError(err instanceof Error ? err.message : t("identifierSaveError"));
    }
  }

  function startAddLink() {
    setEditingLink({ mode: "new" });
    setLinkDraft({ kind: "website", label: "", url: "" });
    setLinksError(null);
  }

  function startEditLink(link: PersonLinkEditorRow) {
    setEditingLink({ mode: "edit", id: link.id });
    setLinkDraft({ kind: link.kind, label: link.label ?? "", url: link.url });
    setLinksError(null);
  }

  async function saveLink(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLink) return;
    setLinksSubmitting(true);
    setLinksError(null);
    try {
      const body = JSON.stringify({
        ...linkDraft,
        label: linkDraft.label.trim() || undefined,
      });
      if (editingLink.mode === "new") {
        await api(`/people/${slug}/links`, {
          method: "POST",
          body,
        });
      } else {
        await api(`/people/${slug}/links/${editingLink.id}`, {
          method: "PATCH",
          body,
        });
      }
      setEditingLink(null);
      onChanged();
    } catch (err) {
      setLinksError(err instanceof Error ? err.message : t("saveLinkError"));
    } finally {
      setLinksSubmitting(false);
    }
  }

  async function deleteLink(linkId: string) {
    setLinksError(null);
    try {
      await api(`/people/${slug}/links/${linkId}`, { method: "DELETE" });
      if (editingLink?.id === linkId) setEditingLink(null);
      onChanged();
    } catch (err) {
      setLinksError(err instanceof Error ? err.message : t("deleteLinkError"));
    }
  }

  async function addIdentifier(e: React.FormEvent) {
    e.preventDefault();
    const provider = identifierProvider.trim();
    const identifier = identifierValue.trim();
    if (!provider || !identifier) return;
    setIdentifiersSubmitting(true);
    setIdentifiersError(null);
    try {
      await api(`/people/${slug}/identifiers`, {
        method: "POST",
        body: JSON.stringify({ provider, identifier }),
      });
      setIdentifierProvider("");
      setIdentifierValue("");
      onChanged();
    } catch (err) {
      setIdentifiersError(
        err instanceof Error ? err.message : t("identifierSaveError"),
      );
    } finally {
      setIdentifiersSubmitting(false);
    }
  }

  async function deleteIdentifier(providerKey: string) {
    setIdentifiersError(null);
    try {
      await api(`/people/${slug}/identifiers/${encodeURIComponent(providerKey)}`, {
        method: "DELETE",
      });
      onChanged();
    } catch (err) {
      setIdentifiersError(
        err instanceof Error ? err.message : t("identifierDeleteError"),
      );
    }
  }

  return (
    <>
      <MetadataEditCollapsibleSection title={t("linksTitle")}>
        {linkCandidates.filter((candidate) => !links.some((link) =>
          link.kind === candidate.kind && link.url === candidate.url)).map((candidate) => (
          <div className={styles.identityRow} key={`${candidate.sourceKey}:${candidate.kind}:${candidate.url}`}>
            <span className={styles.kindBadge}>{t(`linkKind_${candidate.kind}`)}</span>
            <a href={candidate.url} target="_blank" rel="noopener noreferrer">
              {candidate.label}
            </a>
            <span className={styles.sourceBadge}>{candidate.sourceKey}</span>
            <Button type="button" onClick={() => void adoptLink(candidate)}
              aria-label={`${t("adoptLink")} ${candidate.label}`}>←</Button>
          </div>
        ))}
        {links.length === 0 && !editingLink ? (
          <p className={styles.empty}>{t("linksEmpty")}</p>
        ) : (
          <ul className={styles.identityList}>
            {links.map((link) => (
              <li key={link.id} className={styles.identityRow}>
                <span className={styles.kindBadge}>{t(`linkKind_${link.kind}`)}</span>
                <span className={styles.identityRowMain}>
                  <span className={styles.identityRowTitle}>
                    {link.label || link.url}
                  </span>
                  {link.label && (
                    <a
                      className={styles.identityRowUrl}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.url}
                    </a>
                  )}
                  {link.sourceLabel && (
                    <span className={styles.sourceBadge}>{link.sourceLabel}</span>
                  )}
                </span>
                <span className={styles.identityActions}>
                  <Button type="button" onClick={() => startEditLink(link)}>
                    {t("editLink")}
                  </Button>
                  <Button type="button" onClick={() => void deleteLink(link.id)}>
                    {t("deleteLink")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {editingLink ? (
          <form className={styles.identityForm} onSubmit={(e) => void saveLink(e)}>
            <div className={styles.identityField}>
              <label className={styles.identityFieldLabel} htmlFor="link-kind">
                {t("linkKind")}
              </label>
              <select
                id="link-kind"
                className={styles.identityFieldInput}
                value={linkDraft.kind}
                onChange={(e) =>
                  setLinkDraft((d) => ({
                    ...d,
                    kind: e.target.value as LinkDraft["kind"],
                  }))
                }
              >
                {LINK_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`linkKind_${kind}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.identityField}>
              <label className={styles.identityFieldLabel} htmlFor="link-label">
                {t("linkLabel")}
              </label>
              <input
                id="link-label"
                className={styles.identityFieldInput}
                value={linkDraft.label}
                onChange={(e) =>
                  setLinkDraft((d) => ({ ...d, label: e.target.value }))
                }
                type="text"
              />
            </div>
            <div className={styles.identityField}>
              <label className={styles.identityFieldLabel} htmlFor="link-url">
                {t("linkUrl")}
              </label>
              <input
                id="link-url"
                className={styles.identityFieldInput}
                value={linkDraft.url}
                onChange={(e) =>
                  setLinkDraft((d) => ({ ...d, url: e.target.value }))
                }
                type="url"
                required
              />
            </div>
            <div className={styles.editorActionRow}>
              <Button
                type="submit"
                variant="primary"
                disabled={linksSubmitting}
              >
                {editingLink.mode === "new" ? t("addLinkSubmit") : t("updateLink")}
              </Button>
              <Button
                type="button"
                onClick={() => setEditingLink(null)}
                disabled={linksSubmitting}
              >
                {t("cancelEdit")}
              </Button>
            </div>
            {linksError && (
              <p className={styles.errorNote} role="alert">
                {linksError}
              </p>
            )}
          </form>
        ) : (
          <div className={styles.editorActionRow}>
            <Button type="button" onClick={startAddLink}>
              {t("addLink")}
            </Button>
          </div>
        )}
      </MetadataEditCollapsibleSection>

      <details>
        <summary>{t("identifiersTitle")}</summary>
        {identifierCandidates.filter((candidate) => !identifiers.some((item) =>
          item.provider === candidate.provider && item.identifier === candidate.identifier)).map((candidate) => (
          <div className={styles.identityRow} key={`${candidate.sourceKey}:${candidate.provider}:${candidate.identifier}`}>
            <span className={styles.kindBadge}>{candidate.provider}</span>
            <span>{candidate.identifier}</span>
            <span className={styles.sourceBadge}>{candidate.sourceKey}</span>
            <Button type="button" onClick={() => void adoptIdentifier(candidate)}
              aria-label={`${t("adoptIdentifier")} ${candidate.provider}`}>←</Button>
          </div>
        ))}
        {identifiers.length === 0 ? (
          <p className={styles.empty}>{t("identifiersEmpty")}</p>
        ) : (
          <ul className={styles.identityList}>
            {identifiers.map((idn) => (
              <li key={idn.provider} className={styles.identityRow}>
                <span className={styles.kindBadge}>
                  {idn.providerLabel ?? idn.provider}
                </span>
                <span className={styles.identityRowMain}>
                  <span className={styles.identityRowTitle}>{idn.identifier}</span>
                  {idn.sourceLabel && (
                    <span className={styles.sourceBadge}>{idn.sourceLabel}</span>
                  )}
                </span>
                <span className={styles.identityActions}>
                  <Button
                    type="button"
                    onClick={() => void deleteIdentifier(idn.provider)}
                  >
                    {t("deleteIdentifier")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form className={styles.identityForm} onSubmit={(e) => void addIdentifier(e)}>
          <div className={styles.identityFormGrid}>
            <div className={styles.identityField}>
              <label
                className={styles.identityFieldLabel}
                htmlFor="identifier-provider"
              >
                {t("identifierProvider")}
              </label>
              <input
                id="identifier-provider"
                className={styles.identityFieldInput}
                list="identifier-providers"
                value={identifierProvider}
                onChange={(e) => setIdentifierProvider(e.target.value)}
                type="text"
                placeholder={t("identifierProviderPlaceholder")}
              />
              <datalist id="identifier-providers">
                {providers.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </datalist>
            </div>
            <div className={styles.identityField}>
              <label
                className={styles.identityFieldLabel}
                htmlFor="identifier-value"
              >
                {t("identifierValue")}
              </label>
              <input
                id="identifier-value"
                className={styles.identityFieldInput}
                value={identifierValue}
                onChange={(e) => setIdentifierValue(e.target.value)}
                type="text"
                placeholder={t("identifierValuePlaceholder")}
              />
            </div>
          </div>
          <div className={styles.editorActionRow}>
            <Button
              type="submit"
              variant="primary"
              disabled={identifiersSubmitting || !identifierProvider.trim() || !identifierValue.trim()}
            >
              {t("addIdentifierSubmit")}
            </Button>
          </div>
          {identifiersError && (
            <p className={styles.errorNote} role="alert">
              {identifiersError}
            </p>
          )}
        </form>
      </details>
    </>
  );
}
