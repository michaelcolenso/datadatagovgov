// ============================================================================
// Shared Utilities — Slugs + Severity Classification
// ============================================================================

/**
 * Convert a vehicle name to a URL-safe slug.
 *   "F-150 Lightning" → "f-150-lightning"
 *   "MERCEDES-BENZ"   → "mercedes-benz"
 *   "CR-V"            → "cr-v"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-]+/g, "-") // replace non-alphanumeric (keep hyphens)
    .replace(/-+/g, "-")           // collapse multiple hyphens
    .replace(/^-|-$/g, "");        // trim leading/trailing hyphens
}

// ---------------------------------------------------------------------------
// Severity Classification
// ---------------------------------------------------------------------------
// Maps NHTSA component strings to severity levels for the frontend badge.
// NHTSA components are uppercase, pipe-delimited, e.g. "AIR BAGS:FRONTAL"
// ---------------------------------------------------------------------------

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

const SEVERITY_MAP: Record<string, Severity> = {
  // CRITICAL — immediate safety risk
  "ENGINE": "CRITICAL",
  "FUEL SYSTEM": "CRITICAL",
  "BRAKES": "CRITICAL", 
  "BRAKE": "CRITICAL",
  "STEERING": "CRITICAL",
  "POWER TRAIN": "CRITICAL",
  "POWERTRAIN": "CRITICAL",

  // HIGH — occupant protection systems
  "AIR BAG": "HIGH",
  "AIR BAGS": "HIGH",
  "SEAT BELT": "HIGH",
  "SEAT BELTS": "HIGH",
  "CHILD SEAT": "HIGH",
  "SUSPENSION": "HIGH",
  "STRUCTURE": "HIGH",

  // MEDIUM — visibility, electrical
  "ELECTRICAL": "MEDIUM",
  "ELECTRICAL SYSTEM": "MEDIUM",
  "LIGHTING": "MEDIUM",
  "VISIBILITY": "MEDIUM",
  "WINDSHIELD": "MEDIUM",
  "WIPERS": "MEDIUM",
  "TIRES": "MEDIUM",

  // LOW — cosmetic, labels
  "LABELS": "LOW",
  "EXTERIOR LIGHTING": "LOW",
  "EQUIPMENT": "LOW",
};

/**
 * Classify a NHTSA component string into a severity level.
 * Checks for keyword matches since components can be compound.
 *   "AIR BAGS:FRONTAL:DRIVER SIDE" → "HIGH"
 *   "ENGINE AND ENGINE COOLING"     → "CRITICAL"
 */
export function classifySeverity(component: string): Severity {
  const upper = component.toUpperCase();

  // Check exact-ish matches first (most specific wins)
  // Order: CRITICAL → HIGH → MEDIUM → LOW
  for (const [keyword, level] of Object.entries(SEVERITY_MAP)) {
    if (upper.includes(keyword)) {
      return level;
    }
  }

  return "UNKNOWN";
}

/**
 * Parse NHTSA date strings like "01/15/2024" or "/Date(1705276800000)/"
 */
export function parseNhtsaDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;

  // Try .NET JSON date format: /Date(1705276800000)/
  const dotnetMatch = raw.match(/\/Date\((\d+)\)\//);
  if (dotnetMatch) {
    return new Date(parseInt(dotnetMatch[1], 10));
  }

  // Try MM/DD/YYYY
  const slashMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    return new Date(`${slashMatch[3]}-${slashMatch[1]}-${slashMatch[2]}`);
  }

  // Fallback: let Date parse it
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}
