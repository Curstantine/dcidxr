-- Custom SQL migration file, put your code below! --
-- FTS5 full-text search for circles (indexes circle name + associated release/track names).
-- The index is rebuilt in bulk by the crawler's sync process (crawler/src/sync.ts) after each run.
-- No triggers are needed because sync.ts is the sole writer for circle/release/track data.

-- Create the FTS5 virtual table.
--   circle_id:   unindexed join key back to the circle table.
--   circle_name: the circle's name (searchable).
--   content:     concatenated release names and track names for that circle (searchable).
CREATE VIRTUAL TABLE circle_fts USING fts5(
    circle_id UNINDEXED,
    circle_name,
    content,
    tokenize = 'unicode61'
);

-- Initial population: index all existing circles with their release/track names.
INSERT INTO circle_fts(circle_id, circle_name, content)
SELECT
    c.id,
    c.name,
    COALESCE(
        (SELECT GROUP_CONCAT(r.name, ' ') FROM release r WHERE r.circle_id = c.id),
        ''
    ) || ' ' || COALESCE(
        (SELECT GROUP_CONCAT(t.name, ' ') FROM track t WHERE t.circle_id = c.id),
        ''
    )
FROM circle c;
