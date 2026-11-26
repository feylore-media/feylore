export interface M3uChannelEntry {
  name: string;
  groupTitle?: string;
  logoUrl?: string;
  streamUrl: string;
  tvgId?: string;
}

function readAttribute(line: string, key: string): string | undefined {
  const match = line.match(new RegExp(`${key}="([^"]*)"`, "i"));
  return match?.[1];
}

export function parseM3u(content: string): M3uChannelEntry[] {
  const lines = content.split(/\r?\n/);
  const channels: M3uChannelEntry[] = [];
  let pending: Partial<M3uChannelEntry> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#EXTINF:")) {
      const nameMatch = trimmed.match(/,(.+)$/);
      pending = {
        name: nameMatch?.[1]?.trim() || "Unknown",
        tvgId: readAttribute(trimmed, "tvg-id"),
        logoUrl: readAttribute(trimmed, "tvg-logo"),
        groupTitle: readAttribute(trimmed, "group-title"),
      };
      continue;
    }

    if (trimmed.startsWith("#")) continue;

    if (pending) {
      channels.push({
        name: pending.name ?? "Unknown",
        groupTitle: pending.groupTitle,
        logoUrl: pending.logoUrl,
        streamUrl: trimmed,
        tvgId: pending.tvgId,
      });
      pending = null;
    }
  }

  return channels;
}
