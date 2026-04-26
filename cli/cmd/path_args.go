package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

type pathArgs struct {
	inputFlag  string
	outputFlag string
}

func bindInputOutputFlags(command *cobra.Command, paths *pathArgs, defaultInputUsage, defaultOutputUsage string) {
	command.Flags().StringVar(&paths.inputFlag, "input", "", defaultInputUsage)
	command.Flags().StringVar(&paths.outputFlag, "output", "", defaultOutputUsage)
}

func bindInputFlag(command *cobra.Command, paths *pathArgs, defaultInputUsage string) {
	command.Flags().StringVar(&paths.inputFlag, "input", "", defaultInputUsage)
}

func resolveInputOutputArgs(args []string, paths pathArgs) (input string, output string, err error) {
	if len(args) > 2 {
		return "", "", fmt.Errorf("expected at most 2 positional arguments, got %d", len(args))
	}

	input = firstNonEmpty(paths.inputFlag)
	output = firstNonEmpty(paths.outputFlag)

	if input == "" && len(args) >= 1 {
		input = strings.TrimSpace(args[0])
	}

	if output == "" && len(args) >= 2 {
		output = strings.TrimSpace(args[1])
	}

	if paths.inputFlag != "" && len(args) >= 1 && strings.TrimSpace(args[0]) != "" {
		return "", "", fmt.Errorf("input path provided by both --input and positional argument")
	}

	if paths.outputFlag != "" && len(args) >= 2 && strings.TrimSpace(args[1]) != "" {
		return "", "", fmt.Errorf("output path provided by both --output and positional argument")
	}

	return input, output, nil
}

func resolveInputArg(args []string, paths pathArgs) (string, error) {
	if len(args) > 1 {
		return "", fmt.Errorf("expected at most 1 positional argument, got %d", len(args))
	}

	if paths.inputFlag != "" && len(args) >= 1 && strings.TrimSpace(args[0]) != "" {
		return "", fmt.Errorf("input path provided by both --input and positional argument")
	}

	if paths.inputFlag != "" {
		return strings.TrimSpace(paths.inputFlag), nil
	}

	if len(args) == 0 {
		return "", nil
	}

	return strings.TrimSpace(args[0]), nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}

	return ""
}
