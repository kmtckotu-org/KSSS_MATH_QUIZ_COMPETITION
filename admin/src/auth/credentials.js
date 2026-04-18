// admin/src/auth/credentials.js
//
// ── HOW TO MANAGE ADMINS ──────────────────────────────────────────────────────
//
// This is the ONLY file you need to edit for admin management.
//
// TO ADD AN ADMIN:
//   1. Open admin/tools/setup.html in your browser (locally, never online)
//   2. Enter the new admin's name, role, GitHub token, and password
//   3. Copy the generated entry and add it to the list below
//
// TO REMOVE AN ADMIN:
//   Delete their entry from the list.
//
// TO ROTATE AN EXPIRED TOKEN:
//   1. Generate a new GitHub token for that admin
//   2. Open setup.html, enter their name, NEW token, and SAME password
//   3. Replace their blob with the new one
//
// TO CHANGE A PASSWORD:
//   1. Open setup.html, enter their name, SAME token, and NEW password
//   2. Replace their blob with the new one
//
// TO RENAME AN ADMIN:
//   Change the name field. The dropdown updates automatically.
//
// ── ROLES ─────────────────────────────────────────────────────────────────────
//
//   "absolute" — full structural control (cascade delete, team switch, unlock rounds)
//                Y-JAMMEH also goes through an additional structural auth code
//   "limited"  — can enter and save scores only
//
// ── BLOB FORMAT ───────────────────────────────────────────────────────────────
//
//   Each blob is: base64(salt[16] + iv[12] + AES-GCM-ciphertext)
//   Key derived with PBKDF2 SHA-256, 200,000 iterations.
//   The same token + password produces a different blob each time — that is correct.
//
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_CREDENTIALS = [
  {
    name: "YUSUPHA  JAMMEH",
    role: "absolute",
    // Run setup.html to generate this blob
    blob: "w7WLrMUVWrft654SHBvumSWQzzCGKFNY+Xi7z+MLVRhkx/BnfxcSiGy7u6pRnsttt/mIx8bc7gEv7af1VyNohY0N8k8+EH7uAK28TyhmqP/Lb+TOPpEiz+OFW3ozDlsS4S1xFtlWgZ2jQt+upIupe7P2mq+Kco5jUaYlhdEE6a/j+o3bM0eH1AI="
  },
  {
    name: "Pico Jr",
    role: "limited",
    blob: "REPLACE_WITH_BLOB_FROM_SETUP_TOOL"
  },
  {
    name: "Coordinator",
    role: "limited",
    blob: "REPLACE_WITH_BLOB_FROM_SETUP_TOOL"
  }
];
