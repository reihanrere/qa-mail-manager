package services

import (
	"errors"
	"fmt"
	"math/rand/v2"
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

// generate builds a local part such as "rinda.saputra91", "bagaspratama" or "dwi_anggraini1998".
// Names are not secrets, so math/rand is enough; uniqueness is checked by the caller.
func (g *usernameGenerator) generate() string {
	first := g.firstNames[rand.IntN(len(g.firstNames))]
	last := g.lastNames[rand.IntN(len(g.lastNames))]
	sep := separators[rand.IntN(len(separators))]

	// Suffix: none, a short number, or a birth-year-like number
	suffix := ""
	switch rand.IntN(3) {
	case 1:
		suffix = strconv.Itoa(1 + rand.IntN(99))
	case 2:
		suffix = strconv.Itoa(1985 + rand.IntN(20))
	}
	return first + sep + last + suffix
}

// registerUniqueAddress generates local parts until register accepts one, trying at most
// maxAttempts addresses. register returns providers.ErrAddressTaken (possibly wrapped)
// to request another candidate; any other error aborts immediately.
func registerUniqueAddress(domain string, maxAttempts int, newLocalPart func() string, register func(email string) (string, error)) (email, accountID string, err error) {
	for attempt := 0; attempt < maxAttempts; attempt++ {
		email = newLocalPart() + "@" + domain

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
