/** Parse legacy combined series display values like "The Wheel of Time #3". */
export function parseCombinedSeriesValue(value: string): {
  name: string;
  position: number | null;
} {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+?)\s+#(\d+)\s*$/);
  if (!match) {
    return { name: trimmed, position: null };
  }
  return {
    name: match[1]!.trim(),
    position: Number.parseInt(match[2]!, 10),
  };
}
