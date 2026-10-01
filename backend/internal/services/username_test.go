package services

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"testing"

	"qa-mail-manager/internal/providers"
)

var localPartPattern = regexp.MustCompile(`^[a-z]+[._]?[a-z]+[0-9]{0,4}$`)

func TestGenerateLocalPartLooksHuman(t *testing.T) {
	for i := 0; i < 500; i++ {
		got, err := newUsernameGenerator(nil, nil).generate()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !localPartPattern.MatchString(got) {
			t.Fatalf("%q does not look like name[sep]surname[digits]", got)
		}
		for _, banned := range []string{"test", "qa", "temp", "dummy", "+"} {
			if strings.Contains(got, banned) {
				t.Fatalf("%q contains banned substring %q", got, banned)
			}
		}
	}
}

func TestNamePoolsAvoidBannedSubstrings(t *testing.T) {
	for _, pool := range [][]string{defaultFirstNames, defaultLastNames} {
		for _, name := range pool {
			for _, banned := range []string{"test", "qa", "temp", "dummy"} {
				if strings.Contains(name, banned) {
					t.Fatalf("pool entry %q contains %q", name, banned)
				}
			}
		}
	}
}

func sequence(parts ...string) func() (string, error) {
	i := 0
	return func() (string, error) {
		p := parts[i%len(parts)]
		i++
		return p, nil
	}
}

func TestRegisterUniqueAddressRetriesWhenTaken(t *testing.T) {
	var tried []string
	email, id, err := registerUniqueAddress("example.com", 5, sequence("ayu.putra", "ayu.putra7"), func(email string) (string, error) {
		tried = append(tried, email)
		if email == "ayu.putra@example.com" {
			return "", fmt.Errorf("wrapped: %w", providers.ErrAddressTaken)
		}
		return "remote-1", nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if email != "ayu.putra7@example.com" || id != "remote-1" {
		t.Fatalf("got %q/%q", email, id)
	}
	if len(tried) != 2 {
		t.Fatalf("expected 2 attempts, got %v", tried)
	}
}

func TestRegisterUniqueAddressGivesUp(t *testing.T) {
	calls := 0
	_, _, err := registerUniqueAddress("example.com", 5, sequence("dwi.lubis"), func(string) (string, error) {
		calls++
		return "", providers.ErrAddressTaken
	})
	if err == nil {
		t.Fatal("expected error after exhausting attempts")
	}
	if calls != 5 {
		t.Fatalf("expected 5 attempts, got %d", calls)
	}
}

func TestRegisterUniqueAddressStopsOnOtherErrors(t *testing.T) {
	boom := errors.New("mail.tm down")
	calls := 0
	_, _, err := registerUniqueAddress("example.com", 5, sequence("eka.halim"), func(string) (string, error) {
		calls++
		return "", boom
	})
	if !errors.Is(err, boom) || calls != 1 {
		t.Fatalf("expected immediate %v, got %v after %d calls", boom, err, calls)
	}
}

func TestUsernameGeneratorUsesConfiguredPools(t *testing.T) {
	g := newUsernameGenerator([]string{"budi"}, []string{"santoso"})
	for i := 0; i < 50; i++ {
		got, err := g.generate()
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(got, "budi") || !strings.Contains(got, "santoso") {
			t.Fatalf("%q does not use the configured pools", got)
		}
	}
}
