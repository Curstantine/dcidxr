-- Custom SQL migration file, put your code below! --

CREATE OR REPLACE FUNCTION circle_search_vector_refresh_on_release_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		PERFORM refresh_circle_search_vector(OLD."circle_id");
		RETURN OLD;
	END IF;

	PERFORM refresh_circle_search_vector(NEW."circle_id");
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION circle_search_vector_refresh_on_track_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		PERFORM refresh_circle_search_vector(OLD."circle_id");
		RETURN OLD;
	END IF;

	PERFORM refresh_circle_search_vector(NEW."circle_id");
	RETURN NEW;
END;
$$;
