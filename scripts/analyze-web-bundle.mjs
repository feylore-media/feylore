import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const assets = "dist/web/assets";
const mapName = readdirSync(assets).find(
  (name) => name.startsWith("index-") && name.endsWith(".js.map"),
);
if (!mapName) throw new Error("Build with --sourcemap first");

const map = JSON.parse(readFileSync(join(assets, mapName), "utf8"));
const groups = new Map();
for (const [index, source] of map.sources.entries()) {
  const packageName = source.match(/node_modules\/\.pnpm\/([^/]+)/)?.[1];
  const localName = source.match(/src\/web\/([^/]+)\/([^/]+)/);
  const group =
    packageName ?? (localName ? localName.slice(1).join("/") : "other");
  groups.set(
    group,
    (groups.get(group) ?? 0) + (map.sourcesContent[index]?.length ?? 0),
  );
}
console.log(`Source files: ${map.sources.length}`);
for (const [name, size] of [...groups].sort((a, b) => b[1] - a[1])) {
  console.log(`${(size / 1024).toFixed(1).padStart(8)} KiB  ${name}`);
}
