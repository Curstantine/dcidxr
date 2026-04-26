package cmd

import (
	syncpipeline "github.com/Curstantine/dcidxr/cli/internal/pipeline/sync"
	"github.com/spf13/cobra"
)

func newSyncCommand() *cobra.Command {
	paths := &pathArgs{}

	command := &cobra.Command{
		Use:     "sync [inputPath]",
		Short:   "Sync fetched release metadata into Postgres",
		Example: "  cli sync\n  cli sync dist/releases.json\n  cli sync --input dist/releases.json",
		Args:    cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			input, err := resolveInputArg(args, *paths)
			if err != nil {
				return err
			}

			return syncpipeline.Run(cmd.Context(), input)
		},
	}

	bindInputFlag(command, paths, "Path to releases JSON input file")
	return command
}
