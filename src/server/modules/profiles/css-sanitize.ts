import { PROFILE_CSS_SELECTORS } from "../../../shared/profile-platform.js";

const ALLOWED_SELECTORS = new Set<string>([...PROFILE_CSS_SELECTORS]);

const BLOCKED_AT_RULES = ["@import", "@charset", "@namespace", "@media", "@supports", "@keyframes", "@font-face", "@page"];
const BLOCKED_DECLARATION_NAMES = new Set([
  "behavior",
  "-moz-binding",
  "filter",
  "backdrop-filter",
]);
const BLOCKED_VALUE_PATTERNS = [
  /url\s*\(/i,
  /expression\s*\(/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:/i,
  /-moz-binding/i,
  /@import/i,
];

const BLOCKED_PROPERTY_VALUE_COMBOS: Array<{ prop: RegExp; value: RegExp }> = [
  { prop: /^position$/i, value: /fixed/i },
  { prop: /^z-index$/i, value: /^\s*9\d{3,}\s*$/ },
];

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function selectorAllowed(rawSelector: string): boolean {
  const selector = rawSelector.trim().toLowerCase();
  if (!selector) return false;
  // Only allow selectors rooted at .profile with optional descendants/combinators
  // of the documented API. Reject anything with :root, html, body, *, #, IDs
  // reaching outside, or pseudo-elements that could overlay the app.
  if (/[#]/.test(selector)) return false;
  if (/(^|[\s,>+~])(html|body|:root|head|script|iframe|object|embed)\b/.test(selector)) return false;
  if (selector.includes("*")) return false;
  const parts = selector.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 8) return false;
  for (const part of parts) {
    // Every comma-separated selector must start with .profile
    if (!part.startsWith(".profile")) return false;
    // After .profile, only allow documented class continuations, spaces,
    // combinators, and simple element/type selectors without escaping.
    const remainder = part.slice(".profile".length);
    if (/[#"']/.test(remainder)) return false;
    if (/::?(before|after|first-line|first-letter|selection|marker|backdrop)/.test(part)) {
      // Allow only ::selection inside profile scope? Keep it simple: reject.
      return false;
    }
    // Reject attribute selectors that could match app internals
    if (/\[/.test(remainder)) return false;
    // Reject :has, :not with complex content, :global etc.
    if (/:(has|global|local|host|slotted)/.test(part)) return false;
  }
  // At least the root must be a known selector prefix
  const root = parts[0]!.split(/[\s>+~:]/)[0]!.trim();
  if (!ALLOWED_SELECTORS.has(root as (typeof ALLOWED_SELECTORS extends Set<infer T> ? T : never))) {
    // Allow .profile-artifact--<known> variants only for documented ones
    if (!root.startsWith(".profile-artifact--")) return false;
    const allowedVariants = new Set([
      ".profile-artifact--obsessions",
      ".profile-artifact--quote",
      ".profile-artifact--favorites",
    ]);
    if (!allowedVariants.has(root)) return false;
  }
  return true;
}

function declarationAllowed(property: string, value: string): boolean {
  const prop = property.trim().toLowerCase();
  const val = value.trim();
  if (!prop || !val) return false;
  if (prop.startsWith("--")) {
    // Allow custom properties only if value is safe
    if (BLOCKED_VALUE_PATTERNS.some((re) => re.test(val))) return false;
    return val.length <= 500;
  }
  if (BLOCKED_DECLARATION_NAMES.has(prop)) return false;
  if (BLOCKED_VALUE_PATTERNS.some((re) => re.test(val))) return false;
  if (/<\/?(script|iframe|object|embed|link|style|img)/i.test(val)) return false;
  for (const combo of BLOCKED_PROPERTY_VALUE_COMBOS) {
    if (combo.prop.test(prop) && combo.value.test(val)) return false;
  }
  // Block fixed overlays and viewport-locked constructs
  if (/position\s*:\s*fixed/i.test(`${prop}:${val}`)) return false;
  return true;
}

/**
 * Sanitize and scope profile custom CSS.
 * - Keeps only rules whose selectors are rooted at documented `.profile*` API.
 * - Drops at-rules that load external resources or change cascade globally.
 * - Drops declarations that load URLs, fix overlays, or execute behavior.
 * Returns sanitized CSS (possibly empty string). Throws on oversize input.
 */
export function sanitizeProfileCss(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > 8000) {
    throw new Error("Custom CSS is too large");
  }
  const noComments = stripComments(trimmed);
  if (BLOCKED_AT_RULES.some((rule) => noComments.toLowerCase().includes(rule))) {
    // Remove blocked at-rules entirely rather than rejecting the whole sheet
    // to keep useful customization while preventing resource loading.
  }

  const output: string[] = [];
  // Very small rule parser: split on } then on { . Good enough for flat
  // author CSS; nested at-rules are dropped.
  const chunks = noComments.split("}");
  for (const chunk of chunks) {
    const braceIndex = chunk.indexOf("{");
    if (braceIndex === -1) continue;
    const rawSelector = chunk.slice(0, braceIndex).trim();
    const rawBody = chunk.slice(braceIndex + 1).trim();
    if (!rawSelector || !rawBody) continue;
    const lowerSelector = rawSelector.toLowerCase();
    if (lowerSelector.startsWith("@")) continue;
    if (BLOCKED_AT_RULES.some((rule) => lowerSelector.startsWith(rule))) continue;
    if (!selectorAllowed(rawSelector)) continue;

    const declarations = rawBody
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .flatMap((decl) => {
        const colon = decl.indexOf(":");
        if (colon === -1) return [];
        const prop = decl.slice(0, colon).trim();
        const val = decl.slice(colon + 1).trim();
        if (!declarationAllowed(prop, val)) return [];
        // Basic length guard per declaration
        if (`${prop}:${val}`.length > 1000) return [];
        return [`${prop}:${val}`];
      });
    if (declarations.length === 0) continue;
    // Prefix scope: selectors are already required to start with .profile,
    // so emit as-is under the profile content root contract.
    output.push(`${rawSelector}{${declarations.join(";")}}`);
    if (output.join("").length > 8000) break;
  }
  const result = output.join("\n").trim();
  return result ? result : null;
}
