import { plainTextFromHtml } from "@shared/plain-text";

export function PodcastDescription({
  text,
  className,
}: {
  text?: string | null;
  className?: string;
}) {
  const plain = plainTextFromHtml(text);
  if (!plain) return null;
  return <p className={className}>{plain}</p>;
}
