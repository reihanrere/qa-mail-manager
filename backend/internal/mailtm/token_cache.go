package mailtm

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"
)

// tokenTTL bounds how long a Mail.tm JWT is reused. Mail.tm tokens carry no "exp" claim,
// so this is a conservative refresh interval; a 401 also forces a fresh login.
const tokenTTL = 30 * time.Minute

type cachedToken struct {
	value     string
	expiresAt time.Time
}

// tokenCache keeps Mail.tm JWTs in process memory only; they are never persisted.
type tokenCache struct {
	mu     sync.Mutex
	ttl    time.Duration
	now    func() time.Time
	tokens map[string]cachedToken
}

func newTokenCache(ttl time.Duration) *tokenCache {
	return &tokenCache{ttl: ttl, now: time.Now, tokens: map[string]cachedToken{}}
}

func (c *tokenCache) get(address string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.tokens[address]
	if !ok {
		return "", false
	}
	if !c.now().Before(entry.expiresAt) {
		delete(c.tokens, address)
		return "", false
	}
	return entry.value, true
}

func (c *tokenCache) set(address, token string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.tokens[address] = cachedToken{value: token, expiresAt: c.now().Add(c.ttl)}
}

func (c *tokenCache) invalidate(address string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.tokens, address)
}

// token returns a cached JWT for the account, logging in when there is none.
func (s *Service) token(ctx context.Context, address, password string) (string, error) {
	if token, ok := s.tokens.get(address); ok {
		return token, nil
	}
	token, err := s.client.GetToken(ctx, address, password)
	if err != nil {
		return "", err
	}
	s.tokens.set(address, token)
	return token, nil
}

// WithToken runs fn with the account's JWT. If Mail.tm rejects a cached token with 401,
// the token is dropped and fn is retried once with a fresh login.
func (s *Service) WithToken(ctx context.Context, address, password string, fn func(token string) error) error {
	_, cached := s.tokens.get(address)

	token, err := s.token(ctx, address, password)
	if err != nil {
		return err
	}

	err = fn(token)
	if !cached || !isUnauthorized(err) {
		return err
	}

	s.tokens.invalidate(address)
	token, err = s.token(ctx, address, password)
	if err != nil {
		return err
	}
	return fn(token)
}

func isUnauthorized(err error) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusUnauthorized
}
