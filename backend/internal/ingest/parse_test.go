package ingest

import (
	"errors"
	"strings"
	"testing"
)

func crlf(s string) []byte { return []byte(strings.ReplaceAll(s, "\n", "\r\n")) }

func TestParseMultipartAlternative(t *testing.T) {
	raw := crlf(`From: "Shop Bot" <No-Reply@Shop.example>
To: Rinda <Rinda.Saputra91@re-testing.me>
Cc: other@example.com
Subject: =?UTF-8?B?S29kZSBPVFAg8J+UkQ==?=
Message-ID: <abc123@shop.example>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="outer"

--outer
Content-Type: multipart/alternative; boundary="inner"

--inner
Content-Type: text/plain; charset=utf-8

Use 482913 to sign in.
--inner
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<p>Use <b>482913</b> to sign in.</p>
--inner--
--outer
Content-Type: application/pdf
Content-Disposition: attachment; filename="invoice.pdf"

JVBERi0=
--outer--
`)
	email, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if email.FromName != "Shop Bot" || email.FromAddress != "no-reply@shop.example" {
		t.Fatalf("unexpected from %q <%s>", email.FromName, email.FromAddress)
	}
	if email.Subject != "Kode OTP 🔑" {
		t.Fatalf("subject not decoded: %q", email.Subject)
	}
	if email.MessageID != "abc123@shop.example" {
		t.Fatalf("unexpected message id %q", email.MessageID)
	}
	if email.Text != "Use 482913 to sign in." || email.HTML != "<p>Use <b>482913</b> to sign in.</p>" {
		t.Fatalf("unexpected bodies %q / %q", email.Text, email.HTML)
	}
	if strings.Join(email.Recipients, ",") != "rinda.saputra91@re-testing.me,other@example.com" {
		t.Fatalf("unexpected recipients %v", email.Recipients)
	}
}

func TestParseSinglePartLatin1AndBareDeliveredTo(t *testing.T) {
	raw := append(crlf(`Delivered-To: bagas.pratama@re-testing.me
From: shop@example.com
Subject: Caf=?ISO-8859-1?Q?=E9?=
Content-Type: text/plain; charset=iso-8859-1

Caf`), 0xE9) // "é" in Latin-1
	email, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if email.Text != "Café" {
		t.Fatalf("charset not decoded: %q", email.Text)
	}
	if len(email.Recipients) != 1 || email.Recipients[0] != "bagas.pratama@re-testing.me" {
		t.Fatalf("unexpected recipients %v", email.Recipients)
	}
}

func TestParseRejectsGarbage(t *testing.T) {
	if _, err := Parse([]byte("\x00\x01 not an email")); !errors.Is(err, ErrMalformed) {
		t.Fatalf("expected ErrMalformed, got %v", err)
	}
}

const withAttachments = `From: shop@example.com
To: ayu.putra@re-testing.me
Subject: Invoice
Content-Type: multipart/mixed; boundary="mix"

--mix
Content-Type: multipart/related; boundary="rel"

--rel
Content-Type: text/html; charset=utf-8

<p>Logo: <img src="cid:logo"></p>
--rel
Content-Type: image/png
Content-ID: <logo>
Content-Disposition: inline
Content-Transfer-Encoding: base64

iVBORw0KGgo=
--rel--
--mix
Content-Type: application/pdf; name="invoice.pdf"
Content-Disposition: attachment; filename="invoice.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQK
--mix
Content-Type: text/plain; charset=utf-8
Content-Disposition: attachment; filename="notes.txt"

hello attachment
--mix--
`

func TestParseAttachments(t *testing.T) {
	email, err := Parse(crlf(withAttachments))
	if err != nil {
		t.Fatal(err)
	}
	if email.HTML == "" || email.Text != "" {
		t.Fatalf("expected only the HTML body, got text=%q html=%q", email.Text, email.HTML)
	}
	want := []Attachment{
		{Index: 1, Filename: "attachment-1.png", ContentType: "image/png", Size: 8, ContentID: "logo"},
		{Index: 2, Filename: "invoice.pdf", ContentType: "application/pdf", Size: 9},
		{Index: 3, Filename: "notes.txt", ContentType: "text/plain", Size: 16},
	}
	if len(email.Attachments) != len(want) {
		t.Fatalf("got %+v", email.Attachments)
	}
	for i := range want {
		if email.Attachments[i] != want[i] {
			t.Errorf("attachment %d: got %+v, want %+v", i, email.Attachments[i], want[i])
		}
	}
}

func TestExtractAttachment(t *testing.T) {
	raw := crlf(withAttachments)
	meta, data, err := ExtractAttachment(raw, 2)
	if err != nil {
		t.Fatal(err)
	}
	if meta.Filename != "invoice.pdf" || string(data) != "%PDF-1.4\n" {
		t.Fatalf("got %+v %q", meta, data)
	}
	_, data, err = ExtractAttachment(raw, 3)
	if err != nil || string(data) != "hello attachment" {
		t.Fatalf("got %q, %v", data, err)
	}
	if _, _, err := ExtractAttachment(raw, 4); !errors.Is(err, ErrAttachmentNotFound) {
		t.Fatalf("expected ErrAttachmentNotFound, got %v", err)
	}
}
