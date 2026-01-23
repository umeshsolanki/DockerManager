#!/bin/sh
# DNS Hook Template for Certbot Manual Challenge
# Placeholders: ${url}, ${token}

curl -X POST "${url}" \
    -H "Content-Type: application/json" \
    -d "{
        \"domain\": \"$CERTBOT_DOMAIN\",
        \"validation\": \"$CERTBOT_VALIDATION\",
        \"token\": \"${token}\"
    }"
