package cmd

import (
	"github.com/Curstantine/dcidxr/cli/internal/env"
	"github.com/spf13/cobra"
)

func Execute() error {
	root := &cobra.Command{
		Use:          "cli",
		Short:        "Doujin Cafe crawler CLI",
		SilenceUsage: true,
		PersistentPreRunE: func(_ *cobra.Command, _ []string) error {
			return env.Load()
		},
	}

	root.AddCommand(newStartCommand())
	root.AddCommand(newTransformCommand())
	root.AddCommand(newFetchCommand())
	root.AddCommand(newSyncCommand())

	return root.Execute()
}
