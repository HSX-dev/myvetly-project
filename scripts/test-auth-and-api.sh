#!/bin/bash
# Test Supabase (new project) auth + vetly-api with PawMD login.
# Usage: ./scripts/test-auth-and-api.sh
# Optional: API_URL=http://localhost:8000 ./scripts/test-auth-and-api.sh

SUPABASE_URL="https://fqcyppyyuopwfxrpuylv.supabase.co"
SUPABASE_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxY3lwcHl5dW9wd2Z4cnB1eWx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTU3NzQsImV4cCI6MjA4NzM5MTc3NH0.j5slnWnts7hmb2m1H1ms8uOfsR3bWHEaIqaWumX-nBk"
API_URL="${API_URL:-https://vetly-api-njigo.ondigitalocean.app}"
EMAIL="${EMAIL:-myvetly@gmail.com}"
PASSWORD="${PASSWORD:-Captain21!}"

set -e
echo "1. Signing in to Supabase (new project) as $EMAIL..."
RESP=$(curl -s -w "\n%{http_code}" -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
HTTP=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP" != "200" ]; then
  echo "   Auth failed (HTTP $HTTP)"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  exit 1
fi

ACCESS_TOKEN=$(echo "$BODY" | jq -r '.access_token' 2>/dev/null || echo "$BODY" | grep -o '"access_token":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$ACCESS_TOKEN" ]; then
  echo "   No access_token in response:"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  exit 1
fi
echo "   OK – got access_token (Supabase + DB auth working)."

echo "2. Calling vetly-api GET $API_URL/api/reminders/upcoming ..."
API_RESP=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/reminders/upcoming" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")
API_HTTP=$(echo "$API_RESP" | tail -n1)
API_BODY=$(echo "$API_RESP" | sed '$d')

if [ "$API_HTTP" != "200" ]; then
  echo "   API call failed (HTTP $API_HTTP)"
  echo "$API_BODY" | jq . 2>/dev/null || echo "$API_BODY"
  exit 1
fi
echo ""
echo "   OK – API + DB connection working."
echo ""
echo "Response: $API_BODY"
echo ""
echo "Done. Supabase auth and vetly-api + new DB connection both work."
