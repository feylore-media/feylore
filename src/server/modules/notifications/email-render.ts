export interface NotificationEmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface RenderingInput {
  title: string;
  body: string | null;
  href: string | null;
  /** Absolute base for internal links, e.g. the configured APP_URL. */
  appUrl: string;
}

const FOOTER_TEXT =
  "You received this email because you enabled email notifications for this activity in Feylore.";

/**
 * Resolve an internal, root-relative href against the app URL. Absolute URLs
 * and non-root paths are not linked: notification hrefs come from Feylore
 * sources and must stay on the server origin.
 */
function resolveHref(href: string | null, appUrl: string): string | null {
  if (!href || !href.startsWith("/")) return null;
  return `${appUrl.replace(/\/$/, "")}${href}`;
}

/** Build the subject/text/html message for an in-app notification email. */
export function renderNotificationEmail(input: RenderingInput): NotificationEmailContent {
  const href = resolveHref(input.href, input.appUrl);
  const subject = `Feylore: ${input.title}`;

  const textLines = [input.title];
  if (input.body) textLines.push("", input.body);
  if (href) textLines.push("", href);
  textLines.push("", FOOTER_TEXT);
  const text = textLines.join("\n");

  const htmlParts = [
    `<p style="margin:0 0 12px;"><strong>${escapeHtml(input.title)}</strong></p>`,
  ];
  if (input.body) {
    htmlParts.push(`<p style="margin:0 0 12px;">${escapeHtml(input.body)}</p>`);
  }
  if (href) {
    htmlParts.push(
      `<p style="margin:0 0 12px;"><a href="${escapeHtml(href)}">${escapeHtml(href)}</a></p>`,
    );
  }
  htmlParts.push(`<p style="margin:0;color:#6b7280;font-size:12px;">${FOOTER_TEXT}</p>`);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827;">${htmlParts.join("")}</div>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}