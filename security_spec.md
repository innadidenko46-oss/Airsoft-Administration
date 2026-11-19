# Firestore Security Specification (Panel Administratora – AIRSOFT)

## 1. Data Invariants
1. **Strict Email Allowlist + Verification Gate**: All reads and writes require `request.auth != null && request.auth.token.email_verified == true` AND `request.auth.token.email.lower() in ['myhagenja@gmail.com', 'inna.didenko46@gmail.com']`. No other email address has any access to any document.
2. **Dedicated Airsoft Workspace Isolation**: All Airsoft repair, diagnostics, parts procurement, and catalog documents live exclusively under `/workspaces/airsoft-serwis/...`, completely isolated from any legacy workspace (`3dlabstudio` is denied).
3. **Immutable Identity & Timestamps**: `uid`, `ownerId`, `workspaceId`, `id`, and `createdAt` cannot be modified after creation. `createdAt` and `updatedAt` must equal `request.time`.
4. **Closed Key Blueprints**: No shadow/ghost fields are allowed on any create or update operation (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update).
5. **Bounded Payloads**: All strings and arrays (`partsCatalog <= 200`, `serviceRates <= 100`, `suppliers <= 30`, `quoteItems <= 100`, `quoteAttachments <= 6`) have strict `.size()` caps to guard against document bloat and Denial-of-Wallet attacks.

## 2. "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated read** on `/workspaces/airsoft-serwis/repairs/rep-1` -> Denied (`request.auth == null`).
2. **Verified non-allowlisted email** (`other@gmail.com`, `email_verified: true`) reading `/workspaces/airsoft-serwis/repairs/rep-1` -> Denied (`isAllowedUser()` fails).
3. **Spoofed unverified allowlisted email** (`inna.didenko46@gmail.com`, `email_verified: false`) writing `/workspaces/airsoft-serwis/settings/config` -> Denied (`email_verified == true` fails).
4. **Cross-tenant get** on `/users/{otherUid}` -> Denied (`uid != userId`).
5. **Legacy or wrong workspace ID** (`workspaces/3dlabstudio/repairs/rep-1`) -> Denied (`workspaceId == 'airsoft-serwis'`).
6. **Identity spoofing** on create: creating `/workspaces/airsoft-serwis/repairs/rep-1` with `ownerId: "someone-else"` -> Denied (`incoming().ownerId == request.auth.uid`).
7. **Ghost / Shadow field** on create: adding `isAdmin: true` to `/users/{uid}` -> Denied (`hasOnly`).
8. **Shadow field** on update: adding `extraField: 123` to `/workspaces/airsoft-serwis/repairs/rep-1` -> Denied (`affectedKeys().hasOnly`).
9. **ID Poisoning** via path variable: `repairId` containing invalid characters or >128 chars -> Denied (`isValidId`).
10. **Client timestamp forgery**: `createdAt` set to a past client timestamp instead of `request.time` -> Denied.
11. **Immutable field tampering**: updating `ownerId`, `workspaceId`, or `createdAt` on an existing `repair` -> Denied.
12. **Unbounded array / oversized string / invalid enum**: `partsCatalog` > 200 items, `quoteAttachments` > 6 items, `stage: "hacked"`, or `documentRef` > 160 chars -> Denied.
