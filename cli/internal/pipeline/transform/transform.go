package transform

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/Curstantine/dcidxr/cli/internal/files"
	"github.com/Curstantine/dcidxr/cli/internal/model"
)

var (
	megaLinkPattern     = regexp.MustCompile(`https?://(?:www\.)?mega\.(?:nz|co\.nz)/[^\s)>]+`)
	urlPattern          = regexp.MustCompile(`https?://[^\s)>]+`)
	circlePattern       = regexp.MustCompile(`^\s*\*\*(.+?)\*\*(?:\s+.*)?$`)
	statusLinePattern   = regexp.MustCompile(`^\s*Stat(?:us|s)(?:\s*\([^)]*\))?\s*:\s*(.+)$`)
	missingLinePattern  = regexp.MustCompile(`^\s*Missing(?:\s*\([^)]*\))?\s*:`)
	statusUpdatePattern = regexp.MustCompile(`-\s*(?:Last\s+)?Updat\w*\s*:?\s*(.+)$`)
	trailingDatePattern = regexp.MustCompile(`-\s*(\d{1,2}/\d{1,2}/\d{2,4})\s*$`)
)

type transformInputPayload struct {
	Messages []model.Message `json:"messages"`
}

type mutableGroup struct {
	Links       []string
	seenLinks   map[string]struct{}
	MissingLink *string
	Status      *string
	StatusMeta  *string
}

func Run(_ context.Context, inputArg, outputArg string) error {
	inputPath := files.ResolvePath(inputArg, "dist/input.json")
	outputPath := files.ResolvePath(outputArg, "dist/transformed.json")

	inputJSON, err := files.ReadJSONFile[transformInputPayload](inputPath)
	if err != nil {
		return err
	}

	if inputJSON.Messages == nil {
		return fmt.Errorf("invalid input JSON: expected top-level 'messages' array")
	}

	groups := collectGroups(inputJSON.Messages)
	output := model.TransformOutputPayload{Groups: groups}

	if err := files.WriteJSONFile(outputPath, output); err != nil {
		return err
	}

	totalLinks := 0
	for _, group := range groups {
		totalLinks += len(group.Links)
	}

	fmt.Printf("Wrote %d circles and %d MEGA links to %s\n", len(groups), totalLinks, outputPath)
	return nil
}

func collectGroups(messages []model.Message) []model.GroupBase {
	groups := map[string]*mutableGroup{}
	order := make([]string, 0)

	for _, message := range messages {
		content, ok := message.Content.(string)
		if !ok || content == "" {
			continue
		}

		var currentCircle string
		for _, line := range strings.Split(content, "\n") {
			circleMatch := circlePattern.FindStringSubmatch(line)
			if len(circleMatch) > 1 {
				normalized := normalizeCircleName(circleMatch[1])
				if normalized != "" && normalized != " " {
					currentCircle = normalized
					if _, ok := groups[currentCircle]; !ok {
						groups[currentCircle] = &mutableGroup{
							Links:     []string{},
							seenLinks: map[string]struct{}{},
						}
						order = append(order, currentCircle)
					}
				}
			}

			if currentCircle == "" {
				continue
			}

			group := groups[currentCircle]
			status, statusMeta, _ := parseStatusLine(line)
			if status != nil {
				group.Status = status
			}
			if statusMeta != nil {
				group.StatusMeta = statusMeta
			}

			for _, match := range megaLinkPattern.FindAllString(line, -1) {
				if _, exists := group.seenLinks[match]; exists {
					continue
				}
				group.seenLinks[match] = struct{}{}
				group.Links = append(group.Links, match)
			}

			if missingLinePattern.MatchString(line) && group.MissingLink == nil {
				urls := urlPattern.FindAllString(line, -1)
				if len(urls) > 0 {
					link := urls[0]
					group.MissingLink = &link
				}
			}
		}
	}

	out := make([]model.GroupBase, 0, len(order))
	for _, circle := range order {
		group := groups[circle]
		links := append([]string(nil), group.Links...)

		if len(links) == 0 {
			continue
		}

		out = append(out, model.GroupBase{
			Circle:      circle,
			Links:       links,
			MissingLink: group.MissingLink,
			Status:      group.Status,
			StatusMeta:  group.StatusMeta,
		})
	}

	return out
}

func normalizeCircleName(raw string) string {
	return strings.TrimSpace(raw)
}

func normalizeStatus(raw string) *string {
	normalized := strings.TrimSpace(raw)
	normalized = strings.TrimLeft(normalized, " :-")
	normalized = strings.Join(strings.Fields(normalized), " ")
	if normalized == "" {
		return nil
	}

	compact := strings.ToLower(regexp.MustCompile(`[^a-z]`).ReplaceAllString(normalized, ""))

	value := normalized
	switch {
	case strings.HasPrefix(compact, "incomplete"), strings.HasPrefix(compact, "incompleted"):
		value = "incomplete"
	case strings.HasPrefix(compact, "missing"):
		value = "missing"
	case strings.HasPrefix(compact, "completed"), strings.HasPrefix(compact, "complete"), strings.HasSuffix(compact, "completed"), strings.HasPrefix(compact, "compelted"):
		value = "completed"
	}

	return &value
}

func parseStatusLine(line string) (status *string, statusMeta *string, lastUpdated *string) {
	match := statusLinePattern.FindStringSubmatch(line)
	if len(match) < 2 {
		return nil, nil, nil
	}

	value := strings.TrimSpace(match[1])
	updatedMatch := statusUpdatePattern.FindStringSubmatchIndex(value)
	if updatedMatch == nil {
		updatedMatch = trailingDatePattern.FindStringSubmatchIndex(value)
	}

	withoutUpdate := value
	if updatedMatch != nil {
		if len(updatedMatch) >= 4 {
			lu := strings.TrimSpace(value[updatedMatch[2]:updatedMatch[3]])
			if lu != "" {
				lastUpdated = &lu
			}
		}

		start := updatedMatch[0]
		if start >= 0 && start <= len(value) {
			withoutUpdate = strings.TrimSpace(value[:start])
		}
	}

	metaPattern := regexp.MustCompile(`\[([^\]]+)\]`)
	metaMatch := metaPattern.FindStringSubmatch(withoutUpdate)
	if len(metaMatch) > 1 {
		meta := strings.TrimSpace(metaMatch[1])
		if meta != "" {
			statusMeta = &meta
		}
	}

	withoutMeta := metaPattern.ReplaceAllString(withoutUpdate, " ")
	status = normalizeStatus(strings.ReplaceAll(withoutMeta, "_", " "))

	return status, statusMeta, lastUpdated
}
