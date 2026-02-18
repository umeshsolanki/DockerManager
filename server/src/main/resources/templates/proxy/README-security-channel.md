# Security channel (suspicious traffic → rsyslog → /security/mirror)

## Performance

- **Conditional logging**: Normal and security logs use `if=$log_access` / `if=$log_security`; only one log line is written per request. `$redacted_query` is evaluated only when writing the security log line.
- **Buffering**: Both access and security logs use `buffer=` and `flush=` from settings (`logBufferSizeKb`, `logFlushIntervalSeconds`) when `logBufferingEnabled` is true.
- **Single if in security-checks**: One combined `if` for path/UA violations to avoid extra nested location cost.
- **Many map rules**: If `pathViolations`/`uaViolations` inject many entries, add `map_hash_bucket_size 128;` in `http {}` in nginx.conf.

## Overview

- **Normal traffic** (status 100–399, no violation): `access.log` (main format, JSON or standard).
- **Suspicious traffic** (status ≥ 400 or path/UA violation): `security.log` (security_json format).

rsyslog can forward to `/security/mirror`:
- **Nginx→syslog**: Nginx sends directly to rsyslog; rsyslog forwards via omhttp to `/security/mirror`.
- **File-only**: Use `rsyslog-mirror.conf` (imfile reads `security.log` and POSTs each JSON line to `/security/mirror`).

## Nginx config (built by ProxyService)

| Placeholder | Source | Notes |
|-------------|--------|--------|
| `logFormatDefinition` | `log-format-json.conf` or `log-format-standard.conf` + `log-format-security-json.conf` | Kotlin selects based on `jsonLoggingEnabled` |
| `loggingConfig` | `standard-logging.conf` + Kotlin-built directives | `getAccessLogDirective()` injects buffer/flush from settings |
| `securityMaps` | `security-maps.conf` | Requires `pathViolations`, `uaViolations`, `globalBurstZone` |

## Log paths (container)

- Access: `/usr/local/openresty/nginx/logs/access.log`
- Security: `/usr/local/openresty/nginx/logs/security.log`
- Host mount: `$(nginxPath)/logs/` → container logs dir (see docker-compose).
