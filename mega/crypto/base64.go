package crypto

import (
	"encoding/base64"
	"fmt"
	"strings"
)

func EncodeBase64URL(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

func DecodeBase64URL(value string) ([]byte, error) {
	if value == "" {
		return nil, nil
	}

	if decoded, err := base64.RawURLEncoding.DecodeString(value); err == nil {
		return decoded, nil
	}

	standard := strings.ReplaceAll(strings.ReplaceAll(value, "-", "+"), "_", "/")
	if missing := len(standard) % 4; missing != 0 {
		standard += strings.Repeat("=", 4-missing)
	}

	decoded, err := base64.StdEncoding.DecodeString(standard)
	if err != nil {
		return nil, fmt.Errorf("decode base64: %w", err)
	}

	return decoded, nil
}
