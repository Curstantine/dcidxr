package start

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	fetchpipeline "github.com/Curstantine/dcidxr/cli/internal/pipeline/fetch"
	syncpipeline "github.com/Curstantine/dcidxr/cli/internal/pipeline/sync"
	transformpipeline "github.com/Curstantine/dcidxr/cli/internal/pipeline/transform"
)

const (
	defaultDistDir        = "dist"
	defaultInputFilename  = "input.json"
	defaultInputFilePerm  = 0o644
	defaultDistFolderPerm = 0o755
)

func Run(ctx context.Context) error {
	inputPath := filepath.Clean(filepath.Join(defaultDistDir, defaultInputFilename))

	if err := download(ctx, inputPath); err != nil {
		return err
	}

	if err := transformpipeline.Run(ctx, "", ""); err != nil {
		return err
	}

	if err := fetchpipeline.Run(ctx, "", ""); err != nil {
		return err
	}

	if err := syncpipeline.Run(ctx, ""); err != nil {
		return err
	}

	if err := os.Remove(inputPath); err != nil && !os.IsNotExist(err) {
		return err
	}

	return nil
}

func download(ctx context.Context, inputPath string) error {
	source := strings.TrimSpace(os.Getenv("MESSAGES_DL_URL"))
	if source == "" {
		return fmt.Errorf("MESSAGES_DL_URL is not set")
	}

	distDir := filepath.Dir(inputPath)
	if err := os.MkdirAll(distDir, defaultDistFolderPerm); err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return err
	}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("failed to download messages: %s", res.Status)
	}

	rawJSON, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}

	if err := os.WriteFile(inputPath, rawJSON, defaultInputFilePerm); err != nil {
		return err
	}

	fmt.Printf("Downloaded messages to %s\n", inputPath)
	return nil
}
