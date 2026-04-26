package sync

import (
	"context"
	"fmt"
	"os"
	"slices"
	"strings"
	"sync/atomic"
	"time"

	"github.com/Curstantine/dcidxr/cli/internal/files"
	"github.com/Curstantine/dcidxr/cli/internal/model"
	"github.com/Curstantine/dcidxr/cli/internal/util"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultConcurrency = 8

type syncInputPayload struct {
	Groups []model.FetchGroup `json:"groups"`
}

type existingCircle struct {
	ID   int64
	Name string
}

type existingRelease struct {
	ID       int64
	Name     string
	SizeMB   int64
	MegaLink string
}

type insertRelease struct {
	Name     string
	SizeMB   int64
	MegaLink string
	CircleID int64
}

type updateRelease struct {
	ID     int64
	Name   string
	SizeMB int64
}

type syncResult struct {
	ReleaseCount int
	ErrorCount   int
	InsertCount  int
	UpdateCount  int
	DeleteCount  int
}

func Run(ctx context.Context, inputArg string) error {
	inputPath := files.ResolvePath(inputArg, "dist/releases.json")
	inputJSON, err := files.ReadJSONFile[syncInputPayload](inputPath)
	if err != nil {
		return err
	}

	if inputJSON.Groups == nil {
		return fmt.Errorf("invalid input JSON: expected top-level 'groups' array")
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if strings.TrimSpace(databaseURL) == "" {
		return fmt.Errorf("[pgx]: DATABASE_URL is not set")
	}

	groups := make([]model.FetchGroup, 0, len(inputJSON.Groups))
	for _, group := range inputJSON.Groups {
		normalized, err := normalizeGroup(group)
		if err != nil {
			return err
		}
		groups = append(groups, normalized)
	}

	circleNames := util.DedupeByKey(extractCircleNames(groups), func(value string) string { return value })
	if len(circleNames) == 0 {
		fmt.Println("No groups found. Nothing to sync.")
		return nil
	}

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	existingCircles, err := loadExistingCircles(ctx, pool, circleNames)
	if err != nil {
		return err
	}

	circleIDsByName := map[string]int64{}
	for _, item := range existingCircles {
		if _, exists := circleIDsByName[item.Name]; exists {
			return fmt.Errorf("duplicate circle rows found in database for name: %s", item.Name)
		}
		circleIDsByName[item.Name] = item.ID
	}

	missingCircleNames := make([]string, 0)
	for _, name := range circleNames {
		if _, ok := circleIDsByName[name]; !ok {
			missingCircleNames = append(missingCircleNames, name)
		}
	}

	if len(missingCircleNames) > 0 {
		inserted, err := insertMissingCircles(ctx, pool, missingCircleNames)
		if err != nil {
			return err
		}

		for _, item := range inserted {
			circleIDsByName[item.Name] = item.ID
		}
	}

	totalCircles := len(groups)
	var startedCircles int64

	results, err := util.MapWithConcurrency(ctx, groups, defaultConcurrency, func(groupCtx context.Context, group model.FetchGroup, _ int) (syncResult, error) {
		started := atomic.AddInt64(&startedCircles, 1)
		fmt.Printf("[%d/%d] Syncing %s (%d releases)\n", started, totalCircles, group.Circle, len(group.Releases))

		circleID, ok := circleIDsByName[group.Circle]
		if !ok {
			return syncResult{}, fmt.Errorf("failed to resolve database circle id for: %s", group.Circle)
		}

		mappedStatus := normalizeStatus(group.Status)
		statusText := buildStatusText(group, mappedStatus)

		insertCount, updateCount, deleteCount, err := syncGroup(groupCtx, pool, circleID, group, mappedStatus, statusText)
		if err != nil {
			return syncResult{}, err
		}

		return syncResult{
			ReleaseCount: len(group.Releases),
			ErrorCount:   len(group.Errors),
			InsertCount:  insertCount,
			UpdateCount:  updateCount,
			DeleteCount:  deleteCount,
		}, nil
	})
	if err != nil {
		return err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := pool.Exec(
		ctx,
		`INSERT INTO server_meta (key, value) VALUES ('last_indexed'::server_meta_key, $1)
		 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
		now,
	); err != nil {
		return err
	}

	syncedCircles := len(results)
	syncedReleases := 0
	totalErrors := 0
	totalInserts := 0
	totalUpdates := 0
	totalDeletes := 0

	for _, result := range results {
		syncedReleases += result.ReleaseCount
		totalErrors += result.ErrorCount
		totalInserts += result.InsertCount
		totalUpdates += result.UpdateCount
		totalDeletes += result.DeleteCount
	}

	fmt.Printf("Synced %d circles and %d releases from %s\n", syncedCircles, syncedReleases, inputPath)
	if totalErrors > 0 {
		fmt.Printf(
			"  Operations: %d inserted, %d updated, %d deleted (%d fetch errors recorded in source JSON)\n",
			totalInserts,
			totalUpdates,
			totalDeletes,
			totalErrors,
		)
	} else {
		fmt.Printf("  Operations: %d inserted, %d updated, %d deleted\n", totalInserts, totalUpdates, totalDeletes)
	}

	return nil
}

func loadExistingCircles(ctx context.Context, pool *pgxpool.Pool, names []string) ([]existingCircle, error) {
	rows, err := pool.Query(ctx, `SELECT id, name FROM circle WHERE name = ANY($1)`, names)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]existingCircle, 0)
	for rows.Next() {
		var item existingCircle
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, err
		}
		out = append(out, item)
	}

	return out, rows.Err()
}

func insertMissingCircles(ctx context.Context, pool *pgxpool.Pool, names []string) ([]existingCircle, error) {
	out := make([]existingCircle, 0, len(names))

	for _, name := range names {
		var item existingCircle
		err := pool.QueryRow(
			ctx,
			`INSERT INTO circle (name, mega_links, status, status_text, missing_link)
			 VALUES ($1, ARRAY[]::text[], 'incomplete'::circle_status, 'Incomplete', NULL)
			 RETURNING id, name`,
			name,
		).Scan(&item.ID, &item.Name)
		if err != nil {
			return nil, err
		}

		out = append(out, item)
	}

	return out, nil
}

func syncGroup(
	ctx context.Context,
	pool *pgxpool.Pool,
	circleID int64,
	group model.FetchGroup,
	status model.CircleStatus,
	statusText string,
) (insertCount int, updateCount int, deleteCount int, err error) {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, 0, 0, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
			return
		}

		err = tx.Commit(ctx)
	}()

	_, err = tx.Exec(
		ctx,
		`UPDATE circle
		 SET name = $1,
		     mega_links = $2,
		     status = $3::circle_status,
		     status_text = $4,
		     missing_link = $5
		 WHERE id = $6`,
		group.Circle,
		group.Links,
		string(status),
		statusText,
		group.MissingLink,
		circleID,
	)
	if err != nil {
		return 0, 0, 0, err
	}

	rows, err := tx.Query(ctx, `SELECT id, name, size_mb, mega_link FROM release WHERE circle_id = $1`, circleID)
	if err != nil {
		return 0, 0, 0, err
	}

	existing := make([]existingRelease, 0)
	for rows.Next() {
		var item existingRelease
		if err := rows.Scan(&item.ID, &item.Name, &item.SizeMB, &item.MegaLink); err != nil {
			rows.Close()
			return 0, 0, 0, err
		}
		existing = append(existing, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, 0, 0, err
	}

	existingByLink := map[string]existingRelease{}
	for _, release := range existing {
		existingByLink[release.MegaLink] = release
	}

	incomingLinks := map[string]struct{}{}
	for _, release := range group.Releases {
		incomingLinks[release.Link] = struct{}{}
	}

	toDelete := make([]int64, 0)
	for _, release := range existing {
		if _, ok := incomingLinks[release.MegaLink]; !ok {
			toDelete = append(toDelete, release.ID)
		}
	}

	toInsert := make([]insertRelease, 0)
	toUpdate := make([]updateRelease, 0)

	for _, release := range group.Releases {
		existingRelease, ok := existingByLink[release.Link]
		sizeMB := bytesToMegabytes(release.SizeBytes)

		if !ok {
			toInsert = append(toInsert, insertRelease{
				Name:     release.Name,
				SizeMB:   sizeMB,
				MegaLink: release.Link,
				CircleID: circleID,
			})
			continue
		}

		if existingRelease.Name != release.Name || existingRelease.SizeMB != sizeMB {
			toUpdate = append(toUpdate, updateRelease{
				ID:     existingRelease.ID,
				Name:   release.Name,
				SizeMB: sizeMB,
			})
		}
	}

	if len(toDelete) > 0 {
		_, err = tx.Exec(ctx, `DELETE FROM release WHERE id = ANY($1)`, toDelete)
		if err != nil {
			return 0, 0, 0, err
		}
	}

	for _, insert := range toInsert {
		_, err = tx.Exec(
			ctx,
			`INSERT INTO release (name, size_mb, mega_link, circle_id) VALUES ($1, $2, $3, $4)`,
			insert.Name,
			insert.SizeMB,
			insert.MegaLink,
			insert.CircleID,
		)
		if err != nil {
			return 0, 0, 0, err
		}
	}

	for _, update := range toUpdate {
		_, err = tx.Exec(ctx, `UPDATE release SET name = $1, size_mb = $2 WHERE id = $3`, update.Name, update.SizeMB, update.ID)
		if err != nil {
			return 0, 0, 0, err
		}
	}

	return len(toInsert), len(toUpdate), len(toDelete), nil
}

func normalizeStatus(status *string) model.CircleStatus {
	if status == nil {
		return model.CircleStatusIncomplete
	}

	switch strings.ToLower(*status) {
	case "missing":
		return model.CircleStatusMissing
	case "complete", "completed":
		return model.CircleStatusComplete
	case "incomplete":
		return model.CircleStatusIncomplete
	default:
		return model.CircleStatusIncomplete
	}
}

func buildStatusText(group model.FetchGroup, mappedStatus model.CircleStatus) string {
	sourceStatus := normalizeOptionalString(group.Status)
	statusMeta := normalizeOptionalString(group.StatusMeta)

	parts := make([]string, 0, 2)
	if sourceStatus != "" {
		parts = append(parts, sourceStatus)
	}
	if statusMeta != "" {
		parts = append(parts, fmt.Sprintf("[%s]", statusMeta))
	}

	if len(parts) > 0 {
		return strings.Join(parts, " - ")
	}

	switch mappedStatus {
	case model.CircleStatusComplete:
		return "Completed"
	case model.CircleStatusMissing:
		return "Missing releases"
	default:
		return "Incomplete"
	}
}

func bytesToMegabytes(sizeBytes int64) int64 {
	if sizeBytes <= 0 {
		return 0
	}

	mb := sizeBytes / (1024 * 1024)
	if sizeBytes%(1024*1024) != 0 {
		mb += 1
	}

	if mb < 1 {
		return 1
	}

	return mb
}

func normalizeGroup(group model.FetchGroup) (model.FetchGroup, error) {
	circle := strings.TrimSpace(group.Circle)
	if circle == "" {
		return model.FetchGroup{}, fmt.Errorf("invalid group: expected non-empty 'circle' name")
	}

	normalizedLinks := make([]string, 0, len(group.Links))
	for _, link := range group.Links {
		trimmed := strings.TrimSpace(link)
		if trimmed == "" {
			continue
		}
		normalizedLinks = append(normalizedLinks, trimmed)
	}
	normalizedLinks = util.DedupeByKey(normalizedLinks, func(value string) string { return value })

	normalizedReleases := util.DedupeByKey(group.Releases, func(release model.Release) string {
		return fmt.Sprintf("%s::%s::%d", release.Name, release.Link, release.SizeBytes)
	})

	normalizedErrors := group.Errors
	if normalizedErrors == nil {
		normalizedErrors = []string{}
	}

	normalizedMissingLink := normalizeOptionalPointer(group.MissingLink)
	normalizedStatus := normalizeOptionalPointer(group.Status)
	normalizedStatusMeta := normalizeOptionalPointer(group.StatusMeta)

	return model.FetchGroup{
		GroupBase: model.GroupBase{
			Circle:      circle,
			Links:       normalizedLinks,
			MissingLink: normalizedMissingLink,
			Status:      normalizedStatus,
			StatusMeta:  normalizedStatusMeta,
		},
		Releases: normalizedReleases,
		Errors:   normalizedErrors,
	}, nil
}

func extractCircleNames(groups []model.FetchGroup) []string {
	out := make([]string, 0, len(groups))
	for _, group := range groups {
		out = append(out, group.Circle)
	}
	return out
}

func normalizeOptionalPointer(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func normalizeOptionalString(value *string) string {
	if value == nil {
		return ""
	}

	return strings.TrimSpace(*value)
}

func removeStringSliceDuplicates(values []string) []string {
	if len(values) < 2 {
		return values
	}

	cloned := slices.Clone(values)
	return util.DedupeByKey(cloned, func(value string) string { return value })
}
