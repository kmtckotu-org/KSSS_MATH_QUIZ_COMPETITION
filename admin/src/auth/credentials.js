// admin/src/auth/credentials.js
//
// ── HOW TO MANAGE ADMINS ──────────────────────────────────────────────────────
//
// This is the ONLY file you edit for admin management.
//
// TO ADD AN ADMIN:
//   Add an entry with their name and role. That is it.
//   They do their own first-time setup on their device (name + token + password).
//
// TO REMOVE AN ADMIN:
//   Delete their entry. Their device credentials become useless immediately.
//
// TO RENAME AN ADMIN:
//   Change the name. They will need to do first-time setup again on their device.
//
// ── ROLES ─────────────────────────────────────────────────────────────────────
//
//   "absolute" — full structural control (VP only).
//               Y-JAMMEH also requires an additional structural auth code.
//   "limited"  — can enter and save scores only.
//
// ── HOW CREDENTIALS WORK ──────────────────────────────────────────────────────
//
//   Each admin's GitHub token is encrypted with their own password using AES-GCM
//   and stored in localStorage on their own device.
//
//   First login on a new device: enter name + GitHub token + chosen password.
//   Every login after that:      enter name + password only.
//
//   No tokens in files. No blobs to copy. No files to commit.
//   Each admin manages their own device credentials independently.
//
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_CREDENTIALS = [
  { name: "Y-JAMMEH",    role: "absolute" },
  { name: "Pico Jr",     role: "limited"  },
  { name: "Coordinator", role: "limited"  }
];
