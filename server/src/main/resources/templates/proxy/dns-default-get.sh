#!/bin/sh
# DNS Default GET Template for Certbot Manual Challenge
# Placeholders: ${host}, ${token}, ${domain}, ${action}

curl -G "${host}/api/zones/records/${action}" \
    --data-urlencode "token=${token}" \
    --data-urlencode "domain=${domain}" \
    --data-urlencode "type=txt" \
    --data-urlencode "text=$CERTBOT_VALIDATION"
