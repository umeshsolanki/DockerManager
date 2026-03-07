# Implementation Plan - Fix DNS (BIND9) Production Issues

The DNS service (BIND9) is currently failing in production due to a mismatch between where the backend writes zone files and what the BIND9 Docker container sees. Additionally, malformed records with leading/trailing spaces are causing BIND9 configuration errors.

## Problem Analysis
1.  **Path Mismatch**: The backend writes zone files to `AppConfig.dataRoot/dns/zones`. However, the BIND9 Docker container maps `/var/lib/bind` to `AppConfig.dataRoot/dns/bind9/data`. This means the zone files are completely invisible to the BIND9 container.
2.  **Absolute Host Paths**: The backend writes absolute host paths into `named.conf.local` (e.g., `/app/data/dns/zones/db.example.com`). BIND9 running inside a separate container cannot access these host-specific paths.
3.  **Record Sanitization**: Users can enter records with leading/trailing spaces (e.g., `"ns1 .example.com."`), which `DnsServiceImpl` does not trim, leading to BIND9 syntax errors.

## Proposed Changes

### 1. Backend: DnsServiceImpl.kt
-   **Consolidate Paths**: Update `dataDir`, `zonesDir`, and `keysDir` to be consistent with the Docker volume mapping.
-   **Container-Aware Links**: Modify `writeNamedConfEntry` to translate host paths to container paths (`/var/lib/bind/...`) when in Docker mode.
-   **Input Sanitization**: Trim `name` and `value` in `addRecord`, `updateRecords`, and `parseBindRecord`.
-   **Fix Default Installation Paths**: Ensure `installDocker` uses paths that align with where the service expects data.

### 2. UI: DnsInstallTab.tsx
-   (Already adjusted relative paths, but will verify consistency with backend defaults).

## Verification Plan

### Automated Tests
-   Verify `remapDomain` logic.
-   Verify `sanitizeAclEntries`.
-   Verify path resolution logic via unit tests (if possible).

### Manual Verification
1.  Create a new DNS zone.
2.  Add records with intentionally placed spaces.
3.  Trigger BIND9 reload and check `named-checkconf` / `rndc status`.
4.  Check `named.conf.local` content to ensure paths are container-friendly (e.g., starting with `/var/lib/bind/`).
