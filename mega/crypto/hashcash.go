package crypto

import (
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

func GenerateHashcashToken(challenge string) (string, error) {
	parts := strings.Split(challenge, ":")
	if len(parts) < 4 {
		return "", errors.New("invalid hashcash challenge")
	}

	version, err := strconv.Atoi(parts[0])
	if err != nil {
		return "", fmt.Errorf("invalid hashcash version: %w", err)
	}

	if version != 1 {
		return "", errors.New("hashcash challenge is not version 1")
	}

	easiness, err := strconv.Atoi(parts[1])
	if err != nil {
		return "", fmt.Errorf("invalid hashcash easiness: %w", err)
	}

	tokenStr := parts[3]
	token, err := DecodeBase64URL(tokenStr)
	if err != nil {
		return "", fmt.Errorf("decode hashcash token: %w", err)
	}

	base := ((easiness & 63) << 1) + 1
	shifts := (easiness>>6)*7 + 3
	threshold := uint64(base) << shifts

	buffer := make([]byte, 4+262144*48)
	for i := 0; i < 262144; i++ {
		copy(buffer[4+i*48:4+i*48+len(token)], token)
	}

	for {
		sum := sha256.Sum256(buffer)
		if uint64(binary.BigEndian.Uint32(sum[:4])) <= threshold {
			return fmt.Sprintf("1:%s:%s", tokenStr, EncodeBase64URL(buffer[:4])), nil
		}

		for i := 0; ; i++ {
			buffer[i]++
			if buffer[i] != 0 {
				break
			}
		}
	}
}
