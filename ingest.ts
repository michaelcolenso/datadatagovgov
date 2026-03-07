// ============================================================================
// RECALL ENGINE — Data Ingestion Script (Phase 2)
// ============================================================================
//
// Usage:
//   npx tsx src/scripts/ingest.ts                   # Full pipeline
//   npx tsx src/scripts/ingest.ts --makes-only      # Just sync makes
//   npx tsx src/scripts/ingest.ts --recalls          # Fetch recalls for all stored makes
//   npx tsx src/scripts/ingest.ts --make "Ford"      # Single make end-to-end
//   npx tsx src/scripts/ingest.ts --year-start 2018 --year-end 2025  # Year range
//
// The script is designed to be re-runnable (idempotent). It uses upserts
// so running it twice won't create duplicate rows.
// ============================================================================

import { PrismaClient, SeverityLevel } from "@prisma/client";
import {
  fetchAllMakes,
  fetchModelsForMake,
  fetchRecalls,
  POPULAR_MAKES,
  type VpicMake,
} from "../lib/nhtsa-client.js";
import { slugify, classifySeverity, parseNhtsaDate } from "../lib/utils.js";
import { sleep, getRequestStats } from "../lib/rate-limiter.js";

// ---------------------------------------------------------------------------
// Prisma client
// ---------------------------------------------------------------------------
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// CLI argument parsing (lightweight, no deps)
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    makesOnly: args.includes("--makes-only"),
    recallsOnly: args.includes("--recalls"),
    targetMake: null as string | null,
    yearStart: 2015,
    yearEnd: new Date().getFullYear(),
    allMakes: args.includes("--all-makes"), // include non-popular
    dryRun: args.includes("--dry-run"),
    limit: null as number | null, // max makes to process
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--make" && args[i + 1]) flags.targetMake = args[i + 1];
    if (args[i] === "--year-start" && args[i + 1]) flags.yearStart = parseInt(args[i + 1]);
    if (args[i] === "--year-end" && args[i + 1]) flags.yearEnd = parseInt(args[i + 1]);
    if (args[i] === "--limit" && args[i + 1]) flags.limit = parseInt(args[i + 1]);
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Phase 2a: Ingest Makes
// ---------------------------------------------------------------------------
async function ingestMakes(opts: { allMakes: boolean }): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  PHASE 2a: Ingesting Makes from NHTSA vPIC         ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const log = await prisma.ingestionLog.create({
    data: { runType: "makes", status: "started" },
  });

  try {
    const rawMakes = await fetchAllMakes();

    // Filter to popular makes unless --all-makes flag
    const filtered = opts.allMakes
      ? rawMakes
      : rawMakes.filter((m) => POPULAR_MAKES.has(m.Make_Name.toUpperCase()));

    console.log(
      `  Filtered to ${filtered.length} makes (${opts.allMakes ? "all" : "popular only"})`,
    );

    let savedCount = 0;
    for (const make of filtered) {
      const slug = slugify(make.Make_Name);
      if (!slug) continue; // skip empty names

      await prisma.make.upsert({
        where: { nhtsaId: make.Make_ID },
        update: { name: make.Make_Name, slug },
        create: {
          name: make.Make_Name,
          slug,
          nhtsaId: make.Make_ID,
        },
      });
      savedCount++;
    }

    console.log(`  ✅ Upserted ${savedCount} makes into the database`);

    await prisma.ingestionLog.update({
      where: { id: log.id },
      data: {
        status: "completed",
        recordsFound: rawMakes.length,
        recordsSaved: savedCount,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    await prisma.ingestionLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Phase 2b: Ingest Models for a single Make
// ---------------------------------------------------------------------------
async function ingestModelsForMake(make: {
  id: number;
  name: string;
  nhtsaId: number | null;
}): Promise<number> {
  if (!make.nhtsaId) {
    console.warn(`  ⚠ No NHTSA ID for ${make.name}, skipping models`);
    return 0;
  }

  const rawModels = await fetchModelsForMake(make.nhtsaId, make.name);
  let savedCount = 0;

  for (const model of rawModels) {
    const slug = slugify(model.Model_Name);
    if (!slug) continue;

    await prisma.model.upsert({
      where: {
        makeId_slug: { makeId: make.id, slug },
      },
      update: { name: model.Model_Name },
      create: {
        makeId: make.id,
        name: model.Model_Name,
        slug,
      },
    });
    savedCount++;
  }

  console.log(`    → Upserted ${savedCount} models for ${make.name}`);
  return savedCount;
}

// ---------------------------------------------------------------------------
// Phase 2c: Ingest Recalls for a Make/Model across a year range
// ---------------------------------------------------------------------------
async function ingestRecallsForModel(
  makeName: string,
  model: { id: number; name: string },
  yearStart: number,
  yearEnd: number,
): Promise<number> {
  let totalSaved = 0;

  for (let year = yearStart; year <= yearEnd; year++) {
    try {
      const recalls = await fetchRecalls(makeName, model.name, year);

      if (recalls.length === 0) continue;

      // Ensure VehicleYear exists
      const vehicleYear = await prisma.vehicleYear.upsert({
        where: {
          modelId_year: { modelId: model.id, year },
        },
        update: {},
        create: { modelId: model.id, year },
      });

      for (const recall of recalls) {
        const severity = classifySeverity(recall.Component);
        const nhtsaCampaignNumber = recall.NHTSACampaignNumber;

        await prisma.recall.upsert({
          where: {
            vehicleYearId_nhtsaCampaignNumber: {
              vehicleYearId: vehicleYear.id,
              nhtsaCampaignNumber,
            },
          },
          update: {
            component: recall.Component,
            summaryRaw: recall.Summary,
            consequenceRaw: recall.Consequence,
            remedyRaw: recall.Remedy,
            manufacturer: recall.Manufacturer ?? null,
            reportReceivedDate: parseNhtsaDate(recall.ReportReceivedDate),
            severityLevel: severity as SeverityLevel,
          },
          create: {
            vehicleYearId: vehicleYear.id,
            nhtsaCampaignNumber,
            reportReceivedDate: parseNhtsaDate(recall.ReportReceivedDate),
            component: recall.Component,
            summaryRaw: recall.Summary,
            consequenceRaw: recall.Consequence,
            remedyRaw: recall.Remedy,
            manufacturer: recall.Manufacturer ?? null,
            severityLevel: severity as SeverityLevel,
          },
        });
        totalSaved++;
      }

      console.log(
        `      ${year} ${makeName} ${model.name}: ${recalls.length} recalls`,
      );
    } catch (err) {
      // Log but don't stop the whole pipeline for one failed year
      console.error(
        `      ✗ Error fetching ${year} ${makeName} ${model.name}: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Small courtesy delay between years
    await sleep(300);
  }

  return totalSaved;
}

// ---------------------------------------------------------------------------
// Full pipeline orchestrator
// ---------------------------------------------------------------------------
async function runFullPipeline(flags: ReturnType<typeof parseArgs>) {
  const startTime = Date.now();

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  RECALL ENGINE — Data Ingestion Pipeline");
  console.log("════════════════════════════════════════════════════════");
  console.log(`  Year range: ${flags.yearStart}–${flags.yearEnd}`);
  console.log(`  Target make: ${flags.targetMake ?? "ALL popular"}`);
  console.log(`  Dry run: ${flags.dryRun}`);
  console.log("════════════════════════════════════════════════════════\n");

  // Step 1: Sync makes
  if (!flags.recallsOnly) {
    await ingestMakes({ allMakes: flags.allMakes });
  }

  if (flags.makesOnly) {
    console.log("\n  --makes-only flag set. Stopping after makes.\n");
    return;
  }

  // Step 2: For each make, sync models + recalls
  const makeFilter = flags.targetMake
    ? { name: { equals: flags.targetMake, mode: "insensitive" as const } }
    : {};

  const makes = await prisma.make.findMany({
    where: makeFilter,
    orderBy: { name: "asc" },
    take: flags.limit ?? undefined,
  });

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  PHASE 2b+c: Models & Recalls for ${makes.length} makes      ║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);

  let totalModels = 0;
  let totalRecalls = 0;

  for (const make of makes) {
    console.log(`\n  ── ${make.name} ${"─".repeat(40 - make.name.length)}`);

    // Ingest models
    const modelCount = await ingestModelsForMake(make);
    totalModels += modelCount;

    // Fetch models from DB (includes any previously stored ones)
    const models = await prisma.model.findMany({
      where: { makeId: make.id },
      orderBy: { name: "asc" },
    });

    // Ingest recalls for each model
    for (const model of models) {
      if (flags.dryRun) {
        console.log(`      [DRY RUN] Would fetch recalls for ${model.name}`);
        continue;
      }

      const recallCount = await ingestRecallsForModel(
        make.name,
        model,
        flags.yearStart,
        flags.yearEnd,
      );
      totalRecalls += recallCount;
    }
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const stats = getRequestStats();

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  PIPELINE COMPLETE");
  console.log("════════════════════════════════════════════════════════");
  console.log(`  Makes processed:   ${makes.length}`);
  console.log(`  Models upserted:   ${totalModels}`);
  console.log(`  Recalls upserted:  ${totalRecalls}`);
  console.log(`  API requests:      ${stats.totalRequests}`);
  console.log(`  Total time:        ${elapsed}s`);
  console.log("════════════════════════════════════════════════════════\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
  const flags = parseArgs();

  try {
    await runFullPipeline(flags);
  } catch (err) {
    console.error("\n❌ FATAL ERROR:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
