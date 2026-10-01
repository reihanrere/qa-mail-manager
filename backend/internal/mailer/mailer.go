// Package mailer sends plain-text email through a configured SMTP server.
package mailer

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Security modes for the SMTP connection.
const (
	SecurityStartTLS = "starttls" // plain connection upgraded with STARTTLS (port 587)
	SecurityTLS      = "tls"      // implicit TLS (port 465)
	SecurityNone     = "none"     // unencrypted; only for local test servers
)

// ErrDisabled means no SMTP server is configured.
var ErrDisabled = errors.New("sending is disabled: SMTP_HOST is not configured")

// Config describes the SMTP server.
type Config struct {
	Host     string
	Port     int
	Username string
	Password string
	Security string
	Timeout  time.Duration
}

// Message is one outgoing plain-text email.
type Message struct {
	From    string
	To      []string
	Subject string
	Text    string
	// InReplyTo is the Message-ID (without brackets) being answered, for threading.
	InReplyTo string
}

// Mailer sends messages; the zero value (no host) is disabled.
type Mailer struct {
	cfg Config
}

// New builds a Mailer.
func New(cfg Config) *Mailer {
	if cfg.Timeout <= 0 {
		cfg.Timeout = 30 * time.Second
	}
	return &Mailer{cfg: cfg}
}

// Enabled reports whether an SMTP server is configured.
func (m *Mailer) Enabled() bool { return m != nil && m.cfg.Host != "" }

// Send delivers msg and returns the Message-ID it was sent with.
func (m *Mailer) Send(ctx context.Context, msg Message) (string, error) {
	if !m.Enabled() {
		return "", ErrDisabled
	}
	from, err := mail.ParseAddress(msg.From)
	if err != nil {
		return "", fmt.Errorf("invalid from address: %w", err)
	}
	var recipients []string
	for _, to := range msg.To {
		addr, err := mail.ParseAddress(to)
		if err != nil {
			return "", fmt.Errorf("invalid recipient %q: %w", to, err)
		}
		recipients = append(recipients, addr.Address)
	}
	if len(recipients) == 0 {
		return "", errors.New("no recipients")
	}

	messageID, body, err := Build(msg, from.Address, recipients, time.Now())
	if err != nil {
		return "", err
	}
	if err := m.deliver(ctx, from.Address, recipients, body); err != nil {
		return "", err
	}
	return messageID, nil
}

// Build renders the RFC 5322 message and returns its Message-ID.
func Build(msg Message, from string, to []string, now time.Time) (string, []byte, error) {
	_, domain, _ := strings.Cut(from, "@")
	messageID := uuid.NewString() + "@" + domain

	var b bytes.Buffer
	header := func(key, value string) { fmt.Fprintf(&b, "%s: %s\r\n", key, value) }
	header("From", from)
	header("To", strings.Join(to, ", "))
	header("Subject", mime.QEncoding.Encode("utf-8", msg.Subject))
	header("Date", now.Format(time.RFC1123Z))
	header("Message-ID", "<"+messageID+">")
	if msg.InReplyTo != "" {
		header("In-Reply-To", "<"+msg.InReplyTo+">")
		header("References", "<"+msg.InReplyTo+">")
	}
	header("MIME-Version", "1.0")
	header("Content-Type", "text/plain; charset=utf-8")
	header("Content-Transfer-Encoding", "quoted-printable")
	b.WriteString("\r\n")

	qp := quotedprintable.NewWriter(&b)
	text := strings.ReplaceAll(strings.ReplaceAll(msg.Text, "\r\n", "\n"), "\n", "\r\n")
	if _, err := qp.Write([]byte(text)); err != nil {
		return "", nil, err
	}
	if err := qp.Close(); err != nil {
		return "", nil, err
	}
	return messageID, b.Bytes(), nil
}

func (m *Mailer) deliver(ctx context.Context, from string, to []string, body []byte) error {
	addr := net.JoinHostPort(m.cfg.Host, fmt.Sprint(m.cfg.Port))
	dialer := &net.Dialer{Timeout: m.cfg.Timeout}
	tlsConfig := &tls.Config{ServerName: m.cfg.Host, MinVersion: tls.VersionTLS12}

	var conn net.Conn
	var err error
	if m.cfg.Security == SecurityTLS {
		conn, err = (&tls.Dialer{NetDialer: dialer, Config: tlsConfig}).DialContext(ctx, "tcp", addr)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("smtp connect: %w", err)
	}
	_ = conn.SetDeadline(time.Now().Add(m.cfg.Timeout))

	client, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("smtp handshake: %w", err)
	}
	defer client.Close()

	if m.cfg.Security == SecurityStartTLS {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return errors.New("smtp server does not offer STARTTLS; set SMTP_SECURITY=tls or none")
		}
		if err := client.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}
	if m.cfg.Username != "" {
		if err := client.Auth(smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	for _, rcpt := range to {
		if err := client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("smtp RCPT TO %s: %w", rcpt, err)
		}
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}
	if _, err := w.Write(body); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp send: %w", err)
	}
	return client.Quit()
}
