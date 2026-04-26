package cmd

import (
	transformpipeline "github.com/Curstantine/dcidxr/cli/internal/pipeline/transform"
	"github.com/spf13/cobra"
)

func newTransformCommand() *cobra.Command {
	paths := &pathArgs{}

	command := &cobra.Command{
		Use:     "transform [inputPath] [outputPath]",
		Short:   "Transform raw messages into grouped MEGA links",
		Long:    "Transform raw message JSON into normalized circle groups with MEGA links, statuses, and missing-link metadata.",
		Example: "  cli transform\n  cli transform --input dist/input.json --output dist/transformed.json\n  cli transform custom/input.json custom/output.json",
		Args:    cobra.MaximumNArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			input, output, err := resolveInputOutputArgs(args, *paths)
			if err != nil {
				return err
			}

			return transformpipeline.Run(cmd.Context(), input, output)
		},
	}

	bindInputOutputFlags(
		command,
		paths,
		"Path to the raw input JSON file",
		"Path to write the transformed JSON file",
	)

	return command
}
