-- The 0046 migration is maintained manually because the repository's historical
-- snapshots predate the current production schema. This no-op migration pairs
-- with the 0047 snapshot so future `drizzle-kit generate` runs have a complete
-- baseline without replaying older tables.
SELECT 1;
