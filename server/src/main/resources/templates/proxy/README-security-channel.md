# Security channel (suspicious traffic → rsyslog → /mirror/security)

## Performance

- **Conditional logging**: Normal and security logs use `if=$log_access` / `if=$log_security`; only one log line is written per request. `$redacted_query` is evaluated only when writing the security log line, not on every request.
- **Buffering**: Both access and security logs use `buffer=` and `flush=` from configurable settings (`logBufferSizeKb`, `logFlushIntervalSeconds`) to batch writes and reduce I/O.
- **Single if in security-checks**: One combined `if` for path/UA violations to avoid extra nested location cost.
- **Many map rules**: If `pathViolations`/`uaViolations` inject many entries, add `map_hash_bucket_size 128;` in `http {}` in nginx.conf.

## Overview

- **Normal traffic** (status 100–399, no violation): `access.log` (main format).
- **Suspicious traffic** (status ≥ 400 or path/UA violation): `security.log` (security_analysis format).

rsyslog should read `security.log` and forward to `/mirror/security`.

## Nginx main config placeholders

When building `nginx.conf`, set:

| Placeholder | Source template | Notes |
|-------------|------------------|--------|
| `logFormatDefinition` | `log-format-definition.conf` | Defines `main` and `security_analysis` formats |
| `loggingConfig` | `logging-config.conf` | access_log for access.log and security.log (conditional on `$log_access` / `$log_security`) |
| `securityMaps` | `security-maps.conf` | Requires `pathViolations`, `uaViolations`, `globalBurstZone` |

## Log paths (container)

- Access: `/usr/local/openresty/nginx/logs/access.log`
- Security: `/usr/local/openresty/nginx/logs/security.log`
- Host mount: `$(nginxPath)/logs/` → container logs dir (see docker-compose).

## rsyslog

Configure rsyslog to read the security log and send to `/mirror/security` (file or remote). Example (host path):

```
# Input file (host path to proxy logs)
input(type="imfile" File="<nginxPath>/logs/security.log" Tag="proxy-security")

# Forward to /mirror/security
if $programname == 'proxy-security' then /mirror/security/proxy-security.log
```
