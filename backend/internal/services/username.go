package services

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strconv"

	"qa-mail-manager/internal/providers"
)

// Built-in name pools for generated local parts, used unless USERNAME_FIRST_NAMES /
// USERNAME_LAST_NAMES override them. Addresses must look like a real person's so
// signup forms do not flag them; QA metadata belongs in Tag/Note instead.
var (
	defaultFirstNames = []string{
		"adit", "agus", "andi", "anisa", "arief", "ayu", "bagas", "bayu", "budi", "citra",
		"dewi", "dian", "dimas", "dwi", "eka", "fajar", "fitri", "gilang", "hendra", "indah",
		"intan", "joko", "kevin", "lestari", "maya", "nadia", "nanda", "novi", "putri", "rafi",
		"rani", "reza", "rinda", "rizky", "sari", "sinta", "taufik", "tika", "wahyu", "yoga",
	}
	defaultLastNames = []string{
		"anggraini", "basri", "firmansyah", "gunawan", "halim", "hidayat", "irawan", "kurniawan", "lubis", "maharani",
		"nugroho", "permana", "pratama", "purnomo", "putra", "rahayu", "ramadhan", "saputra", "setiawan", "siregar",
		"sitompul", "subagyo", "susanto", "syahputra", "tanjung", "utami", "wahyudi", "wibowo", "wijaya", "yulianti",
	}
	separators = []string{".", "", "_"}
)

// usernameGenerator builds human-looking local parts from first/last name pools.
type usernameGenerator struct {
	firstNames []string
	lastNames  []string
}

// newUsernameGenerator falls back to the built-in pools for any empty list.
func newUsernameGenerator(firstNames, lastNames []string) *usernameGenerator {
	if len(firstNames) == 0 {
		firstNames = defaultFirstNames
	}
	if len(lastNames) == 0 {
		lastNames = defaultLastNames
	}
	return &usernameGenerator{firstNames: firstNames, lastNames: lastNames}
}

// randomInt returns a cryptographically secure integer in [0, n).
func randomInt(n int) (int, error) {
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0, err
	}
	return int(v.Int64()), nil
}

func pick(pool []string) (string, error) {
	i, err := randomInt(len(pool))
	if err != nil {
		return "", err
	}
	return pool[i], nil
}

// generate builds a local part such as "rinda.saputra91", "bagaspratama" or "dwi_anggraini1998".
func (g *usernameGenerator) generate() (string, error) {
	first, err := pick(g.firstNames)
	if err != nil {
		return "", err
	}
	last, err := pick(g.lastNames)
	if err != nil {
		return "", err
	}
	sep, err := pick(separators)
	if err != nil {
		return "", err
	}

	// Suffix: none, a short number, or a birth-year-like number.
	kind, err := randomInt(3)
	if err != nil {
		return "", err
	}
	suffix := ""
	switch kind {
	case 1:
		n, err := randomInt(99)
		if err != nil {
			return "", err
		}
		suffix = strconv.Itoa(n + 1)
	case 2:
		n, err := randomInt(20)
		if err != nil {
			return "", err
		}
		suffix = strconv.Itoa(1985 + n)
	}

	return first + sep + last + suffix, nil
}

// registerUniqueAddress generates local parts until register accepts one, trying at most
// maxAttempts addresses. register returns providers.ErrAddressTaken (possibly wrapped)
// to request another candidate; any other error aborts immediately.
func registerUniqueAddress(domain string, maxAttempts int, newLocalPart func() (string, error), register func(email string) (string, error)) (email, accountID string, err error) {
	for attempt := 0; attempt < maxAttempts; attempt++ {
		localPart, err := newLocalPart()
		if err != nil {
			return "", "", fmt.Errorf("failed to generate username: %w", err)
		}
		email = localPart + "@" + domain

		accountID, err = register(email)
		if errors.Is(err, providers.ErrAddressTaken) {
			continue
		}
		if err != nil {
			return "", "", err
		}
		return email, accountID, nil
	}
	return "", "", fmt.Errorf("no unused address found after %d attempts", maxAttempts)
}
