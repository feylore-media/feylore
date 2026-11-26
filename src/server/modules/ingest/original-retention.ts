import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter } from "../storage/adapter.js";

export async function archiveOriginalToTarGz(params: {
  sourceAdapter: StorageAdapter;
  sourceRelativePath: string;
  destAdapter: StorageAdapter;
  destRelativeArchivePath: string;
}): Promise<void> {
  const sourceFull = await params.sourceAdapter.resolve(
    params.sourceRelativePath,
  );
  const archiveRelative = params.destRelativeArchivePath.endsWith(".tar.gz")
    ? params.destRelativeArchivePath
    : `${params.destRelativeArchivePath}.tar.gz`;
  const destFull = await params.destAdapter.resolve(archiveRelative);
  await fs.mkdir(path.dirname(destFull), { recursive: true });

  const sourceDir = path.dirname(sourceFull);
  const sourceName = path.basename(sourceFull);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "tar",
      ["-czf", destFull, "-C", sourceDir, sourceName],
      { stdio: "ignore" },
    );
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar archive failed with exit code ${code}`));
    });
  });
}
