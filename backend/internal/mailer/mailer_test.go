package mailer

import (
	"bufio"
	"context"
	"errors"
	"net"
	"strings"
	"testing"
	"time"
)

// fakeSMTP accepts one message without TLS or auth and returns what it received.
func fakeSMTP(t *testing.T) (host string, port int, received chan string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	received = make(chan string, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		r := bufio.NewReader(conn)
		reply := func(s string) { conn.Write([]byte(s + "\r\n")) }
		reply("220 fake ESMTP")
		var transcript strings.Builder
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			cmd := strings.ToUpper(strings.TrimSpace(line))
			transcript.WriteString(line)
			switch {
			case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
				reply("250 fake")
			case strings.HasPrefix(cmd, "MAIL"), strings.HasPrefix(cmd, "RCPT"):
				reply("250 OK")
			case cmd == "DATA":
				reply("354 go ahead")
				for {
					l, err := r.ReadString('\n')
					if err != nil {
						return
					}
					if l == ".\r\n" {
						break
					}
					transcript.WriteString(l)
				}
				reply("250 queued")
			case cmd == "QUIT":
				reply("221 bye")
				received <- transcript.String()
				return
			default:
				reply("250 OK")
			}
		}
	}()
	addr := ln.Addr().(*net.TCPAddr)
	return addr.IP.String(), addr.Port, received
}

func TestSendDeliversThreadedMessage(t *testing.T) {
	host, port, received := fakeSMTP(t)
	m := New(Config{Host: host, Port: port, Security: SecurityNone, Timeout: 5 * time.Second})

	id, err := m.Send(context.Background(), Message{
		From:      "rinda.saputra91@re-testing.me",
		To:        []string{"Support <support@shop.example>"},
		Subject:   "Re: Kode verifikasi ✅",
		Text:      "Halo,\nterima kasih.",
		InReplyTo: "abc123@shop.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(id, "@re-testing.me") {
		t.Fatalf("message id %q should use the sender's domain", id)
	}

	got := <-received
	for _, want := range []string{
		"MAIL FROM:<rinda.saputra91@re-testing.me>",
		"RCPT TO:<support@shop.example>",
		"In-Reply-To: <abc123@shop.example>",
		"Subject: =?utf-8?q?Re:_Kode_verifikasi_=E2=9C=85?=",
		"Halo,\r\nterima kasih.",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in:\n%s", want, got)
		}
	}
}

func TestDisabledAndInvalidInput(t *testing.T) {
	if _, err := New(Config{}).Send(context.Background(), Message{}); !errors.Is(err, ErrDisabled) {
		t.Fatalf("expected ErrDisabled, got %v", err)
	}
	m := New(Config{Host: "127.0.0.1", Port: 1})
	if _, err := m.Send(context.Background(), Message{From: "a@b.test", To: []string{"not an address"}}); err == nil {
		t.Fatal("expected an error for an invalid recipient")
	}
}
