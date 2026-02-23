# Implementation Plan: DNS Serial Desync & DNSSEC Auto-Recovery

## Context
When BIND9 uses `inline-signing yes;` for DNSSEC, it automatically increments the zone's serial number internally and stores it in the `.jnl` and `.signed` files. The backend JSON database falls out of sync because it doesn't track BIND's internal increments. When the backend tries to manually update the zone file using its own recorded serial, BIND rejects it with an "out of range" error because the generated serial is lower than the live signed serial.

Additionally, if keys are wiped from the container but the backend/zone file still claims the zone is DNSSEC enabled (e.g. `Kumeshsolanki.in.+...private: file not found`), BIND fails to load the zone.

## Action Plan

### 1. Fix Serial Generation (`DnsServiceImpl.kt`)
- Modify the `generateNextSerial()` logic to accept a `zoneName` parameter.
- Use `dig +short SOA <zone> @127.0.0.1` (or local file parsing) to discover the *actual* active serial currently deployed in BIND.
- If the live serial from BIND is larger than the JSON DB's serial, calculate the next serial based on the *live* serial rather than the DB.
- Ensure `createZone` assigns a proper starting serial via this method instead of defaulting to `1` which might trigger older journal conflicts.

### 2. DNSSEC Auto-Recovery
- Create a `syncDnssecState()` or similar validation step upon service startup or during `reloadBind()`.
- Scan all zones marked `dnssecEnabled = true`. Check if their corresponding `.key` and `.private` files exist in the keys directory.
- If the keys are missing (due to container rebuilds missing persistent volumes), automatically invoke the equivalent of `enableDnssec()` (generating new ZSK/KSK and signing) transparently to fix the "file not found" errors.

