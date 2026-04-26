package crypto

import (
	"errors"
	"fmt"
)

var errWrongMergedKeyLength = errors.New("wrong key length, must be 16, 24 or 32 bytes")

func UnmergeKeyMAC(key []byte) []byte {
	newKey := make([]byte, 32)
	copy(newKey, key)

	for i := 0; i < 16; i++ {
		newKey[i] = newKey[i] ^ newKey[16+i]
	}

	return newKey
}

func MergeKeyMAC(key, mac []byte) []byte {
	newKey := make([]byte, 32)
	copy(newKey, key)
	copy(newKey[24:], mac)

	for i := 0; i < 16; i++ {
		newKey[i] = newKey[i] ^ newKey[16+i]
	}

	return newKey
}

func GetCipherKey(key []byte) ([]byte, error) {
	if len(key) == 16 {
		return append([]byte(nil), key...), nil
	}

	if len(key) != 24 && len(key) != 32 {
		return nil, fmt.Errorf("%w: got %d", errWrongMergedKeyLength, len(key))
	}

	unmerged := UnmergeKeyMAC(key)
	return unmerged[:16], nil
}
