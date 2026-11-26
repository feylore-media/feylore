import JSZip from "jszip";
import fs from "node:fs/promises";
import type { StorageAdapter } from "../../storage/adapter.js";
import { readEpubContainer } from "../../metadata/extractors/epub-opf.js";

export async function normalizeEpubFile(
  adapter: StorageAdapter,
  relativePath: string,
): Promise<{ normalizedPath: string; changed: boolean; log: string[] }> {
  const log: string[] = [];
  const full = await adapter.resolve(relativePath);
  const data = await fs.readFile(full);
  const zip = await JSZip.loadAsync(data);

  const { opfPath, opfXml: initialOpfXml } = await readEpubContainer(zip);
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error("Invalid EPUB: OPF file missing");
  }

  let opfContent = initialOpfXml;
  let changed = false;

  if (!opfContent.includes('version="3')) {
    opfContent = opfContent.replace(
      /<package([^>]*?)version="[^"]*"/,
      '<package$1version="3.0"',
    );
    if (!opfContent.includes('version="3')) {
      opfContent = opfContent.replace(
        "<package",
        '<package version="3.0"',
      );
    }
    changed = true;
    log.push("opf-version-updated");
  }

  if (!opfContent.includes("xmlns=")) {
    opfContent = opfContent.replace(
      "<package",
      '<package xmlns="http://www.idpf.org/2007/opf"',
    );
    changed = true;
    log.push("opf-namespace-added");
  }

  if (changed) {
    zip.file(opfPath, opfContent);
    const output = await zip.generateAsync({ type: "nodebuffer" });
    const tempPath = `${relativePath}.normalizing`;
    await adapter.write(tempPath, output);
    await adapter.delete(relativePath);
    await adapter.move(tempPath, relativePath);
    log.push("epub-normalized");
  } else {
    log.push("epub-already-compatible");
  }

  return { normalizedPath: relativePath, changed, log };
}
