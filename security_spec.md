# SecureVault Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership**: Every document under `/users/{userId}`, `/users/{userId}/settings/{settingId}`, `/users/{userId}/vaultItems/{itemId}`, `/users/{userId}/guestRooms/{roomId}`, and `/users/{userId}/guestRooms/{roomId}/items/{itemId}` is owned solely by `userId == request.auth.uid` with `email_verified == true`.
2. **Master Gate**: Subcollection writes (`settings`, `vaultItems`, `guestRooms`) require the parent `/users/{userId}` document to exist. Guest Room item writes (`guestRooms/{roomId}/items`) additionally require the parent `/users/{userId}/guestRooms/{roomId}` document to exist.
3. **Immutable Ownership & Creation Timestamps**: `ownerId`, `roomId` (on Guest Room items), and `createdAt` cannot be modified after creation.
4. **Server Timestamp Enforcement**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
5. **Bounded Strings & Enums**: All document IDs match `^[a-zA-Z0-9_\-]+$` (<= 128 chars), and every string field enforces explicit `.size()` bounds.
6. **Zero Shadow Fields**: `keys().hasAll(...)` + `keys().hasOnly(...)` on create, and `diff(existing()).affectedKeys().hasOnly(...)` on update.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Cross-User Read/Write**: Authenticated user `attacker` attempts to read or create `/users/victim/vaultItems/item1` or `/users/victim/guestRooms/room_1234`.
2. **Unverified Email Spoof**: Authenticated user with `email_verified: false` attempts to write `/users/attacker/guestRooms/room_1234`.
3. **OwnerId Spoofing on Create**: User `attacker` writes `/users/attacker/guestRooms/room_1234` with `ownerId: "victim"`.
4. **Shadow Field Injection**: User `attacker` adds `isAdmin: true` to `VaultSettings`, `VaultItem`, `GuestRoom`, or `GuestRoomItem` on create.
5. **Shadow Update Bypass**: User `attacker` attempts an update adding an unlisted field `hiddenFlag: true`.
6. **Immutable OwnerId / RoomId Mutation**: User attempts to update `ownerId` or `roomId` on an existing `GuestRoomItem`.
7. **Immutable CreatedAt Mutation**: User attempts to modify `createdAt` during an update.
8. **Client Timestamp Forgery**: User submits a custom client `Date` for `createdAt` or `updatedAt` instead of `request.time`.
9. **Resource Exhaustion (1MB String)**: User submits a 100KB `title` or 500-char `id` path segment.
10. **Invalid Enum Injection**: User writes `category: "admin_override"` or `appIconPreset: "rootkit"`.
11. **Orphaned Subcollection Write**: User attempts to create `/users/{uid}/guestRooms/room_1234/items/item1` before `/users/{uid}/guestRooms/room_1234` exists.
12. **Blanket List Query**: User runs a collection query without `where('ownerId', '==', uid)` or lists `/users`.
