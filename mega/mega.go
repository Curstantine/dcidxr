package mega

import megacrypto "github.com/Curstantine/dcidxr/mega/crypto"

// Public crypto helpers are re-exported here for ergonomic parity with megajs.
func EncryptKeyMAC(key, mac []byte) []byte {
	return megacrypto.MergeKeyMAC(key, mac)
}

func DecryptKeyMAC(key []byte) []byte {
	return megacrypto.UnmergeKeyMAC(key)
}
