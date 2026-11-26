import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";

const KOSYNC_SAMPLE_OFFSETS = [
  512, 2048, 8192, 32768, 131072, 524288, 2097152, 8388608,
];

export async function computeKosyncPartialMd5(
  filePath: string,
  fileSize: number,
): Promise<string> {
  const hash = createHash("md5");
  const fd = await import("node:fs/promises").then((fs) =>
    fs.open(filePath, "r"),
  );
  try {
    for (const offset of KOSYNC_SAMPLE_OFFSETS) {
      if (offset >= fileSize) break;
      const buffer = Buffer.alloc(1024);
      const { bytesRead } = await fd.read(buffer, 0, 1024, offset);
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await fd.close();
  }
  return hash.digest("hex");
}

export async function ensureRepresentationSyncIdentifier(
  db: Database,
  representationId: string,
  scheme: string,
  identifier: string,
) {
  const existing = await db.query.representationSyncIdentifiers.findFirst({
    where: eq(schema.representationSyncIdentifiers.identifier, identifier),
  });
  if (existing && existing.representationId !== representationId) return;

  await db
    .insert(schema.representationSyncIdentifiers)
    .values({
      id: generateId(),
      representationId,
      scheme,
      identifier,
    })
    .onConflictDoNothing();
}
