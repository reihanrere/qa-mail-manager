package providers

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"qa-mail-manager/internal/mailtm"
	"qa-mail-manager/internal/models"
)

// MailTM adapts the public Mail.tm API to MailProvider.
type MailTM struct {
	svc *mailtm.Service
}

// NewMailTM wraps an existing Mail.tm service.
func NewMailTM(svc *mailtm.Service) *MailTM {
	return &MailTM{svc: svc}
}

func (p *MailTM) Name() string { return NameMailTM }

func (p *MailTM) Label() string { return "Mail.tm (public)" }

func (p *MailTM) PickDomain(ctx context.Context) (string, error) {
	return p.svc.PickAvailableDomain(ctx)
}

func (p *MailTM) Domains(ctx context.Context) ([]string, error) {
	return p.svc.ActiveDomains(ctx)
}

func (p *MailTM) CreateAddress(ctx context.Context, email, password string) (string, error) {
	id, err := p.svc.RegisterAccount(ctx, email, password)
	if isAddressTaken(err) {
		return "", ErrAddressTaken
	}
	return id, err
}

func (p *MailTM) ListMessages(ctx context.Context, account *models.MailAccount, page int) (*MessagePage, error) {
	var result *MessagePage
	err := p.svc.WithToken(ctx, account.Email, account.Password, func(token string) error {
		var err error
		result, err = p.svc.FetchInboxPage(ctx, token, page)
		return err
	})
	return result, err
}

func (p *MailTM) GetMessage(ctx context.Context, account *models.MailAccount, messageID string) (*MessageDetail, error) {
	detail, err := p.svc.FetchMessageDetail(ctx, account.Email, account.Password, messageID)
	if err != nil {
		return nil, err
	}
	if detail.Attachments == nil {
		detail.Attachments = []Attachment{}
	}
	// Mail.tm's download paths need its token; the UI downloads through our API instead
	for i := range detail.Attachments {
		detail.Attachments[i].DownloadURL = ""
	}
	return detail, nil
}

func (p *MailTM) GetAttachment(ctx context.Context, account *models.MailAccount, messageID, attachmentID string) (*File, error) {
	detail, err := p.svc.FetchMessageDetail(ctx, account.Email, account.Password, messageID)
	if err != nil {
		return nil, err
	}
	for _, a := range detail.Attachments {
		if a.ID != attachmentID {
			continue
		}
		path := a.DownloadURL
		if path == "" {
			path = "/messages/" + url.PathEscape(messageID) + "/attachment/" + url.PathEscape(attachmentID)
		}
		data, err := p.svc.Download(ctx, account.Email, account.Password, path)
		if err != nil {
			return nil, err
		}
		return &File{Filename: a.Filename, ContentType: a.ContentType, Data: data}, nil
	}
	return nil, ErrMessageNotFound
}

func (p *MailTM) GetSource(ctx context.Context, account *models.MailAccount, messageID string) (*File, error) {
	data, err := p.svc.Download(ctx, account.Email, account.Password, "/messages/"+url.PathEscape(messageID)+"/download")
	if err != nil {
		return nil, err
	}
	return &File{Filename: messageID + ".eml", ContentType: "message/rfc822", Data: data}, nil
}

func (p *MailTM) MarkSeen(ctx context.Context, account *models.MailAccount, messageID string) error {
	return p.svc.MarkMessageSeen(ctx, account.Email, account.Password, messageID)
}

func (p *MailTM) Delete(ctx context.Context, account *models.MailAccount, messageID string) error {
	return p.svc.DeleteMessage(ctx, account.Email, account.Password, messageID)
}

// isAddressTaken reports Mail.tm's 422 "This value is already used." on the address field.
func isAddressTaken(err error) bool {
	var apiErr *mailtm.APIError
	return errors.As(err, &apiErr) &&
		apiErr.StatusCode == http.StatusUnprocessableEntity &&
		strings.Contains(strings.ToLower(apiErr.Message), "already used")
}
