import path from "node:path";
import fs from "node:fs/promises";
import { PathTraversalError } from "../../shared/errors.js";

/** Lexical boundary check — no filesystem I/O, no symlink awareness. */
export function normalizeRelativePath(relativePath: string): string {
  if (relativePath.includes("\0")) {
    throw new PathTraversalError("Invalid path");
  }

  const posix = relativePath.replace(/\\/g, "/");

  if (posix === "" || posix === ".") {
    return ".";
  }

  if (posix.startsWith("/")) {
    throw new PathTraversalError("Absolute paths are not allowed");
  }

  if (/^[a-zA-Z]:/.test(posix)) {
    throw new PathTraversalError("Absolute paths are not allowed");
  }

  const normalized = path.posix.normalize(posix);
  if (
    normalized.startsWith("..") ||
    normalized.includes("/../") ||
    normalized === ".."
  ) {
    throw new PathTraversalError("Path traversal detected");
  }

  return normalized.replace(/^\.\//, "");
}

/** Lexical alias for zip/archive entry paths. */
export function normalizeZipEntryPath(entryPath: string): string {
  const normalized = normalizeRelativePath(entryPath.replace(/\\/g, "/"));
  if (normalized === ".") {
    throw new PathTraversalError("Invalid zip entry path");
  }
  return normalized;
}

/** Lexical containment on absolute paths — not a substitute for resolveSafePath(). */
export function isPathContainedInRoot(
  rootPath: string,
  absolutePath: string,
): boolean {
  const root = path.resolve(rootPath);
  const resolved = path.resolve(absolutePath);
  const relative = path.relative(root, resolved);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Authoritative filesystem/symlink boundary check before host FS access. */
export async function resolveSafePath(
  rootPath: string,
  relativePath: string,
): Promise<string> {
  const normalized = normalizeRelativePath(relativePath);
  const root = path.resolve(rootPath);
  const resolved = path.resolve(root, normalized);

  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PathTraversalError("Path escapes storage root");
  }

  // Symlink check: resolved path must stay under root
  try {
    const realRoot = await fs.realpath(root);
    const realResolved = await fs.realpath(resolved).catch(async () => {
      const parent = path.dirname(resolved);
      const realParent = await fs.realpath(parent);
      return path.join(realParent, path.basename(resolved));
    });
    const rel = path.relative(realRoot, realResolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new PathTraversalError("Symlink escapes storage root");
    }
  } catch (err) {
    if (err instanceof PathTraversalError) throw err;
    // File may not exist yet for write operations; path containment already verified
  }

  return resolved;
}
