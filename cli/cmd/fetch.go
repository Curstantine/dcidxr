package cmd

import (
	fetchpipeline "github.com/Curstantine/dcidxr/cli/internal/pipeline/fetch"
	"github.com/spf13/cobra"
)

func newFetchCommand() *cobra.Command {
	paths := &pathArgs{}

	command := &cobra.Command{
		Use:     "fetch [inputPath] [outputPath]",
		Short:   "Fetch release metadata from MEGA links",
		Example: "  cli fetch\n  cli fetch dist/transformed.json dist/releases.json\n  cli fetch --input custom/transformed.json --output custom/releases.json",
		Args:    cobra.MaximumNArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			input, output, err := resolveInputOutputArgs(args, *paths)
			if err != nil {
				return err
			}

			return fetchpipeline.Run(cmd.Context(), input, output)
		},
	}

	bindInputOutputFlags(command, paths, "Path to transformed input JSON", "Path to release output JSON")

	return command
}
