-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION refresh_circle_search_vector(target_circle_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_circle_name text;
	v_release_names text;
	v_track_names text;
BEGIN
	SELECT coalesce(c."name", '')
	INTO v_circle_name
	FROM "circle" c
	WHERE c."id" = target_circle_id;

	SELECT coalesce(string_agg(r."name", ' '), '')
	INTO v_release_names
	FROM "release" r
	WHERE r."circle_id" = target_circle_id;

	SELECT coalesce(string_agg(t."name", ' '), '')
	INTO v_track_names
	FROM "track" t
	WHERE t."circle_id" = target_circle_id;

	UPDATE "circle" c
	SET "search_vector" =
		setweight(
			to_tsvector('simple', v_circle_name) || to_tsvector('simple', regexp_replace(v_circle_name, '\.', ' ', 'g')),
			'A'
		) ||
		setweight(
			to_tsvector('simple', v_release_names) || to_tsvector('simple', regexp_replace(v_release_names, '\.', ' ', 'g')),
			'B'
		) ||
		setweight(
			to_tsvector('simple', v_track_names) || to_tsvector('simple', regexp_replace(v_track_names, '\.', ' ', 'g')),
			'C'
		)
	WHERE c."id" = target_circle_id;
END;
$$;
--> statement-breakpoint
UPDATE "circle"
SET "search_vector" = agg.vec
FROM (
	SELECT
		c."id",
		setweight(
			to_tsvector('simple', coalesce(c."name", '')) || to_tsvector('simple', regexp_replace(coalesce(c."name", ''), '\.', ' ', 'g')),
			'A'
		) ||
		setweight(
			to_tsvector('simple', coalesce(string_agg(r."name", ' '), '')) || to_tsvector('simple', regexp_replace(coalesce(string_agg(r."name", ' '), ''), '\.', ' ', 'g')),
			'B'
		) ||
		setweight(
			to_tsvector('simple', coalesce(string_agg(t."name", ' '), '')) || to_tsvector('simple', regexp_replace(coalesce(string_agg(t."name", ' '), ''), '\.', ' ', 'g')),
			'C'
		) AS vec
	FROM "circle" c
	LEFT JOIN "release" r ON r."circle_id" = c."id"
	LEFT JOIN "track" t ON t."circle_id" = c."id"
	GROUP BY c."id", c."name"
) agg
WHERE "circle"."id" = agg."id";
