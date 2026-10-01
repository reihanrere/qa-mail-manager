package providers

import (
	"context"
	"errors"
	"fmt"
	stdhtml "html"
	"math/rand/v2"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"qa-mail-manager/internal/ingest"
	"qa-mail-manager/internal/models"
)

// introLength matches the length of Mail.tm's message intro.
const introLength = 120

// listColumns are loaded for inbox lists and message details; raw stays in the database.
var listColumns = []string{"id", "account_id", "message_id", "from_name", "from_address", "to_address",
	"subject", "text", "html", "seen", "attachments", "created_at"}

// Compile-time checks that the adapters implement the interfaces.
var (
	_ MailProvider = (*Local)(nil)
	_ Searcher     = (*Local)(nil)
	_ MailProvider = (*MailTM)(nil)
)

// Local serves mailboxes on our own catch-all domains. Addresses are minted without
// any outbound call; inbound mail is stored in the messages table by the ingest endpoint.
type Local struct {
	db      *gorm.DB
	domains []string
}

// NewLocal builds the local provider for one or more catch-all domains. With none,
// existing inboxes stay readable but no new local accounts can be generated.
func NewLocal(db *gorm.DB, domains ...string) *Local {
	p := &Local{db: db}
	for _, d := range domains {
		if d = strings.ToLower(strings.TrimSpace(d)); d != "" && !slices.Contains(p.domains, d) {
			p.domains = append(p.domains, d)
		}
	}
	return p
}

func (p *Local) Name() string { return NameLocal }

func (p *Local) Label() string { return "Own domain (catch-all)" }

func (p *Local) PickDomain(context.Context) (string, error) {
	if len(p.domains) == 0 {
		return "", errors.New("local provider: CATCHALL_DOMAIN is not configured")
	}
	// Spread accounts over the domains so one blocked domain affects fewer tests
	return p.domains[rand.IntN(len(p.domains))], nil
}

// Domains lists every catch-all domain new addresses can use.
func (p *Local) Domains(context.Context) ([]string, error) {
	if len(p.domains) == 0 {
		return nil, errors.New("local provider: CATCHALL_DOMAIN is not configured")
	}
	return slices.Clone(p.domains), nil
}

// CreateAddress needs no registration: the catch-all accepts every address, and the
// caller already checked mail_accounts for duplicates. The id only has to be unique.
func (p *Local) CreateAddress(context.Context, string, string) (string, error) {
	return uuid.NewString(), nil
}

func (p *Local) ListMessages(ctx context.Context, account *models.MailAccount, page int) (*MessagePage, error) {
	if page < 1 {
		page = 1
	}
	query := p.db.WithContext(ctx).Model(&models.Message{}).Where("account_id = ?", account.ID)

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, fmt.Errorf("failed to count messages: %w", err)
	}

	var rows []models.Message
	err := query.Select(listColumns).Order("created_at DESC, id").
		Offset((page - 1) * MessagesPerPage).
		Limit(MessagesPerPage).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list messages: %w", err)
	}

	result := &MessagePage{Members: make([]MessageSummary, 0, len(rows)), TotalItems: int(total)}
	for _, m := range rows {
		result.Members = append(result.Members, toSummary(m))
	}
	return result, nil
}

func (p *Local) GetMessage(ctx context.Context, account *models.MailAccount, messageID string) (*MessageDetail, error) {
	id, err := uuid.Parse(messageID)
	if err != nil {
		return nil, ErrMessageNotFound
	}
	m, err := p.load(ctx, account, id, listColumns)
	if err != nil {
		return nil, err
	}
	return toDetail(*m), nil
}

// Search matches subject, body and sender with ILIKE, newest first.
func (p *Local) Search(ctx context.Context, account *models.MailAccount, term string, limit int) ([]MessageSummary, bool, error) {
	pattern := "%" + likeEscaper.Replace(term) + "%"
	var rows []models.Message
	err := p.db.WithContext(ctx).Select(listColumns).
		Where("account_id = ?", account.ID).
		Where("subject ILIKE ? OR text ILIKE ? OR from_name ILIKE ? OR from_address ILIKE ?", pattern, pattern, pattern, pattern).
		Order("created_at DESC, id").
		Limit(limit + 1). // one extra row reveals whether results were cut off
		Find(&rows).Error
	if err != nil {
		return nil, false, fmt.Errorf("failed to search messages: %w", err)
	}
	truncated := len(rows) > limit
	if truncated {
		rows = rows[:limit]
	}
	result := make([]MessageSummary, 0, len(rows))
	for _, m := range rows {
		result = append(result, toSummary(m))
	}
	return result, truncated, nil
}

// likeEscaper makes %, _ and \ match literally in an ILIKE pattern.
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

func (p *Local) GetAttachment(ctx context.Context, account *models.MailAccount, messageID, attachmentID string) (*File, error) {
	id, err := uuid.Parse(messageID)
	if err != nil {
		return nil, ErrMessageNotFound
	}
	index, err := strconv.Atoi(attachmentID)
	if err != nil || index < 1 {
		return nil, ErrMessageNotFound
	}
	m, err := p.load(ctx, account, id, []string{"raw"})
	if err != nil {
		return nil, err
	}
	meta, data, err := ingest.ExtractAttachment(m.Raw, index)
	if err != nil {
		if errors.Is(err, ingest.ErrAttachmentNotFound) {
			return nil, ErrMessageNotFound
		}
		return nil, err
	}
	return &File{Filename: meta.Filename, ContentType: meta.ContentType, Data: data}, nil
}

func (p *Local) GetSource(ctx context.Context, account *models.MailAccount, messageID string) (*File, error) {
	id, err := uuid.Parse(messageID)
	if err != nil {
		return nil, ErrMessageNotFound
	}
	m, err := p.load(ctx, account, id, []string{"raw"})
	if err != nil {
		return nil, err
	}
	if len(m.Raw) == 0 {
		// Messages stored before raw sources were kept
		return nil, ErrMessageNotFound
	}
	return &File{Filename: messageID + ".eml", ContentType: "message/rfc822", Data: m.Raw}, nil
}

// load reads the given columns of one of the account's messages.
func (p *Local) load(ctx context.Context, account *models.MailAccount, id uuid.UUID, columns []string) (*models.Message, error) {
	var m models.Message
	err := p.db.WithContext(ctx).Select(columns).First(&m, "id = ? AND account_id = ?", id, account.ID).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrMessageNotFound
		}
		return nil, fmt.Errorf("failed to load message: %w", err)
	}
	return &m, nil
}

func (p *Local) MarkSeen(ctx context.Context, account *models.MailAccount, messageID string) error {
	return p.affectOne(ctx, account, messageID, func(q *gorm.DB) *gorm.DB {
		return q.Model(&models.Message{}).Update("seen", true)
	})
}

func (p *Local) Delete(ctx context.Context, account *models.MailAccount, messageID string) error {
	return p.affectOne(ctx, account, messageID, func(q *gorm.DB) *gorm.DB {
		return q.Delete(&models.Message{})
	})
}

// affectOne runs op on the account's message and reports ErrMessageNotFound when nothing matched.
func (p *Local) affectOne(ctx context.Context, account *models.MailAccount, messageID string, op func(*gorm.DB) *gorm.DB) error {
	id, err := uuid.Parse(messageID)
	if err != nil {
		return ErrMessageNotFound
	}
	result := op(p.db.WithContext(ctx).Where("id = ? AND account_id = ?", id, account.ID))
	if result.Error != nil {
		return fmt.Errorf("failed to update message: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMessageNotFound
	}
	return nil
}

func toSummary(m models.Message) MessageSummary {
	return MessageSummary{
		ID:        m.ID.String(),
		Subject:   m.Subject,
		Intro:     intro(previewText(m)),
		Seen:      m.Seen,
		CreatedAt: m.CreatedAt.UTC().Format(time.RFC3339),
		From:      Address{Address: m.FromAddress, Name: m.FromName},
	}
}

func toDetail(m models.Message) *MessageDetail {
	detail := &MessageDetail{
		ID:          m.ID.String(),
		Subject:     m.Subject,
		Seen:        m.Seen,
		From:        Address{Address: m.FromAddress, Name: m.FromName},
		To:          []Address{{Address: m.ToAddress}},
		Text:        m.Text,
		HTML:        []string{},
		Attachments: make([]Attachment, 0, len(m.Attachments)),
		CreatedAt:   m.CreatedAt.UTC().Format(time.RFC3339),
	}
	for _, a := range m.Attachments {
		detail.Attachments = append(detail.Attachments, Attachment{
			ID:          strconv.Itoa(a.Index),
			Filename:    a.Filename,
			ContentType: a.ContentType,
			Size:        a.Size,
			ContentID:   a.ContentID,
		})
	}
	if m.HTML != "" {
		detail.HTML = []string{m.HTML}
	}
	return detail
}

// previewText is the text body, or the HTML body without tags for HTML-only mail.
func previewText(m models.Message) string {
	if strings.TrimSpace(m.Text) != "" {
		return m.Text
	}
	return htmlToText(m.HTML)
}

var (
	htmlHiddenBlocks = regexp.MustCompile(`(?is)<(style|script|head)[^>]*>.*?</(style|script|head)>`)
	htmlTags         = regexp.MustCompile(`(?s)<[^>]*>`)
)

// htmlToText is a rough tag stripper, good enough for a one-line preview.
func htmlToText(html string) string {
	text := htmlHiddenBlocks.ReplaceAllString(html, " ")
	text = htmlTags.ReplaceAllString(text, " ")
	return stdhtml.UnescapeString(text)
}

// intro collapses whitespace and truncates the text body to introLength characters.
func intro(text string) string {
	collapsed := strings.Join(strings.Fields(text), " ")
	if utf8.RuneCountInString(collapsed) <= introLength {
		return collapsed
	}
	return string([]rune(collapsed)[:introLength])
}
