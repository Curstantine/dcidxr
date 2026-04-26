package util

import (
	"context"

	"golang.org/x/sync/errgroup"
)

func MapWithConcurrency[T any, O any](
	ctx context.Context,
	values []T,
	concurrency int,
	mapper func(context.Context, T, int) (O, error),
) ([]O, error) {
	results := make([]O, len(values))
	if len(values) == 0 {
		return results, nil
	}

	if concurrency < 1 {
		concurrency = 1
	}
	if concurrency > len(values) {
		concurrency = len(values)
	}

	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(concurrency)

	for index, value := range values {
		group.Go(func() error {
			result, err := mapper(groupCtx, value, index)
			if err != nil {
				return err
			}

			results[index] = result
			return nil
		})
	}

	if err := group.Wait(); err != nil {
		return nil, err
	}

	return results, nil
}
