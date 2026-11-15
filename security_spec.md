# LUNARITHM Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Baseline**: Every unspecified collection and subcollection path in Firestore is denied (`allow read, write: if false`).
2. **PII Isolation (`users/{uid}`)**: A user profile document holds PII (`email`, `name`) and can only be read, created, updated, or deleted by `request.auth.uid == uid`. List queries on `/users` are completely forbidden.
3. **Strict Ownership (`analyses/{analysisId}`)**: Only an authenticated user whose `request.auth.uid` equals `ownerId` may create, update, or delete an analysis document. `ownerId` and `createdAt` are immutable after creation.
4. **Read-Only Shared Links (`shared == true`)**: Analysis snapshots marked `shared == true` may be read (`get`/`list`) by anyone (including unauthenticated judges), while remaining strictly non-writable by non-owners.
5. **Strict Schema & Server Timestamps**: Every write enforces required and allowed keys (`hasAll` + `hasOnly`), type checks, string/number bounds, valid ID pattern (`^[a-zA-Z0-9_\-]+$`), and `request.time` server timestamps.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. Unauthenticated read of `/users/alice` -> Denied (PII isolation).
2. Authenticated `bob` reading `/users/alice` -> Denied (`uid != request.auth.uid`).
3. Authenticated `bob` listing `/users` -> Denied (no list rule on `/users`).
4. `alice` creating `/users/alice` with extra shadow field `{ isAdmin: true }` -> Denied (`hasOnly` rejection).
5. `alice` creating `/users/alice` with forged `createdAt` timestamp != `request.time` -> Denied.
6. `alice` creating `/users/alice` with `name` > 120 chars (1 MB DoW payload) -> Denied.
7. `bob` creating `/analyses/a1` with `ownerId: "alice"` (identity spoofing) -> Denied.
8. `bob` reading unshared `/analyses/a1` (`shared: false`) owned by `alice` -> Denied.
9. `bob` updating `shared` analysis `/analyses/a1` owned by `alice` -> Denied.
10. `alice` updating `/analyses/a1` to mutate `ownerId` or `createdAt` -> Denied (immutability gate).
11. Unauthenticated `list` on `/analyses` without `where("shared", "==", true)` -> Denied (rule enforces `resource.data.shared == true`).
12. `alice` creating `/analyses/bad..id` or > 128 char doc ID -> Denied (`isValidId` check).
