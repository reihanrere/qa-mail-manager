#!/usr/bin/env bash
# Sends the sample emails in this folder to a generated account through the ingest
# endpoint, bypassing SMTP (same path the Cloudflare Email Worker uses).
#
#   tools/test-emails/send.sh rinda.saputra91@re-testing.me            # all samples
#   tools/test-emails/send.sh rinda.saputra91@re-testing.me 01 03      # selected ones
#
# Reads INGEST_SECRET from the project's .env. INGEST_URL defaults to the tunnel hostname.
set -euo pipefail

to="${1:?usage: send.sh <account-email> [sample-prefix ...]}"
shift
dir="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$dir/../.." && pwd)"

secret="${INGEST_SECRET:-$(grep -E '^INGEST_SECRET=' "$root/.env" | tail -1 | cut -d= -f2-)}"
url="${INGEST_URL:-https://mail-ingest.re-testing.me/api/ingest}"
[ -n "$secret" ] || { echo "INGEST_SECRET is empty (set it in .env)" >&2; exit 1; }

files=()
if [ $# -eq 0 ]; then
  files=("$dir"/*.eml)
else
  for prefix in "$@"; do files+=("$dir/$prefix"*.eml); done
fi

for file in "${files[@]}"; do
  id="$(date +%s)$RANDOM"
  # Piped straight into curl: $(...) would strip the trailing blank line that ends the headers
  status=$(sed -e "s|{{TO}}|$to|g" -e "s|{{ID}}|$id|g" -e "s|{{DATE}}|$(date -R)|g" "$file" |
    perl -pe 's/\r?\n/\r\n/' |
    curl -s -o /tmp/ingest-response.json -w '%{http_code}' -X POST "$url" \
    -H "X-Ingest-Secret: $secret" -H "X-Envelope-To: $to" -H 'Content-Type: message/rfc822' --data-binary @-)
  printf '%-40s %s %s\n' "$(basename "$file")" "$status" "$(cat /tmp/ingest-response.json)"
done
