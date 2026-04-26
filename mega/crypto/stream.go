package crypto

import (
	"crypto/rand"
	"errors"
	"fmt"
)

var (
	errWrongEncryptKeyLength = errors.New("wrong key length, must be 192-bit")
	errWrongVerifyKeyLength  = errors.New("wrong key length, must be 256-bit")
	errWrongStartOffset      = errors.New("start offset must be a multiple of 16")
	errMACVerificationFailed = errors.New("mac verification failed")
)

func Encrypt(data []byte, key []byte) (ciphertext []byte, mergedKey []byte, mac []byte, err error) {
	if key == nil {
		key = make([]byte, 24)
		if _, err := rand.Read(key); err != nil {
			return nil, nil, nil, fmt.Errorf("generate random key: %w", err)
		}
	}

	if len(key) != 24 {
		return nil, nil, nil, errWrongEncryptKeyLength
	}

	aesObj, err := NewAES(key[:16])
	if err != nil {
		return nil, nil, nil, err
	}

	ctr, err := NewCTR(aesObj.Key(), key[16:24], 0)
	if err != nil {
		return nil, nil, nil, err
	}

	macObj, err := NewMAC(aesObj.Key(), key[16:24])
	if err != nil {
		return nil, nil, nil, err
	}

	plaintext := cloneBytes(data)
	macObj.Update(plaintext)

	ciphertext = cloneBytes(plaintext)
	ctr.XORKeyStream(ciphertext, ciphertext)

	mac = macObj.Condense()
	mergedKey = MergeKeyMAC(key, mac)

	return ciphertext, mergedKey, mac, nil
}

func Decrypt(data []byte, mergedKey []byte, start int64, disableVerification bool) (plaintext []byte, mac []byte, err error) {
	if start%16 != 0 {
		return nil, nil, errWrongStartOffset
	}

	if start != 0 {
		disableVerification = true
	}

	aesKey, err := GetCipherKey(mergedKey)
	if err != nil {
		return nil, nil, err
	}

	if len(mergedKey) < 24 {
		return nil, nil, errWrongEncryptKeyLength
	}

	ctr, err := NewCTR(aesKey, mergedKey[16:24], start)
	if err != nil {
		return nil, nil, err
	}

	plaintext = cloneBytes(data)
	ctr.XORKeyStream(plaintext, plaintext)

	if disableVerification {
		return plaintext, nil, nil
	}

	if len(mergedKey) != 32 {
		return nil, nil, errWrongVerifyKeyLength
	}

	macObj, err := NewMAC(aesKey, mergedKey[16:24])
	if err != nil {
		return nil, nil, err
	}

	macObj.Update(plaintext)
	mac = macObj.Condense()

	if !ConstantTimeCompare(mac, mergedKey[24:32]) {
		return nil, nil, errMACVerificationFailed
	}

	return plaintext, mac, nil
}

func Verify(data []byte, mergedKey []byte) ([]byte, error) {
	if len(mergedKey) != 32 {
		return nil, errWrongVerifyKeyLength
	}

	aesKey, err := GetCipherKey(mergedKey)
	if err != nil {
		return nil, err
	}

	macObj, err := NewMAC(aesKey, mergedKey[16:24])
	if err != nil {
		return nil, err
	}

	macObj.Update(data)
	mac := macObj.Condense()
	if !ConstantTimeCompare(mac, mergedKey[24:32]) {
		return nil, errMACVerificationFailed
	}

	return mac, nil
}
