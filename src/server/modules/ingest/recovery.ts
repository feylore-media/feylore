import type { IngestItemService } from "./item-service.js";

export async function recoverIncompleteIngestItems(
  items: IngestItemService,
  enqueue: (ingestItemId: string) => Promise<void>,
) {
  const incomplete = await items.findIncomplete();
  for (const row of incomplete) {
    await items.update(row.id, {
      status: "queued",
      stageLogEntry: {
        stage: "recovery",
        at: new Date().toISOString(),
        message: "Re-queued after worker recovery",
      },
    });
    await enqueue(row.id);
  }
}
