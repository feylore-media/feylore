/** Client-side id helper (not a security identifier). */
export function generateId(): string {
  return crypto.randomUUID();
}
