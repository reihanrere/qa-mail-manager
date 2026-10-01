package mailtm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

// Client is a minimal wrapper around the Mail.tm HTTP API.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient builds a Mail.tm client bound to the given base URL.
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// APIError is a non-2xx response from Mail.tm.
type APIError struct {
	StatusCode int
	Message    string
}

// Error formats the status and Mail.tm's message, e.g. "mail.tm error (404): Not Found".
func (e *APIError) Error() string {
	return fmt.Sprintf("mail.tm error (%d): %s", e.StatusCode, e.Message)
}

// requestOptions overrides the default JSON content negotiation for a single request.
type requestOptions struct {
	accept      string
	contentType string
	// raw receives the undecoded response body (downloads)
	raw *[]byte
}

// do executes an HTTP request against the Mail.tm API and decodes the JSON result.
func (c *Client) do(ctx context.Context, method, path string, token string, body any, out any) error {
	return c.doWith(ctx, method, path, token, body, out, requestOptions{})
}

// doWith is do with per-request Accept/Content-Type overrides.
func (c *Client) doWith(ctx context.Context, method, path string, token string, body any, out any, opts requestOptions) error {
	if opts.accept == "" {
		opts.accept = "application/json"
	}
	if opts.contentType == "" {
		opts.contentType = "application/json"
	}

	var reqBody io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to encode request body: %w", err)
		}
		reqBody = bytes.NewReader(payload)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reqBody)
	if err != nil {
		return fmt.Errorf("failed to build request: %w", err)
	}
	req.Header.Set("Content-Type", opts.contentType)
	req.Header.Set("Accept", opts.accept)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("mail.tm request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read mail.tm response: %w", err)
	}

	if resp.StatusCode >= 400 {
		var errResp errorResponse
		_ = json.Unmarshal(respBody, &errResp)
		return &APIError{StatusCode: resp.StatusCode, Message: errResp.message()}
	}

	if opts.raw != nil {
		*opts.raw = respBody
		return nil
	}
	if out == nil || len(respBody) == 0 {
		return nil
	}

	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("failed to decode mail.tm response: %w", err)
	}

	return nil
}

// GetDomains retrieves the list of domains available for account creation.
func (c *Client) GetDomains(ctx context.Context) ([]Domain, error) {
	var out []Domain
	if err := c.do(ctx, http.MethodGet, "/domains", "", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// CreateAccount registers a new Mail.tm account.
func (c *Client) CreateAccount(ctx context.Context, address, password string) (*Account, error) {
	var out Account
	body := createAccountRequest{Address: address, Password: password}
	if err := c.do(ctx, http.MethodPost, "/accounts", "", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetToken logs in to Mail.tm and returns a short-lived JWT (never persisted).
func (c *Client) GetToken(ctx context.Context, address, password string) (string, error) {
	var out tokenResponse
	body := tokenRequest{Address: address, Password: password}
	if err := c.do(ctx, http.MethodPost, "/token", "", body, &out); err != nil {
		return "", err
	}
	return out.Token, nil
}

// GetMessages retrieves one page (1-based, newest first) of the inbox for the account owning the token.
// JSON-LD is requested because only that representation includes the total item count.
func (c *Client) GetMessages(ctx context.Context, token string, page int) (*MessagePage, error) {
	var out MessagePage
	path := "/messages?page=" + strconv.Itoa(page)
	if err := c.doWith(ctx, http.MethodGet, path, token, nil, &out, requestOptions{accept: "application/ld+json"}); err != nil {
		return nil, err
	}
	return &out, nil
}

// DeleteMessage permanently deletes a message on Mail.tm.
func (c *Client) DeleteMessage(ctx context.Context, token, messageID string) error {
	return c.do(ctx, http.MethodDelete, "/messages/"+messageID, token, nil, nil)
}

// MarkMessageSeen marks a message as read on Mail.tm.
func (c *Client) MarkMessageSeen(ctx context.Context, token, messageID string) error {
	body := markSeenRequest{Seen: true}
	return c.doWith(ctx, http.MethodPatch, "/messages/"+messageID, token, body, nil,
		requestOptions{contentType: "application/merge-patch+json"})
}

// Download fetches a binary resource such as an attachment's downloadUrl or a
// message's raw source (/messages/{id}/download).
func (c *Client) Download(ctx context.Context, token, path string) ([]byte, error) {
	var body []byte
	err := c.doWith(ctx, http.MethodGet, path, token, nil, nil, requestOptions{accept: "*/*", raw: &body})
	return body, err
}

// GetMessageDetail retrieves the full body of a single message.
func (c *Client) GetMessageDetail(ctx context.Context, token, messageID string) (*MessageDetail, error) {
	var out MessageDetail
	if err := c.do(ctx, http.MethodGet, "/messages/"+messageID, token, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
