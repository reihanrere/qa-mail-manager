package config

import (
	"strings"
	"testing"
	"time"
)

func validConfig() Config {
	return Config{
		AppPort:                 "8080",
		InboxSearchMaxPages:     10,
		IngestPort:              "8081",
		IngestMaxBytes:          1 << 20,
		MessageRetention:        time.Hour,
		MessagePruneInterval:    time.Minute,
		UsernameMaxAttempts:     5,
		TagMaxLength:            50,
		NoteMaxLength:           500,
		EventsHeartbeatInterval: 20 * time.Second,
		LegacyUsernamePattern:   "^qa_test_",
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*Config)
		wantErr string
	}{
		{name: "valid", mutate: func(*Config) {}},
		{name: "zero limit", mutate: func(c *Config) { c.TagMaxLength = 0 }, wantErr: "TAG_MAX_LENGTH"},
		{name: "short secret", mutate: func(c *Config) { c.IngestSecret = "short" }, wantErr: "INGEST_SECRET"},
		{name: "same ports", mutate: func(c *Config) {
			c.IngestSecret = strings.Repeat("s", 32)
			c.IngestPort = "8080"
		}, wantErr: "INGEST_PORT"},
		{name: "zero prune interval", mutate: func(c *Config) { c.MessagePruneInterval = 0 }, wantErr: "MESSAGE_PRUNE_INTERVAL"},
		{name: "bad legacy pattern", mutate: func(c *Config) { c.LegacyUsernamePattern = "(" }, wantErr: "LEGACY_USERNAME_PATTERN"},
		{name: "zero heartbeat", mutate: func(c *Config) { c.EventsHeartbeatInterval = 0 }, wantErr: "EVENTS_HEARTBEAT_INTERVAL"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := validConfig()
			tt.mutate(&c)
			err := c.Validate()
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected error mentioning %s, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestSplitList(t *testing.T) {
	got := SplitList(" Budi, ,SARI ,dewi,")
	if strings.Join(got, "|") != "budi|sari|dewi" {
		t.Fatalf("got %v", got)
	}
	if SplitList("") != nil {
		t.Fatal("expected nil for empty input")
	}
}
