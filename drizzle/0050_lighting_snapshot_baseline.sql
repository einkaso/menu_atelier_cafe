-- The 0049 migration is maintained manually because the repository's historical
-- snapshots predate the current production schema. This no-op migration pairs
-- with the 0050 snapshot so future `drizzle-kit generate` runs have a complete
-- baseline without replaying older tables.
SELECT 1;
