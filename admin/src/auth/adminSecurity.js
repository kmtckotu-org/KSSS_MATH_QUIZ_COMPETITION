// admin/src/auth/adminSecurity.js
import { CONFIG } from '../core/config.js';
import { ROLE_ABSOLUTE, ROLE_LIMITED } from './roles.js';
import { hashString } from '../utils/security.js';
import { store } from '../core/store.js';
import { ADMIN_CREDENTIALS } from './credentials.js';
import {
  getGithubToken, setGithubToken, setAdminUser,
  getSecureAdminRole, setSecureAdminRole, clearSession
} from './session.js';
import { showAuthModal } from '../ui/modals.js';
import { loadMatches, validateGithubToken } from '../api/github.js';
import { freezeCriticalFunctions } from '../utils/security.js';
import { showLoginModal } from '../ui/render.js';
import { showRoleBadge } from '../ui/theme.js';
import { showAlertModal } from '../ui/modals.js';
import { setButtonLoading } from '../utils/dom.js';

const SALT = "ksss-secure-salt-v1";

let role = null;
let isInitializing = false;

// ── Crypto: decrypt a stored blob using a password ─────────────────────────

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

/**
 * Decrypt a base64 blob using the given password.
 * Returns the plain-text token, or null if the password is wrong.
 */
async function decryptBlob(blob, password) {
  try {
    const raw  = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
    const salt = raw.slice(0, 16);
    const iv   = raw.slice(16, 28);
    const data = raw.slice(28);
    const key  = await deriveKey(password, salt);
    const dec  = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(dec);
  } catch {
    // Decryption failure = wrong password or corrupted blob
    return null;
  }
}

// ── Role signing (tamper-proof session) ───────────────────────────────────

async function signRole(roleValue) {
  if (!roleValue) return null;
  const nonce = Date.now().toString();
  const hash  = await hashString(roleValue + SALT + nonce);
  return { role: roleValue, nonce, hash };
}

async function verifyRole(storedObj) {
  if (!storedObj?.role || !storedObj?.nonce || !storedObj?.hash) {
    if (CONFIG.debug) console.warn("🔒 Security Alert: Invalid role structure");
    return null;
  }
  const ALLOWED = [ROLE_ABSOLUTE, ROLE_LIMITED];
  if (!ALLOWED.includes(storedObj.role)) {
    console.warn(`🔒 Security Alert: Unrecognized role '${storedObj.role}' rejected`);
    return null;
  }
  const computed = await hashString(storedObj.role + SALT + storedObj.nonce);
  if (computed === storedObj.hash) return storedObj.role;
  console.warn("🔒 Security Alert: Admin Role Tampered. Clearing session.");
  return null;
}

async function setRole(newRole) {
  role = newRole;
  store.setCurrentAdminRole(newRole, 'adminSecurity.setRole');
  if (newRole) {
    const signed = await signRole(newRole);
    setSecureAdminRole(signed);
  } else {
    setSecureAdminRole(null);
  }
  sessionStorage.removeItem("currentAdminRole");
}

function finishLogin(token) {
  const currentUser = store.getCurrentUser();
  setAdminUser(currentUser);
  setGithubToken(token);

  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("grade-section").classList.remove("hidden");
  document.getElementById("admin-display").innerHTML =
    `✅ <strong>Authenticated:</strong> ${currentUser} | ` +
    `<strong>Status:</strong> <span style="color:var(--success);">Active Session</span> | ` +
    `<a href="#" onclick="KSSS_UI_HOOKS.logout(); return false;" ` +
    `style="color:var(--danger);margin-left:10px;">Logout</a>`;
  showRoleBadge();
}

// ── Public API ────────────────────────────────────────────────────────────

export const AdminSecurity = (() => {

  async function login() {
    const btn = document.getElementById("login-btn");
    if (!btn || btn.disabled) return;
    setButtonLoading(btn, true);

    try {
      const userName = document.getElementById("admin-name").value;
      const password = document.getElementById("admin-password").value;

      if (!userName) {
        await showAlertModal("Missing Information", "Please select your name.");
        return;
      }
      if (!password) {
        await showAlertModal("Missing Information", "Please enter your password.");
        return;
      }

      // Find the credential entry for this admin
      const cred = ADMIN_CREDENTIALS.find(c => c.name === userName);
      if (!cred) {
        await showAlertModal("Access Denied", "Admin not found.");
        return;
      }

      if (cred.blob === "REPLACE_WITH_BLOB_FROM_SETUP_TOOL") {
        await showAlertModal(
          "Setup Required",
          `No credential blob found for ${userName}.\n\n` +
          `Run admin/tools/setup.html to generate one, then update credentials.js.`
        );
        return;
      }

      // Decrypt the stored token using the entered password
      const token = await decryptBlob(cred.blob, password);
      if (!token) {
        await showAlertModal("Access Denied", "Incorrect password. Please try again.");
        return;
      }

      // Validate the decrypted token against GitHub
      const tokenValid = await validateGithubToken(token);
      if (!tokenValid) {
        await showAlertModal(
          "Token Expired",
          `The stored token for ${userName} is no longer valid.\n\n` +
          `The token may have expired. Ask ${userName} to:\n` +
          `1. Generate a new GitHub token\n` +
          `2. Run setup.html with the new token\n` +
          `3. Update their blob in credentials.js`
        );
        return;
      }

      store.setCurrentUser(userName, 'adminSecurity.login');

      // Y-JAMMEH requires an additional structural auth code
      if (cred.role === ROLE_ABSOLUTE) {
        try {
          const code = await showAuthModal();
          const expectedHash = "45888f0c28b9e1007b74238f0dd90312efe9b3c4298957c80079845ed7725384";
          const codeHash = await hashString(code);
          if (codeHash !== expectedHash) {
            await showAlertModal("Access Denied", "Incorrect structural authentication code.");
            return;
          }
        } catch {
          // User cancelled the modal
          return;
        }
      }

      await setRole(cred.role);
      finishLogin(token);

    } catch (e) {
      console.error(e);
      await showAlertModal("Login Error", "An unexpected error occurred. Please try again.");
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function logout() {
    clearSession();
    store.setCurrentUser("", 'adminSecurity.logout');
    store.setCurrentAdminRole(null, 'adminSecurity.logout');
    store.setCurrentData(null, 'adminSecurity.logout');
    store.setCurrentSha("", 'adminSecurity.logout');
    window.location.reload();
  }

  async function verifySession() {
    isInitializing = true;

    const token = getGithubToken();
    if (!token) {
      await setRole(null);
      isInitializing = false;
      showLoginModal();
      return;
    }

    const storedRole = getSecureAdminRole();
    if (!storedRole) {
      await setRole(null);
      isInitializing = false;
      showLoginModal();
      return;
    }

    try {
      const storedObj    = JSON.parse(storedRole);
      const roleVerified = await verifyRole(storedObj);
      if (!roleVerified) {
        await setRole(null);
        isInitializing = false;
        showLoginModal();
        return;
      }
      role = roleVerified;
      store.setCurrentAdminRole(role, 'adminSecurity.verifySession');
    } catch (e) {
      console.error("🔒 Role parse error", e);
      await setRole(null);
      isInitializing = false;
      showLoginModal();
      return;
    }

    showRoleBadge();
    await loadMatches();
    freezeCriticalFunctions();
    isInitializing = false;
  }

  async function validateSession() {
    const token = getGithubToken();
    if (!token) return false;
    const storedRole = getSecureAdminRole();
    if (!storedRole && role !== null) return false;
    try {
      const storedObj     = JSON.parse(storedRole);
      const verifiedRole  = await verifyRole(storedObj);
      if (!verifiedRole || verifiedRole !== role) {
        if (CONFIG.debug) console.warn("🔒 Integrity Check: Session signature invalid");
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({
    login,
    logout,
    verifySession,
    validateSession,
    getRole:         () => role,
    isInitializing:  () => isInitializing,
    isAuthenticated: () => role !== null
  });
})();
