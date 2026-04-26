package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	megacrypto "github.com/Curstantine/dcidxr/mega/crypto"
)

const (
	maxRetries     = 4
	defaultGateway = "https://g.api.mega.co.nz/"
)

var (
	ErrAPIClosed     = errors.New("api is closed")
	ErrEmptyResponse = errors.New("empty response")
)

type Options struct {
	Gateway    string
	UserAgent  string
	HTTPClient *http.Client
	Keepalive  bool
}

type Client struct {
	httpClient *http.Client
	gateway    string
	userAgent  string
	keepalive  bool

	mu      sync.RWMutex
	sid     string
	closed  bool
	counter uint64
}

func New(opts Options) *Client {
	httpClient := opts.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 60 * time.Second}
	}

	gateway := opts.Gateway
	if gateway == "" {
		gateway = defaultGateway
	}

	keepalive := true
	if !opts.Keepalive {
		keepalive = false
	}

	return &Client{
		httpClient: httpClient,
		gateway:    gateway,
		userAgent:  opts.UserAgent,
		keepalive:  keepalive,
		counter:    uint64(rand.Int63n(9_000_000_000) + 1_000_000_000),
	}
}

func (c *Client) SetSessionID(sid string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sid = sid
}

func (c *Client) SessionID() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.sid
}

func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.closed = true
}

func (c *Client) Request(ctx context.Context, payload map[string]any) (any, error) {
	return c.request(ctx, cloneMap(payload), 0)
}

func (c *Client) request(ctx context.Context, payload map[string]any, retry int) (any, error) {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil, ErrAPIClosed
	}

	_, hasHashcash := payload["_hashcash"].(string)
	if !hasHashcash {
		c.counter++
	}

	query := url.Values{}
	query.Set("id", strconv.FormatUint(c.counter, 10))
	if c.sid != "" {
		query.Set("sid", c.sid)
	}
	c.mu.Unlock()

	if rawQS, ok := payload["_querystring"]; ok {
		if qs, ok := rawQS.(map[string]string); ok {
			for k, v := range qs {
				query.Set(k, v)
			}
		} else if qs, ok := rawQS.(map[string]any); ok {
			for k, v := range qs {
				query.Set(k, fmt.Sprint(v))
			}
		}
		delete(payload, "_querystring")
	}

	headers := map[string]string{"Content-Type": "application/json"}
	if token, ok := payload["_hashcash"].(string); ok {
		headers["X-Hashcash"] = token
		delete(payload, "_hashcash")
	}

	body, err := json.Marshal([]any{payload})
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	requestURL := c.gateway + "cs?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	for name, value := range headers {
		req.Header.Set(name, value)
	}

	if c.userAgent != "" {
		req.Header.Set("User-Agent", c.userAgent)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("perform request: %w", err)
	}
	defer resp.Body.Close()

	if challenge := resp.Header.Get("X-Hashcash"); challenge != "" {
		token, err := megacrypto.GenerateHashcashToken(challenge)
		if err != nil {
			return nil, fmt.Errorf("solve hashcash: %w", err)
		}

		payload["_hashcash"] = token
		return c.handleRetry(ctx, payload, retry, -3)
	}

	parsed, err := handleAPIResponse(resp)
	if err != nil {
		return nil, err
	}

	if parsed == nil {
		return nil, ErrEmptyResponse
	}

	if array, ok := parsed.([]any); ok {
		if len(array) == 0 {
			return nil, ErrEmptyResponse
		}
		parsed = array[0]
	}

	if code, ok := parsed.(float64); ok && code < 0 {
		return c.handleRetry(ctx, payload, retry, int(code))
	}

	return parsed, nil
}

func (c *Client) handleRetry(ctx context.Context, payload map[string]any, retry int, code int) (any, error) {
	if code == -3 && retry < maxRetries {
		delay := time.Duration(math.Pow(2, float64(retry+1))) * time.Second
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(delay):
			return c.request(ctx, payload, retry+1)
		}
	}

	if message, ok := apiErrors[-code]; ok {
		return nil, errors.New(message)
	}

	return nil, fmt.Errorf("mega api error: %d", code)
}

func handleAPIResponse(response *http.Response) (any, error) {
	if response.Status == "Server Too Busy" {
		return float64(-3), nil
	}

	if response.StatusCode < 200 || response.StatusCode > 299 {
		body, _ := io.ReadAll(response.Body)
		if len(body) == 0 {
			return nil, fmt.Errorf("server returned error: %s", response.Status)
		}

		return nil, fmt.Errorf("server returned error: %s (%s)", response.Status, string(body))
	}

	var payload any
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return payload, nil
}

func cloneMap(input map[string]any) map[string]any {
	out := make(map[string]any, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}
