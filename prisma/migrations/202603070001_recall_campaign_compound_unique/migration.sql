-- Drop global uniqueness so the same campaign can exist for multiple vehicle years.
DROP INDEX IF EXISTS "recalls_nhtsa_campaign_number_key";

-- De-duplicate any accidental duplicates inside the same vehicle-year+campaign scope,
-- keeping the most recently updated row for data safety.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY vehicle_year_id, nhtsa_campaign_number
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_num
  FROM recalls
)
DELETE FROM recalls r
USING ranked d
WHERE r.id = d.id
  AND d.row_num > 1;

-- Enforce uniqueness in vehicle context.
CREATE UNIQUE INDEX IF NOT EXISTS "recalls_vehicle_year_id_nhtsa_campaign_number_key"
  ON "recalls"("vehicle_year_id", "nhtsa_campaign_number");

-- Keep campaign-level lookup performance across all vehicles.
CREATE INDEX IF NOT EXISTS "recalls_nhtsa_campaign_number_idx"
  ON "recalls"("nhtsa_campaign_number");
