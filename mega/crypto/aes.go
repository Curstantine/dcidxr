package crypto

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/pbkdf2"
	"crypto/sha512"
	"encoding/binary"
	"errors"
	"fmt"
	"hash"
)

var (
	errWrongAESKeyLength = errors.New("wrong key length, must be 128-bit")
	errBlockAligned      = errors.New("buffer must be a multiple of 16 bytes")
)

type AES struct {
	key []byte
}

func NewAES(key []byte) (*AES, error) {
	if len(key) != 16 {
		return nil, errWrongAESKeyLength
	}

	k := make([]byte, len(key))
	copy(k, key)

	return &AES{key: k}, nil
}

func (a *AES) Key() []byte {
	out := make([]byte, len(a.key))
	copy(out, a.key)
	return out
}

func (a *AES) EncryptCBCInPlace(data []byte) error {
	if len(data)%aes.BlockSize != 0 {
		return errBlockAligned
	}

	block, err := aes.NewCipher(a.key)
	if err != nil {
		return fmt.Errorf("create aes cipher: %w", err)
	}

	iv := make([]byte, aes.BlockSize)
	mode := cipher.NewCBCEncrypter(block, iv)
	mode.CryptBlocks(data, data)
	return nil
}

func (a *AES) DecryptCBCInPlace(data []byte) error {
	if len(data)%aes.BlockSize != 0 {
		return errBlockAligned
	}

	block, err := aes.NewCipher(a.key)
	if err != nil {
		return fmt.Errorf("create aes cipher: %w", err)
	}

	iv := make([]byte, aes.BlockSize)
	mode := cipher.NewCBCDecrypter(block, iv)
	mode.CryptBlocks(data, data)
	return nil
}

func (a *AES) EncryptECBInPlace(data []byte) error {
	if len(data)%aes.BlockSize != 0 {
		return errBlockAligned
	}

	block, err := aes.NewCipher(a.key)
	if err != nil {
		return fmt.Errorf("create aes cipher: %w", err)
	}

	buf := make([]byte, aes.BlockSize)
	for offset := 0; offset < len(data); offset += aes.BlockSize {
		block.Encrypt(buf, data[offset:offset+aes.BlockSize])
		copy(data[offset:offset+aes.BlockSize], buf)
	}

	return nil
}

func (a *AES) DecryptECBInPlace(data []byte) error {
	if len(data)%aes.BlockSize != 0 {
		return errBlockAligned
	}

	block, err := aes.NewCipher(a.key)
	if err != nil {
		return fmt.Errorf("create aes cipher: %w", err)
	}

	buf := make([]byte, aes.BlockSize)
	for offset := 0; offset < len(data); offset += aes.BlockSize {
		block.Decrypt(buf, data[offset:offset+aes.BlockSize])
		copy(data[offset:offset+aes.BlockSize], buf)
	}

	return nil
}

func (a *AES) StringHash(data []byte) ([]byte, error) {
	h32 := [4]uint32{}

	for i := 0; i < len(data); i += 4 {
		index := (i / 4) & 3

		remaining := len(data) - i
		if remaining >= 4 {
			h32[index] ^= binary.BigEndian.Uint32(data[i : i+4])
			continue
		}

		var partial uint32
		for j := 0; j < remaining; j++ {
			partial = (partial << 8) | uint32(data[i+j])
		}
		partial <<= uint((4 - remaining) * 8)
		h32[index] ^= partial
	}

	hashBuf := make([]byte, 16)
	for i, value := range h32 {
		binary.BigEndian.PutUint32(hashBuf[i*4:(i+1)*4], value)
	}

	block, err := aes.NewCipher(a.key)
	if err != nil {
		return nil, fmt.Errorf("create aes cipher: %w", err)
	}

	tmp := make([]byte, 16)
	for i := 0; i < 16384; i++ {
		block.Encrypt(tmp, hashBuf)
		copy(hashBuf, tmp)
	}

	out := make([]byte, 8)
	copy(out[:4], hashBuf[:4])
	copy(out[4:], hashBuf[8:12])
	return out, nil
}

func PrepareKey(password []byte) ([]byte, error) {
	pkey := []byte{147, 196, 103, 227, 125, 176, 199, 164, 209, 190, 63, 129, 1, 82, 203, 86}

	for r := 0; r < 65536; r++ {
		for j := 0; j < len(password); j += 16 {
			key := make([]byte, 16)

			for i := 0; i < 16; i += 4 {
				if i+j >= len(password) {
					continue
				}

				copyLength := 4
				if end := i + j + 4; end > len(password) {
					copyLength = len(password) - (i + j)
				}

				copy(key[i:i+copyLength], password[i+j:i+j+copyLength])
			}

			block, err := aes.NewCipher(key)
			if err != nil {
				return nil, fmt.Errorf("create aes cipher: %w", err)
			}

			tmp := make([]byte, 16)
			block.Encrypt(tmp, pkey)
			copy(pkey, tmp)
		}
	}

	return pkey, nil
}

func PrepareKeyV2(password, salt []byte) ([]byte, error) {
	return pbkdf2.Key(func() hash.Hash { return sha512.New() }, string(password), salt, 100000, 32)
}

func ConstantTimeCompare(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}

	var result byte
	for i := range a {
		result |= a[i] ^ b[i]
	}

	return result == 0
}

func NewCTR(aesKey []byte, nonce []byte, start int64) (cipher.Stream, error) {
	if start < 0 {
		return nil, errors.New("start must be non-negative")
	}

	if len(nonce) < 8 {
		return nil, errors.New("nonce must be at least 8 bytes")
	}

	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return nil, fmt.Errorf("create aes cipher: %w", err)
	}

	iv := make([]byte, aes.BlockSize)
	copy(iv[:8], nonce[:8])
	incrementCTRBuffer(iv, start/int64(aes.BlockSize))

	return cipher.NewCTR(block, iv), nil
}

type MAC struct {
	block cipher.Block
	nonce []byte

	posNext int64
	incr    int64
	pos     int64

	macs [][]byte
	mac  []byte
}

func NewMAC(aesKey []byte, nonce []byte) (*MAC, error) {
	if len(nonce) < 8 {
		return nil, errors.New("nonce must be at least 8 bytes")
	}

	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return nil, fmt.Errorf("create aes cipher: %w", err)
	}

	mac := make([]byte, aes.BlockSize)
	copy(mac[:8], nonce[:8])
	copy(mac[8:], nonce[:8])

	return &MAC{
		block:   block,
		nonce:   append([]byte(nil), nonce[:8]...),
		posNext: 131072,
		incr:    131072,
		mac:     mac,
	}, nil
}

func (m *MAC) Update(buffer []byte) {
	for i := 0; i < len(buffer); i += aes.BlockSize {
		for j := 0; j < aes.BlockSize; j++ {
			index := i + j
			if index < len(buffer) {
				m.mac[j] ^= buffer[index]
			}
		}

		tmp := make([]byte, aes.BlockSize)
		m.block.Encrypt(tmp, m.mac)
		copy(m.mac, tmp)

		m.checkBounding()
	}
}

func (m *MAC) Condense() []byte {
	if m.mac != nil {
		m.macs = append(m.macs, append([]byte(nil), m.mac...))
		m.mac = nil
	}

	aggregated := make([]byte, aes.BlockSize)
	tmp := make([]byte, aes.BlockSize)

	for _, item := range m.macs {
		for i := 0; i < aes.BlockSize; i++ {
			aggregated[i] ^= item[i]
		}
		m.block.Encrypt(tmp, aggregated)
		copy(aggregated, tmp)
	}

	result := make([]byte, 8)
	a := binary.BigEndian.Uint32(aggregated[0:4]) ^ binary.BigEndian.Uint32(aggregated[4:8])
	b := binary.BigEndian.Uint32(aggregated[8:12]) ^ binary.BigEndian.Uint32(aggregated[12:16])
	binary.BigEndian.PutUint32(result[0:4], a)
	binary.BigEndian.PutUint32(result[4:8], b)
	return result
}

func (m *MAC) checkBounding() {
	m.pos += aes.BlockSize
	if m.pos < m.posNext {
		return
	}

	m.macs = append(m.macs, append([]byte(nil), m.mac...))
	copy(m.mac[:8], m.nonce)
	copy(m.mac[8:], m.nonce)

	if m.incr < 1048576 {
		m.incr += 131072
	}

	m.posNext += m.incr
}

func incrementCTRBuffer(buf []byte, count int64) {
	if count == 0 {
		return
	}

	i := len(buf) - 1
	for count != 0 {
		sum := count + int64(buf[i])
		buf[i] = byte(sum % 256)
		count = sum / 256
		i--
		if i < 0 {
			i = len(buf) - 1
		}
	}
}

func toAlignedChunks(input []byte) ([][]byte, error) {
	if len(input)%aes.BlockSize != 0 {
		return nil, errBlockAligned
	}

	chunks := make([][]byte, 0, len(input)/aes.BlockSize)
	for i := 0; i < len(input); i += aes.BlockSize {
		chunks = append(chunks, input[i:i+aes.BlockSize])
	}

	return chunks, nil
}

func assertBlockAligned(data []byte) error {
	if len(data)%aes.BlockSize != 0 {
		return errBlockAligned
	}

	return nil
}

func cloneBytes(value []byte) []byte {
	return bytes.Clone(value)
}
