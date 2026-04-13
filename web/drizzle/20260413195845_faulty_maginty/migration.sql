ALTER TABLE "circle" ADD COLUMN "search_vector" tsvector DEFAULT ''::tsvector NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION refresh_circle_search_vector(target_circle_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	UPDATE "circle" c
	SET "search_vector" =
		setweight(to_tsvector('simple', coalesce(c."name", '')), 'A') ||
		setweight(
			to_tsvector(
				'simple',
				coalesce(
					(SELECT string_agg(r."name", ' ') FROM "release" r WHERE r."circle_id" = c."id"),
					''
				)
			),
			'B'
		) ||
		setweight(
			to_tsvector(
				'simple',
				coalesce(
					(SELECT string_agg(t."name", ' ') FROM "track" t WHERE t."circle_id" = c."id"),
					''
				)
			),
			'C'
		)
	WHERE c."id" = target_circle_id;
END;
$$;
--> statement-breakpoint
UPDATE "circle"
SET "search_vector" =
	setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
	setweight(
		to_tsvector(
			'simple',
			coalesce(
				(SELECT string_agg(r."name", ' ') FROM "release" r WHERE r."circle_id" = "circle"."id"),
				''
			)
		),
		'B'
	) ||
	setweight(
		to_tsvector(
			'simple',
			coalesce(
				(SELECT string_agg(t."name", ' ') FROM "track" t WHERE t."circle_id" = "circle"."id"),
				''
			)
		),
		'C'
	);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION circle_search_vector_refresh_on_circle_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM refresh_circle_search_vector(NEW."id");
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION circle_search_vector_refresh_on_release_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM refresh_circle_search_vector(coalesce(NEW."circle_id", OLD."circle_id"));
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION circle_search_vector_refresh_on_track_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM refresh_circle_search_vector(coalesce(NEW."circle_id", OLD."circle_id"));
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER circle_search_vector_circle_trigger
AFTER INSERT OR UPDATE OF "name" ON "circle"
FOR EACH ROW
EXECUTE FUNCTION circle_search_vector_refresh_on_circle_change();
--> statement-breakpoint
CREATE TRIGGER circle_search_vector_release_trigger
AFTER INSERT OR UPDATE OF "name", "circle_id" OR DELETE ON "release"
FOR EACH ROW
EXECUTE FUNCTION circle_search_vector_refresh_on_release_change();
--> statement-breakpoint
CREATE TRIGGER circle_search_vector_track_trigger
AFTER INSERT OR UPDATE OF "name", "circle_id" OR DELETE ON "track"
FOR EACH ROW
EXECUTE FUNCTION circle_search_vector_refresh_on_track_change();
