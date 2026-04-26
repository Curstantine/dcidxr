package fetch

import (
	"context"
	"fmt"
	"math/rand"
	"path/filepath"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"github.com/Curstantine/dcidxr/cli/internal/files"
	"github.com/Curstantine/dcidxr/cli/internal/megapublic"
	"github.com/Curstantine/dcidxr/cli/internal/model"
	"github.com/Curstantine/dcidxr/cli/internal/util"
)

const (
	defaultConcurrency       = 4
	megaLoadMaxAttempts      = 3
	megaLoadRetryBaseDelayMS = 750
	megaLoadRetryMaxDelayMS  = 5000
)

var (
	audioFileExtensions = map[string]struct{}{
		".aac": {}, ".aif": {}, ".aiff": {}, ".alac": {}, ".ape": {}, ".dsf": {},
		".flac": {}, ".m4a": {}, ".mp3": {}, ".ogg": {}, ".opus": {}, ".wav": {}, ".wma": {},
	}
	retryableMegaErrorCodes = map[string]struct{}{
		"ECONNABORTED": {},
		"ECONNRESET":   {},
		"ENETDOWN":     {},
		"ENETRESET":    {},
		"ENETUNREACH":  {},
		"EAI_AGAIN":    {},
		"ETIMEDOUT":    {},
	}
	retryableMegaErrorMessageTokens = []string{
		"fetch failed",
		"network",
		"socket",
		"timeout",
		"timed out",
		"temporary failure",
		"connection reset",
	}
)

type fetchInputPayload struct {
	Groups []model.GroupBase `json:"groups"`
}

type linkTask struct {
	groupIndex int
	circle     string
	link       string
}

type taskResult struct {
	groupIndex int
	releases   []model.Release
	errorText  string
}

type groupAccumulator struct {
	releaseSets [][]model.Release
	errors      []string
}

func Run(ctx context.Context, inputArg, outputArg string) error {
	inputPath := files.ResolvePath(inputArg, "dist/transformed.json")
	outputPath := files.ResolvePath(outputArg, "dist/releases.json")

	inputJSON, err := files.ReadJSONFile[fetchInputPayload](inputPath)
	if err != nil {
		return err
	}

	if inputJSON.Groups == nil {
		return fmt.Errorf("invalid input JSON: expected top-level 'groups' array")
	}

	groups := inputJSON.Groups
	linkTasks := make([]linkTask, 0)
	totalLinks := 0
	for groupIndex, group := range groups {
		totalLinks += len(group.Links)
		for _, link := range group.Links {
			linkTasks = append(linkTasks, linkTask{groupIndex: groupIndex, circle: group.Circle, link: link})
		}
	}

	var processedCount int64
	taskResults, err := util.MapWithConcurrency(ctx, linkTasks, defaultConcurrency, func(ctx context.Context, task linkTask, _ int) (taskResult, error) {
		current := atomic.AddInt64(&processedCount, 1)
		fmt.Printf("[%d/%d] Fetching %s: %s\n", current, totalLinks, task.circle, task.link)

		releases, fetchErr := fetchReleasesFromLink(ctx, task.link)
		if fetchErr != nil {
			return taskResult{
				groupIndex: task.groupIndex,
				releases:   []model.Release{},
				errorText:  fmt.Sprintf("%s: %s", task.link, fetchErr.Error()),
			}, nil
		}

		return taskResult{groupIndex: task.groupIndex, releases: releases}, nil
	})
	if err != nil {
		return err
	}

	groupAccumulators := make([]groupAccumulator, len(groups))
	for index := range groupAccumulators {
		groupAccumulators[index] = groupAccumulator{releaseSets: [][]model.Release{}, errors: []string{}}
	}

	for _, result := range taskResults {
		accumulator := &groupAccumulators[result.groupIndex]
		accumulator.releaseSets = append(accumulator.releaseSets, result.releases)
		if result.errorText != "" {
			accumulator.errors = append(accumulator.errors, result.errorText)
		}
	}

	outputGroups := make([]model.FetchGroup, 0, len(groups))
	for groupIndex, group := range groups {
		accumulator := groupAccumulators[groupIndex]
		flattened := make([]model.Release, 0)
		for _, set := range accumulator.releaseSets {
			flattened = append(flattened, set...)
		}

		releases := dedupeReleases(flattened)
		sort.Slice(releases, func(i, j int) bool {
			return strings.Compare(releases[i].Name, releases[j].Name) < 0
		})

		outputGroups = append(outputGroups, model.FetchGroup{
			GroupBase: group,
			Releases:  releases,
			Errors:    accumulator.errors,
		})
	}

	output := model.FetchOutputPayload{Groups: outputGroups}
	if err := files.WriteJSONFile(outputPath, output); err != nil {
		return err
	}

	totalReleases := 0
	for _, group := range outputGroups {
		totalReleases += len(group.Releases)
	}

	fmt.Printf(
		"Wrote %d groups, %d MEGA links, and %d releases to %s\n",
		len(outputGroups),
		totalLinks,
		totalReleases,
		outputPath,
	)

	return nil
}

func fetchReleasesFromLink(ctx context.Context, link string) ([]model.Release, error) {
	root, err := loadMegaFolder(ctx, link)
	if err != nil {
		return nil, err
	}

	name := util.NormalizeNodeName(root.Name, "Root")
	if !root.Directory {
		release := buildRelease(root, link)
		if release.Name == "" {
			release.Name = name
		}
		return []model.Release{release}, nil
	}

	if len(root.Children) == 0 {
		return []model.Release{{Name: name, Link: link, Directory: true, SizeBytes: 0, Files: []model.ReleaseFile{}}}, nil
	}

	releases := make([]model.Release, 0, len(root.Children))
	for _, child := range root.Children {
		releases = append(releases, buildRelease(child, link))
	}

	return releases, nil
}

func loadMegaFolder(ctx context.Context, link string) (*megapublic.Node, error) {
	var lastErr error

	for attempt := 1; attempt <= megaLoadMaxAttempts; attempt++ {
		node, err := megapublic.Load(ctx, link)
		if err == nil {
			return node, nil
		}

		lastErr = err
		retryable := isRetryableMegaLoadError(err)
		hasRemainingAttempts := attempt < megaLoadMaxAttempts
		if !retryable || !hasRemainingAttempts {
			return nil, fmt.Errorf(
				"failed to load MEGA folder after %d attempt%s (%s): %s",
				attempt,
				pluralize(attempt),
				link,
				err.Error(),
			)
		}

		nextAttempt := attempt + 1
		delay := retryDelayMS(attempt)
		fmt.Printf(
			"[retry %d/%d] Retrying MEGA load in %dms: %s (%s)\n",
			nextAttempt,
			megaLoadMaxAttempts,
			delay,
			link,
			err.Error(),
		)

		timer := time.NewTimer(time.Duration(delay) * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}

	return nil, fmt.Errorf(
		"failed to load MEGA folder after %d attempts (%s): %s",
		megaLoadMaxAttempts,
		link,
		lastErr.Error(),
	)
}

func buildRelease(node *megapublic.Node, rootLink string) model.Release {
	name := util.NormalizeNodeName(node.Name, "Unknown")

	var filesOut []model.ReleaseFile
	if node.Directory {
		filesOut = collectLeafFiles(node)
	} else {
		filesOut = []model.ReleaseFile{{Name: name, SizeBytes: node.Size}}
	}

	size := int64(0)
	for _, file := range filesOut {
		size += file.SizeBytes
	}

	return model.Release{
		Name:      name,
		Link:      fmt.Sprintf("%s/folder/%s", rootLink, node.DownloadID),
		Directory: node.Directory,
		SizeBytes: size,
		Files:     filesOut,
	}
}

func collectLeafFiles(node *megapublic.Node) []model.ReleaseFile {
	name := util.NormalizeNodeName(node.Name, "Unknown")
	if !node.Directory && isAudioFileName(name) {
		return []model.ReleaseFile{{Name: name, SizeBytes: node.Size}}
	}

	if len(node.Children) == 0 {
		return []model.ReleaseFile{}
	}

	files := make([]model.ReleaseFile, 0)
	for _, child := range node.Children {
		files = append(files, collectLeafFiles(child)...)
	}

	return files
}

func dedupeReleases(values []model.Release) []model.Release {
	return util.DedupeByKey(values, func(value model.Release) string {
		return fmt.Sprintf("%s::%s::%d", value.Name, value.Link, value.SizeBytes)
	})
}

func isAudioFileName(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	_, ok := audioFileExtensions[ext]
	return ok
}

func isRetryableMegaLoadError(err error) bool {
	message := strings.ToLower(err.Error())
	for code := range retryableMegaErrorCodes {
		if strings.Contains(message, strings.ToLower(code)) {
			return true
		}
	}

	for _, token := range retryableMegaErrorMessageTokens {
		if strings.Contains(message, token) {
			return true
		}
	}

	return false
}

func retryDelayMS(attempt int) int {
	delay := megaLoadRetryBaseDelayMS * (1 << max(0, attempt-1))
	if delay > megaLoadRetryMaxDelayMS {
		delay = megaLoadRetryMaxDelayMS
	}

	jitter := rand.Intn(250)
	delay += jitter
	if delay > megaLoadRetryMaxDelayMS {
		delay = megaLoadRetryMaxDelayMS
	}

	return delay
}

func pluralize(value int) string {
	if value == 1 {
		return ""
	}

	return "s"
}

func max(a, b int) int {
	if a > b {
		return a
	}

	return b
}
