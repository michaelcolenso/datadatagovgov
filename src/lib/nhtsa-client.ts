// ============================================================================
// NHTSA API Client
// ============================================================================
// Wraps the two NHTSA endpoints we need:
//   1. vPIC — Vehicle Product Information Catalog (Makes, Models)
//   2. Recalls — Recall campaigns by Make/Model/Year
//
// Every response is validated with Zod so bad data blows up early,
// not silently downstream.
// ============================================================================

import { z } from "zod";
import { throttledFetch } from "./rate-limiter.js";

// ---------------------------------------------------------------------------
// Base URLs
// ---------------------------------------------------------------------------
const VPIC_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const RECALLS_BASE = "https://api.nhtsa.gov/recalls/recallsByVehicle";

// ---------------------------------------------------------------------------
// Zod Schemas — vPIC Makes
// ---------------------------------------------------------------------------
const VpicMakeSchema = z.object({
  Make_ID: z.number(),
  Make_Name: z.string(),
});

const VpicMakesResponseSchema = z.object({
  Count: z.number(),
  Results: z.array(VpicMakeSchema),
});

export type VpicMake = z.infer<typeof VpicMakeSchema>;

// ---------------------------------------------------------------------------
// Zod Schemas — vPIC Models for a Make
// ---------------------------------------------------------------------------
const VpicModelSchema = z.object({
  Make_ID: z.number(),
  Make_Name: z.string(),
  Model_ID: z.number(),
  Model_Name: z.string(),
});

const VpicModelsResponseSchema = z.object({
  Count: z.number(),
  Results: z.array(VpicModelSchema),
});

export type VpicModel = z.infer<typeof VpicModelSchema>;

// ---------------------------------------------------------------------------
// Zod Schemas — Recalls API
// ---------------------------------------------------------------------------
const RecallResultSchema = z.object({
  NHTSACampaignNumber: z.string(),
  ReportReceivedDate: z.string().optional().nullable(),
  Component: z.string().default("UNKNOWN"),
  Summary: z.string().default(""),
  Consequence: z.string().default(""),
  Remedy: z.string().default(""),
  Manufacturer: z.string().optional().nullable(),
  // There are more fields; we only grab what we need
});

const RecallsResponseSchema = z.object({
  Count: z.number(),
  results: z.array(RecallResultSchema),
});

export type RecallResult = {
  NHTSACampaignNumber: string;
  ReportReceivedDate?: string | null;
  Component: string;
  Summary: string;
  Consequence: string;
  Remedy: string;
  Manufacturer?: string | null;
};

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch all vehicle makes from the vPIC API.
 * Returns ~1,100 makes (cars, trucks, motorcycles, trailers, etc.)
 */
export async function fetchAllMakes(): Promise<VpicMake[]> {
  const url = `${VPIC_BASE}/GetAllMakes?format=json`;
  const data = await throttledFetch(url, VpicMakesResponseSchema, "GetAllMakes");
  console.log(`  ✓ Fetched ${data.Count} makes from NHTSA vPIC`);
  return data.Results;
}

/**
 * Fetch all models for a given make (by NHTSA MakeId).
 */
export async function fetchModelsForMake(
  makeId: number,
  makeName: string,
): Promise<VpicModel[]> {
  const url = `${VPIC_BASE}/GetModelsForMakeId/${makeId}?format=json`;
  const data = await throttledFetch(
    url,
    VpicModelsResponseSchema,
    `Models for ${makeName}`,
  );
  console.log(`  ✓ Fetched ${data.Count} models for ${makeName}`);
  return data.Results;
}

/**
 * Fetch recalls for a specific Make / Model / Year combination.
 */
export async function fetchRecalls(
  make: string,
  model: string,
  year: number,
): Promise<RecallResult[]> {
  // URL-encode make/model to handle spaces & special chars
  const encodedMake = encodeURIComponent(make);
  const encodedModel = encodeURIComponent(model);
  const url = `${RECALLS_BASE}?make=${encodedMake}&model=${encodedModel}&modelYear=${year}`;
  const data = await throttledFetch(
    url,
    RecallsResponseSchema,
    `Recalls: ${year} ${make} ${model}`,
  );

  return data.results.map((item) => ({
    NHTSACampaignNumber: item.NHTSACampaignNumber,
    ReportReceivedDate: item.ReportReceivedDate ?? null,
    Component: item.Component ?? "UNKNOWN",
    Summary: item.Summary ?? "",
    Consequence: item.Consequence ?? "",
    Remedy: item.Remedy ?? "",
    Manufacturer: item.Manufacturer ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Utility: Popular makes filter
// ---------------------------------------------------------------------------
// NHTSA returns ~1,100+ makes including trailers, equipment, etc.
// For initial ingestion we focus on the top passenger-vehicle makes
// to keep the first run manageable. Expand later.
// ---------------------------------------------------------------------------
export const POPULAR_MAKES = new Set([
  "ACURA", "ALFA ROMEO", "AUDI", "BMW", "BUICK", "CADILLAC",
  "CHEVROLET", "CHRYSLER", "DODGE", "FIAT", "FORD", "GENESIS",
  "GMC", "HONDA", "HYUNDAI", "INFINITI", "JAGUAR", "JEEP",
  "KIA", "LAND ROVER", "LEXUS", "LINCOLN", "MAZDA",
  "MERCEDES-BENZ", "MINI", "MITSUBISHI", "NISSAN", "PORSCHE",
  "RAM", "RIVIAN", "SUBARU", "TESLA", "TOYOTA", "VOLKSWAGEN",
  "VOLVO",
]);
