// Package ingest parses raw RFC 5322 emails delivered by the Cloudflare Email Worker.
package ingest

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime"
	"strconv"
	"strings"

	"github.com/emersion/go-message"
	// Registers decoders for non-UTF-8 charsets (ISO-8859-*, Windows-125x, ...)
	_ "github.com/emersion/go-message/charset"
	"github.com/emersion/go-message/mail"
)

// ErrMalformed means the payload is not a parseable email.
var ErrMalformed = errors.New("malformed email")

// ErrAttachmentNotFound means the raw email has no attachment with the requested index.
var ErrAttachmentNotFound = errors.New("attachment not found")

// Attachment describes one non-body part of an email. Index is its 1-based position
// among the attachments and serves as its id.
type Attachment struct {
	Index       int    `json:"index"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int    `json:"size"`
	// ContentID is the Content-ID without angle brackets; HTML bodies reference inline
	// images as "cid:<ContentID>".
	ContentID string `json:"contentId,omitempty"`
}

// Email is the subset of a message the local provider stores.
type Email struct {
	MessageID   string
	FromName    string
	FromAddress string
	// Recipients are the lower-cased addresses from To, Cc, Delivered-To and X-Original-To.
	Recipients  []string
	Subject     string
	Text        string
	HTML        string
	Attachments []Attachment
}

// recipientHeaders are checked in order when the envelope recipient is unknown.
var recipientHeaders = []string{"Delivered-To", "X-Original-To", "To", "Cc"}

// Parse reads a raw email: headers, the first text/plain and text/html bodies, and the
// metadata of every other part (attachments and inline images).
func Parse(raw []byte) (*Email, error) {
	mr, err := mail.CreateReader(bytes.NewReader(raw))
	if err != nil && !message.IsUnknownCharset(err) {
		return nil, fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	defer mr.Close()

	email := &Email{}
	header := mr.Header
	email.Subject, _ = header.Subject()
	email.MessageID, _ = header.MessageID()
	if from, err := header.AddressList("From"); err == nil && len(from) > 0 {
		email.FromName = from[0].Name
		email.FromAddress = strings.ToLower(from[0].Address)
	}
	email.Recipients = recipients(header)

	walkParts(mr, func(p part) bool {
		switch {
		case !p.attachment && p.contentType == "text/plain" && email.Text == "":
			email.Text = strings.TrimSpace(string(p.body()))
		case !p.attachment && p.contentType == "text/html" && email.HTML == "":
			email.HTML = strings.TrimSpace(string(p.body()))
		case p.isAttachment():
			body := p.body()
			email.Attachments = append(email.Attachments, Attachment{
				Index:       len(email.Attachments) + 1,
				Filename:    p.filename(len(email.Attachments) + 1),
				ContentType: p.contentType,
				Size:        len(body),
				ContentID:   p.contentID,
			})
		}
		return true
	})

	if email.Text == "" && email.HTML == "" && email.Subject == "" && email.FromAddress == "" {
		return nil, fmt.Errorf("%w: no headers or body found", ErrMalformed)
	}
	return email, nil
}

// ExtractAttachment returns the metadata and decoded content of the attachment with
// the given 1-based index, using the same ordering as Parse.
func ExtractAttachment(raw []byte, index int) (*Attachment, []byte, error) {
	mr, err := mail.CreateReader(bytes.NewReader(raw))
	if err != nil && !message.IsUnknownCharset(err) {
		return nil, nil, fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	defer mr.Close()

	var found *Attachment
	var content []byte
	count := 0
	walkParts(mr, func(p part) bool {
		if !p.isAttachment() {
			// Body parts must still be consumed for the reader to advance
			return true
		}
		count++
		if count != index {
			return true
		}
		content = p.body()
		found = &Attachment{Index: index, Filename: p.filename(index), ContentType: p.contentType, Size: len(content)}
		return false
	})
	if found == nil {
		return nil, nil, ErrAttachmentNotFound
	}
	return found, content, nil
}

// part is one leaf of the MIME tree as seen by walkParts.
type part struct {
	contentType string
	attachment  bool // Content-Disposition: attachment
	name        string
	contentID   string
	reader      io.Reader
}

// isAttachment is true for explicit attachments and for inline parts that are not the
// text/plain or text/html body (e.g. inline images referenced by cid:).
func (p part) isAttachment() bool {
	return p.attachment || (p.contentType != "text/plain" && p.contentType != "text/html")
}

func (p part) body() []byte {
	body, _ := io.ReadAll(p.reader)
	return body
}

// filename falls back to "attachment-N.ext" when the part has no name.
func (p part) filename(index int) string {
	if p.name != "" {
		return p.name
	}
	ext := ""
	if exts, err := mime.ExtensionsByType(p.contentType); err == nil && len(exts) > 0 {
		ext = exts[0]
	}
	return "attachment-" + strconv.Itoa(index) + ext
}

// walkParts visits every leaf part in order until visit returns false.
// Parts with an unknown charset are still visited; other read errors stop the walk
// so whatever was parsed so far is kept.
func walkParts(mr *mail.Reader, visit func(part) bool) {
	for {
		p, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			return
		}
		if err != nil && !message.IsUnknownCharset(err) {
			return
		}
		if p == nil {
			continue
		}

		var current part
		switch h := p.Header.(type) {
		case *mail.InlineHeader:
			current.contentType, _, _ = h.ContentType()
			if _, params, err := h.ContentDisposition(); err == nil {
				current.name = params["filename"]
			}
			if current.name == "" {
				_, params, _ := h.ContentType()
				current.name = params["name"]
			}
		case *mail.AttachmentHeader:
			current.attachment = true
			current.contentType, _, _ = h.ContentType()
			current.name, _ = h.Filename()
		default:
			continue
		}
		current.contentID = strings.Trim(strings.TrimSpace(p.Header.Get("Content-Id")), "<>")
		if current.contentType == "" {
			current.contentType = "application/octet-stream"
		}
		current.reader = p.Body
		if !visit(current) {
			return
		}
	}
}

func recipients(header mail.Header) []string {
	seen := map[string]bool{}
	var list []string
	add := func(address string) {
		address = strings.ToLower(strings.TrimSpace(address))
		if address != "" && !seen[address] {
			seen[address] = true
			list = append(list, address)
		}
	}
	for _, key := range recipientHeaders {
		if addresses, err := header.AddressList(key); err == nil {
			for _, a := range addresses {
				add(a.Address)
			}
			continue
		}
		// Delivered-To is sometimes a bare address that AddressList rejects
		add(strings.Trim(header.Get(key), "<>"))
	}
	return list
}
