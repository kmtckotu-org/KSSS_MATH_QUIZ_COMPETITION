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

const SALT        = "ksss-secure-salt-v1";
const STORAGE_KEY = (name) => `ksss_admin_cred_${name}`;

let role          = null;
let isInitializing = false;

// ── Crypto ────────────────────────────────────────────────────────────────────

async function deriveKey(password, salt, usage) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

async function encryptToken(token, password) {
  const enc   = new TextEncoder();
  const salt  = crypto.getRandomValues(new Uint8Array(16));
  const iv    = crypto.getRandomValues(new Uint8Array(12));
  const key   = await deriveKey(password, salt, "encrypt");
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(token));
  const packed = new Uint8Array(16 + 12 + cipher.byteLength);
  packed.set(salt, 0);
  packed.set(iv, 16);
  packed.set(new Uint8Array(cipher), 28);
  return btoa(String.fromCharCode(...packed));
}

async function decryptBlob(blob, password) {
  try {
    const raw  = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
    const salt = raw.slice(0, 16);
    const iv   = raw.slice(16, 28);
    const data = raw.slice(28);
    const key  = await deriveKey(password, salt, "decrypt");
    const dec  = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(dec);
  } catch {
    return null; // wrong password or corrupted
  }
}

// ── Device credential storage ─────────────────────────────────────────────────

function getStoredBlob(name) {
  try { return localStorage.getItem(STORAGE_KEY(name)) || null; }
  catch { return null; }
}

function saveBlob(name, blob) {
  try { localStorage.setItem(STORAGE_KEY(name), blob); }
  catch { /* ignore */ }
}

function clearBlob(name) {
  try { localStorage.removeItem(STORAGE_KEY(name)); }
  catch { /* ignore */ }
}

/** Returns true if this admin has completed first-time setup on this device */
export function isSetupComplete(name) {
  return !!getStoredBlob(name);
}

// ── Login UI state management ─────────────────────────────────────────────────

/**
 * Called by index.js when the admin name dropdown changes.
 * Shows/hides the token field based on whether setup is complete.
 */
export function onAdminNameChange() {
  const name        = document.getElementById("admin-name")?.value;
  const tokenRow    = document.getElementById("token-input-row");
  const setupNote   = document.getElementById("setup-note");
  const passwordLbl = document.getElementById("password-label");

  if (!name) {
    if (tokenRow)  tokenRow.style.display  = "none";
    if (setupNote) setupNote.style.display = "none";
    return;
  }

  const needsSetup = !isSetupComplete(name);

  if (tokenRow)    tokenRow.style.display  = needsSetup ? "block" : "none";
  if (setupNote)   setupNote.style.display = needsSetup ? "block" : "none";
  if (passwordLbl) passwordLbl.textContent = needsSetup
    ? "🔑 Choose a Password"
    : "🔑 Password";
}

// ── Role signing ──────────────────────────────────────────────────────────────

async function signRole(roleValue) {
  if (!roleValue) return null;
  const nonce = Date.now().toString();
  const hash  = await hashString(roleValue + SALT + nonce);
  return { role: roleValue, nonce, hash };
}

async function verifyRole(storedObj) {
  if (!storedObj?.role || !storedObj?.nonce || !storedObj?.hash) return null;
  const ALLOWED = [ROLE_ABSOLUTE, ROLE_LIMITED];
  if (!ALLOWED.includes(storedObj.role)) return null;
  const computed = await hashString(storedObj.role + SALT + storedObj.nonce);
  return computed === storedObj.hash ? storedObj.role : null;
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

// ── Public API ────────────────────────────────────────────────────────────────

export const AdminSecurity = (() => {

  async function login() {
    const btn = document.getElementById("login-btn");
    if (!btn || btn.disabled) return;
    setButtonLoading(btn, true);

    try {
      const name     = document.getElementById("admin-name")?.value;
      const password = document.getElementById("admin-password")?.value;
      const tokenRaw = document.getElementById("admin-token")?.value?.trim();

      if (!name) {
        await showAlertModal("Missing Information", "Please select your name.");
        return;
      }
      if (!password) {
        await showAlertModal("Missing Information", "Please enter your password.");
        return;
      }

      // Find role for this admin
      const cred = ADMIN_CREDENTIALS.find(c => c.name === name);
      if (!cred) {
        await showAlertModal("Access Denied", "Admin not found. Contact the VP.");
        return;
      }

      let token;
      const needsSetup = !isSetupComplete(name);

      if (needsSetup) {
        // ── FIRST-TIME SETUP ─────────────────────────────────────────────────
        if (!tokenRaw) {
          await showAlertModal("Token Required",
            "This is your first login on this device.\nPlease enter your GitHub token to set up your credentials.");
          return;
        }
        if (password.length < 8) {
          await showAlertModal("Weak Password", "Choose a password with at least 8 characters.");
          return;
        }

        // Validate the token first
        const valid = await validateGithubToken(tokenRaw);
        if (!valid) {
          await showAlertModal("Invalid Token",
            "The GitHub token you entered is invalid or expired.\nPlease generate a new one.");
          return;
        }

        // Encrypt and save to localStorage on this device
        const blob = await encryptToken(tokenRaw, password);
        saveBlob(name, blob);
        token = tokenRaw;

        // Hide the token field for future logins
        const tokenRow  = document.getElementById("token-input-row");
        const setupNote = document.getElementById("setup-note");
        if (tokenRow)  tokenRow.style.display  = "none";
        if (setupNote) setupNote.style.display = "none";

      } else {
        // ── NORMAL LOGIN ─────────────────────────────────────────────────────
        const blob = getStoredBlob(name);
        token = await decryptBlob(blob, password);

        if (!token) {
          await showAlertModal("Access Denied",
            "Incorrect password.\n\nIf you forgot your password or your token has expired, " +
            "click \"Reset Credentials\" to set up again.");
          return;
        }

        // Validate that the stored token is still active
        const valid = await validateGithubToken(token);
        if (!valid) {
          // Token expired — clear the blob and force re-setup
          clearBlob(name);
          onAdminNameChange();
          await showAlertModal("Token Expired",
            "Your stored GitHub token has expired.\n\n" +
            "Please generate a new token and complete the setup again.\n" +
            "The token field will now appear.");
          return;
        }
      }

      store.setCurrentUser(name, 'adminSecurity.login');

      // Absolute admin requires structural auth code in addition
      if (cred.role === ROLE_ABSOLUTE) {
        try {
          const code         = await showAuthModal();
          const expectedHash = "45888f0c28b9e1007b74238f0dd90312efe9b3c4298957c80079845ed7725384";
          const codeHash     = await hashString(code);
          if (codeHash !== expectedHash) {
            await showAlertModal("Access Denied", "Incorrect structural authentication code.");
            return;
          }
        } catch {
          return; // user cancelled
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

  /** Called from the "Reset Credentials" link — clears stored blob for this admin */
  function resetCredentials() {
    const name = document.getElementById("admin-name")?.value;
    if (!name) return;
    clearBlob(name);
    onAdminNameChange();
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
      const storedObj    = JSON.parse(storedRole);
      const verifiedRole = await verifyRole(storedObj);
      return !!(verifiedRole && verifiedRole === role);
    } catch {
      return false;
    }
  }

  return Object.freeze({
    login,
    logout,
    resetCredentials,
    verifySession,
    validateSession,
    onAdminNameChange,
    getRole:          () => role,
    isInitializing:   () => isInitializing,
    isAuthenticated:  () => role !== null
  });
})();
