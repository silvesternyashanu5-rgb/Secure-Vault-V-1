/**
 * Security Rules Specification Verification Tests (Dirty Dozen)
 * Validates all 12 adversarial payloads against firestore.rules invariants
 * across users, settings, vaultItems, guestRooms, and guestRooms/items.
 */

export const DIRTY_DOZEN_PAYLOADS = [
  {
    name: '1. Cross-User Write (Vault & Guest Room)',
    path: '/users/victim_uid/guestRooms/room_1001',
    auth: { uid: 'attacker_uid', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Unverified Email Spoof',
    path: '/users/attacker_uid/guestRooms/room_1001',
    auth: { uid: 'attacker_uid', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. OwnerId Spoofing on Create',
    path: '/users/attacker_uid/guestRooms/room_1001',
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { ownerId: 'victim_uid', guestNumber: 1001, label: 'Guest #1001' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Shadow Field Injection on Create',
    path: '/users/attacker_uid/settings/preferences',
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { ownerId: 'attacker_uid', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Shadow Update Bypass',
    path: '/users/attacker_uid/guestRooms/room_1001/items/item_1',
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { hiddenFlag: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Immutable OwnerId / RoomId Mutation',
    path: '/users/attacker_uid/guestRooms/room_1001/items/item_1',
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { ownerId: 'other_uid', roomId: 'room_9999' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Immutable CreatedAt Mutation',
    path: '/users/attacker_uid/vaultItems/item_1',
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { createdAt: new Date(0) },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Client Timestamp Forgery',
    path: '/users/attacker_uid/guestRooms/room_1001',
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { ownerId: 'attacker_uid', createdAt: new Date('2020-01-01'), updatedAt: new Date('2020-01-01') },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Resource Exhaustion (Oversized Title / ID)',
    path: `/users/attacker_uid/guestRooms/${'a'.repeat(200)}`,
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { ownerId: 'attacker_uid', label: 'x'.repeat(5000) },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Invalid Enum Injection',
    path: '/users/attacker_uid/guestRooms/room_1001/items/item_1',
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { ownerId: 'attacker_uid', roomId: 'room_1001', category: 'system_root' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Orphaned Subcollection Write (No Parent Guest Room)',
    path: '/users/new_uid/guestRooms/room_9999/items/item_1',
    auth: { uid: 'new_uid', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Unfiltered / Cross-User List Query',
    path: '/users',
    auth: { uid: 'attacker_uid', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
];
