package cmd

import (
	"github.com/Curstantine/dcidxr/cli/internal/pipeline/start"
	"github.com/spf13/cobra"
)

func newStartCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "start",
		Short:   "Download raw messages, then transform, fetch, and sync",
		Long:    "Run the full crawler pipeline: download the raw messages JSON from MESSAGES_DL_URL, write dist/input.json, transform it into grouped MEGA links, fetch release metadata, and sync the result into Postgres.",
		Example: "  cli start",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return start.Run(cmd.Context())
		},
	}

	return cmd
}
