package util

func DedupeByKey[T any](values []T, keyFn func(T) string) []T {
	seen := map[string]struct{}{}
	out := make([]T, 0, len(values))

	for _, value := range values {
		key := keyFn(value)
		if _, ok := seen[key]; ok {
			continue
		}

		seen[key] = struct{}{}
		out = append(out, value)
	}

	return out
}
