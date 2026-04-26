package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/Curstantine/dcidxr/mega/api"
	"github.com/Curstantine/dcidxr/mega/file"
)

type Status string

const (
	StatusClosed     Status = "closed"
	StatusConnecting Status = "connecting"
	StatusReady      Status = "ready"
)

type Options struct {
	Email            string
	Password         string
	SecondFactorCode string

	Autoload  bool
	Autologin bool
	Keepalive bool

	API api.Options
}

type Storage struct {
	api     *api.Client
	options Options
	status  Status

	Name      string
	User      string
	Root      *file.Node
	Trash     *file.Node
	Inbox     *file.Node
	Mounts    []*file.Node
	Files     map[string]*file.Node
	ShareKeys map[string][]byte
}

func New(options Options) *Storage {
	if !options.Autoload {
		options.Autoload = true
	}
	if !options.Autologin {
		options.Autologin = true
	}
	if !options.Keepalive {
		options.Keepalive = true
	}

	apiOptions := options.API
	apiOptions.Keepalive = options.Keepalive

	return &Storage{
		api:       api.New(apiOptions),
		options:   options,
		status:    StatusClosed,
		Files:     map[string]*file.Node{},
		ShareKeys: map[string][]byte{},
	}
}

func (s *Storage) Status() Status {
	return s.status
}

func (s *Storage) API() *api.Client {
	return s.api
}

func (s *Storage) Login(ctx context.Context) error {
	if s.options.Email == "" {
		return errors.New("starting a session without credentials isn't supported")
	}

	s.status = StatusConnecting
	defer func() {
		if s.status != StatusReady {
			s.status = StatusClosed
		}
	}()

	response, err := s.api.Request(ctx, map[string]any{
		"a":    "us0",
		"user": s.options.Email,
	})
	if err != nil {
		return err
	}

	responseMap, ok := response.(map[string]any)
	if !ok {
		return errors.New("unexpected login preflight response type")
	}

	version, ok := responseMap["v"].(float64)
	if !ok {
		return errors.New("missing account version")
	}

	if version != 1 && version != 2 {
		return errors.New("account version not supported")
	}

	return errors.New("login cryptographic flow not implemented yet in this bootstrap")
}

func (s *Storage) Reload(ctx context.Context) error {
	if s.status != StatusReady {
		return errors.New("storage is not ready")
	}

	_, err := s.api.Request(ctx, map[string]any{
		"a": "f",
		"c": 1,
	})
	if err != nil {
		return fmt.Errorf("reload files: %w", err)
	}

	return errors.New("reload graph import not implemented yet in this bootstrap")
}

func (s *Storage) Close() {
	s.status = StatusClosed
	s.api.Close()
}
