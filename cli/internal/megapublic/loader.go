package megapublic

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	megaapi "github.com/Curstantine/dcidxr/mega/api"
	megacrypto "github.com/Curstantine/dcidxr/mega/crypto"
	megafile "github.com/Curstantine/dcidxr/mega/file"
)

type Node struct {
	Name       string
	NodeID     string
	DownloadID string
	Directory  bool
	Size       int64
	Timestamp  int64
	Children   []*Node

	attributes map[string]any
	key        []byte
}

type apiNode struct {
	Handle     string `json:"h"`
	Parent     string `json:"p"`
	Type       int    `json:"t"`
	Size       int64  `json:"s"`
	Timestamp  int64  `json:"ts"`
	Owner      string `json:"u"`
	Key        string `json:"k"`
	Attributes string `json:"a"`
}

func Load(ctx context.Context, link string) (*Node, error) {
	parsed, err := megafile.FromURL(link)
	if err != nil {
		return nil, err
	}

	if parsed.Directory {
		return loadDirectory(ctx, parsed)
	}

	return loadFile(ctx, parsed)
}

func loadDirectory(ctx context.Context, parsed *megafile.Node) (*Node, error) {
	if parsed.DownloadID == "" {
		return nil, errors.New("missing public folder id")
	}

	client := megaapi.New(megaapi.Options{})
	response, err := client.Request(ctx, map[string]any{
		"a":  "f",
		"c":  1,
		"ca": 1,
		"r":  1,
		"_querystring": map[string]any{
			"n": parsed.DownloadID,
		},
	})
	if err != nil {
		return nil, err
	}

	responseMap, ok := response.(map[string]any)
	if !ok {
		return nil, errors.New("unexpected MEGA folder response")
	}

	nodesRaw := responseMap["f"]
	nodesBytes, err := json.Marshal(nodesRaw)
	if err != nil {
		return nil, err
	}

	nodes := []apiNode{}
	if err := json.Unmarshal(nodesBytes, &nodes); err != nil {
		return nil, fmt.Errorf("decode MEGA node list: %w", err)
	}

	handles := map[string]struct{}{}
	for _, node := range nodes {
		handles[node.Handle] = struct{}{}
	}

	folder := findRootNode(nodes, handles)
	if folder == nil {
		return nil, errors.New("shared folder root node could not be determined")
	}

	root := &Node{
		NodeID:     folder.Handle,
		DownloadID: parsed.DownloadID,
		Directory:  true,
		Timestamp:  folder.Timestamp,
		Children:   []*Node{},
	}

	var masterAES *megacrypto.AES
	if len(parsed.Key) > 0 {
		masterAES, err = megacrypto.NewAES(parsed.Key)
		if err != nil {
			return nil, err
		}
	}

	if err := loadMetadata(root, masterAES, *folder); err != nil {
		return nil, err
	}

	nodeByHandle := map[string]*Node{folder.Handle: root}
	for _, rawNode := range nodes {
		if rawNode.Handle == folder.Handle {
			continue
		}

		node := &Node{NodeID: rawNode.Handle}
		if err := loadMetadata(node, masterAES, rawNode); err != nil {
			return nil, err
		}

		node.DownloadID = rawNode.Handle
		nodeByHandle[rawNode.Handle] = node
	}

	for _, rawNode := range nodes {
		if rawNode.Handle == folder.Handle {
			continue
		}

		parent := nodeByHandle[rawNode.Parent]
		child := nodeByHandle[rawNode.Handle]
		if parent == nil || child == nil {
			continue
		}

		parent.Children = append(parent.Children, child)
	}

	if len(parsed.Key) > 0 && len(root.attributes) == 0 {
		return nil, errors.New("attributes could not be decrypted with provided key")
	}

	if parsed.LoadedFile != "" {
		loaded := nodeByHandle[parsed.LoadedFile]
		if loaded == nil {
			return nil, errors.New("node (file or folder) not found in folder")
		}

		return loaded, nil
	}

	return root, nil
}

func loadFile(ctx context.Context, parsed *megafile.Node) (*Node, error) {
	if parsed.DownloadID == "" {
		return nil, errors.New("missing public file id")
	}

	client := megaapi.New(megaapi.Options{})
	response, err := client.Request(ctx, map[string]any{
		"a": "g",
		"p": parsed.DownloadID,
	})
	if err != nil {
		return nil, err
	}

	responseMap, ok := response.(map[string]any)
	if !ok {
		return nil, errors.New("unexpected MEGA file response")
	}

	node := &Node{
		DownloadID: parsed.DownloadID,
		Directory:  false,
	}

	if size, ok := responseMap["s"].(float64); ok {
		node.Size = int64(size)
	}

	if len(parsed.Key) > 0 {
		node.key = slices.Clone(parsed.Key)
	}

	if at, ok := responseMap["at"].(string); ok {
		if err := decryptAttributes(node, at); err != nil {
			return nil, err
		}
	}

	if len(node.key) > 0 && len(node.attributes) == 0 {
		return nil, errors.New("attributes could not be decrypted with provided key")
	}

	return node, nil
}

func findRootNode(nodes []apiNode, handles map[string]struct{}) *apiNode {
	for _, node := range nodes {
		if node.Key == "" {
			continue
		}

		parts := strings.Split(node.Key, ":")
		if len(parts) == 0 {
			continue
		}

		if node.Handle == parts[0] {
			candidate := node
			return &candidate
		}
	}

	for _, node := range nodes {
		if _, ok := handles[node.Parent]; !ok {
			candidate := node
			return &candidate
		}
	}

	return nil
}

func loadMetadata(node *Node, masterAES *megacrypto.AES, raw apiNode) error {
	node.Size = raw.Size
	node.Timestamp = raw.Timestamp
	node.Directory = raw.Type != 0
	if node.Directory && node.Children == nil {
		node.Children = []*Node{}
	}

	if masterAES == nil || raw.Key == "" {
		return nil
	}

	encryptedKeys, err := keySlots(raw.Key)
	if err != nil {
		return err
	}

	var fallbackKey []byte
	var unpackedAttributes map[string]any

	for _, encryptedKey := range encryptedKeys {
		decryptedKey := slices.Clone(encryptedKey)
		if len(decryptedKey) <= 32 {
			if err := masterAES.DecryptECBInPlace(decryptedKey); err != nil {
				continue
			}
		} else {
			continue
		}

		if fallbackKey == nil {
			fallbackKey = slices.Clone(decryptedKey)
		}

		if raw.Attributes == "" {
			node.key = slices.Clone(decryptedKey)
			break
		}

		attrs, ok := tryDecryptAttributes(decryptedKey, raw.Attributes)
		if ok {
			node.key = slices.Clone(decryptedKey)
			unpackedAttributes = attrs
			break
		}
	}

	if node.key == nil {
		node.key = fallbackKey
	}

	if unpackedAttributes != nil {
		setAttributes(node, unpackedAttributes)
		return nil
	}

	if raw.Attributes != "" {
		return decryptAttributes(node, raw.Attributes)
	}

	return nil
}

func decryptAttributes(node *Node, encoded string) error {
	if len(node.key) == 0 {
		return nil
	}

	attributes, ok := tryDecryptAttributes(node.key, encoded)
	if ok {
		setAttributes(node, attributes)
	}

	return nil
}

func tryDecryptAttributes(key []byte, encoded string) (map[string]any, bool) {
	at, err := megacrypto.DecodeBase64URL(encoded)
	if err != nil {
		return nil, false
	}

	if len(at)%16 != 0 {
		return nil, false
	}

	cipherKey, err := megacrypto.GetCipherKey(key)
	if err != nil {
		return nil, false
	}

	aesObj, err := megacrypto.NewAES(cipherKey)
	if err != nil {
		return nil, false
	}

	decrypted := slices.Clone(at)
	if err := aesObj.DecryptCBCInPlace(decrypted); err != nil {
		return nil, false
	}

	unpacked, ok := unpackAttributes(decrypted)
	return unpacked, ok
}

func unpackAttributes(data []byte) (map[string]any, bool) {
	end := len(data)
	for i, value := range data {
		if value == 0 {
			end = i
			break
		}
	}

	trimmed := string(data[:end])
	if !strings.HasPrefix(trimmed, `MEGA{"`) {
		return nil, false
	}

	attributes := map[string]any{}
	if err := json.Unmarshal([]byte(trimmed[4:]), &attributes); err != nil {
		return nil, false
	}

	return attributes, true
}

func setAttributes(node *Node, attributes map[string]any) {
	node.attributes = attributes
	if name, ok := attributes["n"].(string); ok {
		node.Name = name
	}
}

func keySlots(raw string) ([][]byte, error) {
	slots := strings.Split(raw, "/")
	decoded := make([][]byte, 0, len(slots))

	for _, slot := range slots {
		parts := strings.Split(slot, ":")
		if len(parts) == 0 {
			continue
		}

		candidate := parts[len(parts)-1]
		if candidate == "" {
			continue
		}

		value, err := megacrypto.DecodeBase64URL(candidate)
		if err != nil {
			continue
		}

		decoded = append(decoded, value)
	}

	if len(decoded) == 0 {
		return nil, errors.New("node key slots could not be decoded")
	}

	return decoded, nil
}
