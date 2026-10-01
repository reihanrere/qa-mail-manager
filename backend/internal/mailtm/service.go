package mailtm

import (
	"context"
	"errors"
)

// Service orchestrates higher-level Mail.tm operations on top of the raw Client.
type Service struct {
	client *Client
	tokens *tokenCache
}

// NewService builds a Mail.tm service wrapping the given client.
func NewService(client *Client) *Service {
	return &Service{client: client, tokens: newTokenCache(tokenTTL)}
}

// PickAvailableDomain returns the first active domain, used when generating new accounts.
func (s *Service) PickAvailableDomain(ctx context.Context) (string, error) {
	domains, err := s.client.GetDomains(ctx)
	if err != nil {
		return "", err
	}
	for _, d := range domains {
		if d.IsActive {
			return d.Domain, nil
		}
	}
	return "", errors.New("no active mail.tm domain available")
}

// RegisterAccount creates a new account on Mail.tm and returns its remote ID.
func (s *Service) RegisterAccount(ctx context.Context, address, password string) (string, error) {
	account, err := s.client.CreateAccount(ctx, address, password)
	if err != nil {
		return "", err
	}
	return account.ID, nil
}

// FetchInboxPage retrieves one page of messages using an existing token.
func (s *Service) FetchInboxPage(ctx context.Context, token string, page int) (*MessagePage, error) {
	return s.client.GetMessages(ctx, token, page)
}

// FetchMessageDetail retrieves a single message's full body.
func (s *Service) FetchMessageDetail(ctx context.Context, address, password, messageID string) (*MessageDetail, error) {
	var detail *MessageDetail
	err := s.WithToken(ctx, address, password, func(token string) error {
		var err error
		detail, err = s.client.GetMessageDetail(ctx, token, messageID)
		return err
	})
	return detail, err
}

// Download fetches a binary resource (attachment or raw source) with the account's token.
func (s *Service) Download(ctx context.Context, address, password, path string) ([]byte, error) {
	var body []byte
	err := s.WithToken(ctx, address, password, func(token string) error {
		var err error
		body, err = s.client.Download(ctx, token, path)
		return err
	})
	return body, err
}

// MarkMessageSeen marks a single message as read.
func (s *Service) MarkMessageSeen(ctx context.Context, address, password, messageID string) error {
	return s.WithToken(ctx, address, password, func(token string) error {
		return s.client.MarkMessageSeen(ctx, token, messageID)
	})
}

// DeleteMessage permanently deletes a single message.
func (s *Service) DeleteMessage(ctx context.Context, address, password, messageID string) error {
	return s.WithToken(ctx, address, password, func(token string) error {
		return s.client.DeleteMessage(ctx, token, messageID)
	})
}
