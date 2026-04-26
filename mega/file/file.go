package file

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	megacrypto "github.com/Curstantine/dcidxr/mega/crypto"
)

var validArgPattern = regexp.MustCompile(`^[\w-]+$`)

type Node struct {
	DownloadID string
	NodeID     string
	LoadedFile string
	Key        []byte

	Directory bool
	Type      int
	Size      int64
	Timestamp int64
	Owner     string

	Name       string
	Attributes map[string]any

	Parent   *Node
	Children []*Node
}

func New(downloadID string, key []byte, directory bool) (*Node, error) {
	if err := validateArg(downloadID); err != nil {
		return nil, err
	}

	n := &Node{
		DownloadID: downloadID,
		Directory:  directory,
	}

	if key != nil {
		n.Key = make([]byte, len(key))
		copy(n.Key, key)
	}

	if directory {
		n.Children = []*Node{}
		n.Type = 1
	}

	return n, nil
}

func FromURL(raw string) (*Node, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("parse url: %w", err)
	}

	host := strings.ToLower(parsed.Hostname())
	if host != "mega.nz" && host != "mega.co.nz" {
		return nil, errors.New("invalid URL: wrong hostname")
	}

	if strings.Contains(parsed.Path, "/file/") || strings.Contains(parsed.Path, "/folder/") {
		return fromNewURL(parsed)
	}

	return fromOldURL(parsed)
}

func (n *Node) CreatedAtUnixMilli() int64 {
	if n.Timestamp == 0 {
		return 0
	}

	return n.Timestamp * 1000
}

func (n *Node) Find(query func(*Node) bool, deep bool) *Node {
	if !n.Directory {
		return nil
	}

	for _, child := range n.Children {
		if query(child) {
			return child
		}

		if deep && child.Directory {
			if found := child.Find(query, true); found != nil {
				return found
			}
		}
	}

	return nil
}

func (n *Node) Filter(query func(*Node) bool, deep bool) []*Node {
	if !n.Directory {
		return nil
	}

	results := make([]*Node, 0)
	for _, child := range n.Children {
		if query(child) {
			results = append(results, child)
		}

		if deep && child.Directory {
			results = append(results, child.Filter(query, true)...)
		}
	}

	return results
}

func (n *Node) Navigate(path string) *Node {
	if !n.Directory {
		return nil
	}

	parts := strings.Split(path, "/")
	current := n

	for _, part := range parts {
		if part == "" {
			continue
		}

		next := current.Find(func(candidate *Node) bool {
			return candidate.Name == part
		}, false)

		if next == nil {
			return nil
		}

		current = next
	}

	return current
}

func validateArg(value string) error {
	if value == "" {
		return nil
	}

	if !validArgPattern.MatchString(value) {
		return fmt.Errorf("invalid argument: %q", value)
	}

	return nil
}

func fromNewURL(parsed *url.URL) (*Node, error) {
	fileHandler := parsed.Path[strings.LastIndex(parsed.Path, "/")+1:]
	hash := strings.TrimPrefix(parsed.Fragment, "#")
	split := strings.SplitN(hash, "/file/", 2)
	fileKey := split[0]

	if (fileHandler != "" && fileKey == "") || (fileHandler == "" && fileKey != "") {
		return nil, errors.New("invalid URL: too few arguments")
	}

	var key []byte
	if fileKey != "" {
		decoded, err := megacrypto.DecodeBase64URL(fileKey)
		if err != nil {
			return nil, fmt.Errorf("invalid URL key: %w", err)
		}
		key = decoded
	}

	node, err := New(fileHandler, key, strings.Contains(parsed.Path, "/folder/"))
	if err != nil {
		return nil, err
	}

	if len(split) == 2 {
		node.LoadedFile = split[1]
	}

	return node, nil
}

func fromOldURL(parsed *url.URL) (*Node, error) {
	if parsed.Fragment == "" {
		return nil, errors.New("invalid URL: no hash")
	}

	split := strings.Split(parsed.Fragment, "!")
	if len(split) == 0 {
		return nil, errors.New("invalid URL: format not recognized")
	}

	kind := split[0]
	if kind != "" && kind != "F" {
		return nil, errors.New("invalid URL: format not recognized")
	}

	if len(split) <= 2 {
		return nil, errors.New("invalid URL: too few arguments")
	}

	if len(split) >= 5 {
		return nil, errors.New("invalid URL: too many arguments")
	}

	var key []byte
	if split[2] != "" {
		decoded, err := megacrypto.DecodeBase64URL(split[2])
		if err != nil {
			return nil, fmt.Errorf("invalid URL key: %w", err)
		}
		key = decoded
	}

	node, err := New(split[1], key, kind == "F")
	if err != nil {
		return nil, err
	}

	if len(split) == 4 {
		node.LoadedFile = split[3]
	}

	return node, nil
}
