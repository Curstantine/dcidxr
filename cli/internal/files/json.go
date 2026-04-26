package files

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

func ResolvePath(arg, defaultRelativePath string) string {
	if arg != "" {
		return resolve(arg)
	}

	return resolve(defaultRelativePath)
}

func ReadJSONFile[T any](filePath string) (T, error) {
	var out T

	raw, err := os.ReadFile(filePath)
	if err != nil {
		return out, err
	}

	if err := json.Unmarshal(raw, &out); err != nil {
		return out, fmt.Errorf("invalid JSON in %s: %w", filePath, err)
	}

	return out, nil
}

func WriteJSONFile(filePath string, value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}

	raw = append(raw, '\n')
	return os.WriteFile(filePath, raw, 0o644)
}

func resolve(path string) string {
	return filepath.Clean(filepath.Join(mustGetwd(), path))
}

func mustGetwd() string {
	wd, err := os.Getwd()
	if err != nil {
		panic(err)
	}

	return wd
}
