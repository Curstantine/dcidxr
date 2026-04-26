package crypto

import (
	"crypto/sha1"
	"encoding/hex"
	"testing"
)

func TestPrepareKeyVectors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		size     int
		expected string
	}{
		{name: "8-bytes", size: 8, expected: "c4589a459956887caf0b408635c3c03b"},
		{name: "10-bytes", size: 10, expected: "59930b1c55d783ac77df4c4ff261b0f1"},
		{name: "64-bytes", size: 64, expected: "83bd84689f057f9ed9834b3ecb81d80e"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			key, err := PrepareKey(testBuffer(tt.size, 0, 1))
			if err != nil {
				t.Fatalf("PrepareKey failed: %v", err)
			}

			got := hex.EncodeToString(key)
			if got != tt.expected {
				t.Fatalf("unexpected key: got %s want %s", got, tt.expected)
			}
		})
	}
}

func TestStringHashVectors(t *testing.T) {
	t.Parallel()

	derived, err := PrepareKey(testBuffer(8, 0, 1))
	if err != nil {
		t.Fatalf("PrepareKey failed: %v", err)
	}

	aesObj, err := NewAES(derived)
	if err != nil {
		t.Fatalf("NewAES failed: %v", err)
	}

	tests := []struct {
		name     string
		size     int
		expected string
	}{
		{name: "10-bytes", size: 10, expected: "9e791646c66840b5"},
		{name: "16-bytes", size: 16, expected: "6ba07aca224e84a4"},
		{name: "32-bytes", size: 32, expected: "6a1e6c5539c0ed48"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			hash, err := aesObj.StringHash(testBuffer(tt.size, 0, 1))
			if err != nil {
				t.Fatalf("StringHash failed: %v", err)
			}

			got := hex.EncodeToString(hash)
			if got != tt.expected {
				t.Fatalf("unexpected hash: got %s want %s", got, tt.expected)
			}
		})
	}
}

func TestAESCBCVector(t *testing.T) {
	t.Parallel()

	aesObj, err := NewAES(testBuffer(16, 0, 1))
	if err != nil {
		t.Fatalf("NewAES failed: %v", err)
	}

	input := testBuffer(160, 0, 1)
	encrypted := make([]byte, len(input))
	copy(encrypted, input)

	if err := aesObj.EncryptCBCInPlace(encrypted); err != nil {
		t.Fatalf("EncryptCBCInPlace failed: %v", err)
	}

	gotSHA := hex.EncodeToString(sha1Digest(encrypted))
	if gotSHA != "cd9a7168ec42cb0cc1f2a18575ff7794b4b5a95d" {
		t.Fatalf("unexpected encrypted sha1: got %s", gotSHA)
	}

	if err := aesObj.DecryptCBCInPlace(encrypted); err != nil {
		t.Fatalf("DecryptCBCInPlace failed: %v", err)
	}

	if hex.EncodeToString(sha1Digest(input)) != hex.EncodeToString(sha1Digest(encrypted)) {
		t.Fatal("decrypted buffer differs from original")
	}
}

func TestCTRVector(t *testing.T) {
	t.Parallel()

	key := testBuffer(24, 0, 1)
	data := testBuffer(32, 0, 1)

	stream, err := NewCTR(key[:16], key[16:], 0)
	if err != nil {
		t.Fatalf("NewCTR failed: %v", err)
	}

	encrypted := make([]byte, len(data))
	copy(encrypted, data)
	stream.XORKeyStream(encrypted, encrypted)

	got := hex.EncodeToString(encrypted)
	if got != "8de7dac3d95eca9fd74f30c1ecf8247a8f25d1b3fd2d11a8a7b458d16a085434" {
		t.Fatalf("unexpected CTR encrypted value: got %s", got)
	}

	decryptStream, err := NewCTR(key[:16], key[16:], 0)
	if err != nil {
		t.Fatalf("NewCTR (decrypt) failed: %v", err)
	}
	decryptStream.XORKeyStream(encrypted, encrypted)

	if hex.EncodeToString(encrypted) != hex.EncodeToString(data) {
		t.Fatal("decrypted buffer differs from original")
	}
}

func TestEncryptDecryptVectors(t *testing.T) {
	t.Parallel()

	size := 151511
	input := testBuffer(size, 0, 1)
	key := testBuffer(24, 100, 7)

	ciphertext, mergedKey, _, err := Encrypt(input, key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	if got := hex.EncodeToString(mergedKey); got != "b0b0909070707093e957d163217c2f3fd4dbe2e9f0f7fe0675f47bd299c3e9f2" {
		t.Fatalf("unexpected merged key: got %s", got)
	}

	if got := hex.EncodeToString(sha1Digest(ciphertext)); got != "addb96c07ac4e6b66316b81530256c911b0b49d1" {
		t.Fatalf("unexpected ciphertext sha1: got %s", got)
	}

	plain, _, err := Decrypt(ciphertext, mergedKey, 0, false)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if hex.EncodeToString(sha1Digest(plain)) != hex.EncodeToString(sha1Digest(input)) {
		t.Fatal("roundtrip plaintext differs")
	}

	brokenKey := append([]byte(nil), mergedKey...)
	brokenKey[15] = ^brokenKey[15]

	if _, _, err := Decrypt(ciphertext, brokenKey, 0, false); err == nil {
		t.Fatal("expected MAC verification error")
	}
}

func sha1Digest(data []byte) []byte {
	sum := sha1.Sum(data)
	return sum[:]
}

func testBuffer(size int, start byte, step byte) []byte {
	buffer := make([]byte, size)
	for i := 0; i < size; i++ {
		buffer[i] = byte((int(start) + i*int(step)) % 255)
	}

	return buffer
}
