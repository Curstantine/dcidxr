package util

import "strings"

func NormalizeString(value *string) *string {
	if value == nil {
		return nil
	}

	normalized := strings.TrimSpace(*value)
	if normalized == "" {
		return nil
	}

	return &normalized
}

func NormalizeNodeName(name string, fallback string) string {
	normalized := strings.TrimSpace(name)
	if normalized == "" {
		return fallback
	}

	return normalized
}
