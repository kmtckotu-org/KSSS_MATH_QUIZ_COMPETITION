// admin/src/auth/credentials.js
//
// ── ADMIN MANAGEMENT ──────────────────────────────────────────────────────────
//
// Admins are now self-registered at first login on their device.
// There is no pre-defined name list here.
//
// ── HOW IT WORKS ──────────────────────────────────────────────────────────────
//
//   First login on a device:
//     → Select "➕ First login on this device" from the dropdown
//     → Choose role: Limited Admin or Absolute Admin
//     → Enter your name, GitHub token, and a password
//     → If Absolute: also enter the structural authority code
//     → Your encrypted token is safely stored globally
//
//   Every login after that:
//     → Select your name from the dropdown
//     → Enter your password
//
// ── ROLES ─────────────────────────────────────────────────────────────────────
//
//   "absolute" — full structural control.
//               Requires the structural authority code at first-time setup.
//               Only the VP knows this code.
//
//   "limited"  — can enter and save scores only.
//               No code required.
//
// ── SECURITY MODEL ────────────────────────────────────────────────────────────
//
//   • Each admin's GitHub token is encrypted with their password using AES-GCM
//     (PBKDF2, 200,000 iterations) and stored in Firebase Realtime Database
//     under the /admins node.
//
//   • The encrypted blob is fetched from RTDB during login and decrypted locally.
//     No credentials are stored on the device.
//
//   • The structural authority code is the gate to claiming the Absolute role.
//     Its SHA-256 hash is stored in adminSecurity.js.
//
//   • To revoke an admin: remove their GitHub collaborator access.
//     Their token will fail validation on the next login.
//
// ─────────────────────────────────────────────────────────────────────────────

export { getGithubToken } from './session.js';
