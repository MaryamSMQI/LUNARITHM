# Firestore Security Rules Explanation (`docs/FIRESTORE_RULES.md`)

LUNARITHM enforces zero-trust, schema-validated access rules in `firestore.rules`:

## 1. Default Deny
All collections and nested subcollections not explicitly matched are blocked (`allow read, write: if false;`).

## 2. User Profiles (`/users/{uid}`)
- **PII Isolation**: Only the authenticated user whose `request.auth.uid == uid` can `get`, `create`, `update`, or `delete` their own `/users/{uid}` document. Listing `/users` is completely blocked.
- **Schema & Type Checks**: Enforces exact keys (`name`, `email`, `role`, `organization`, `createdAt`, `updatedAt`), string length limits (`name <= 120`, `email <= 254`, `organization <= 160`), and allowed `role` values.
- **Immutable Fields & Server Timestamps**: `createdAt` and `updatedAt` must match `request.time` on creation; `createdAt` and `email` cannot be altered on updates (`affectedKeys().hasOnly(['name', 'role', 'organization', 'updatedAt'])`).

## 3. Saved Analyses (`/analyses/{analysisId}`)
- **Owner-Only Writes**: Only an authenticated owner (`request.auth.uid == ownerId`) may create, update, or delete an analysis document. `ownerId` and `createdAt` are immutable after creation.
- **Read-Only Share Links**: Anyone (including unauthenticated judges) can read a specific document when `shared == true` (`allow get`), and `allow list` explicitly checks `resource.data.shared == true || resource.data.ownerId == request.auth.uid` so queries never rely on client filtering alone.
- **Validated Mission Payloads**: Validates `priorities` (`0–100`), `constraints`, `windowHours` (`24–1440`), `rankingBasis`, `missingDataPolicy`, and `relayBoostPct` (`0–100`) on every create and update.

> Note: Before distributing broadly in production, review and test these rules with the Firebase Emulator Suite against your expected workflows.
