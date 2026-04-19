// admin/src/auth/adminSecurity.js
import { ROLE_ABSOLUTE, ROLE_LIMITED } from './roles.js';
import { hashString } from '../utils/security.js';
import { store } from '../core/store.js';
import {
  getGithubToken, setGithubToken, setAdminUser,
  getSecureAdminRole, setSecureAdminRole, clearSession
} from './session.js';
import { loadMatches, validateGithubToken } from '../api/github.js';
import { freezeCriticalFunctions } from '../utils/security.js';
import { showLoginModal } from '../ui/render.js';
import { showRoleBadge } from '../ui/theme.js';
import { showAlertModal } from '../ui/modals.js';
import { setButtonLoading } from '../utils/dom.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SALT               = "ksss-secure-salt-v1";
const STORAGE_KEY        = (name) => `ksss_admin_cred_${name}`;
const ROLE_HINT_KEY      = (name) => `ksss_admin_role_${name}`;
const REGISTRY_KEY       = "ksss_admin_registry";
// SHA-256 hash of the structural authority code (only VP knows the plaintext)
const ABSOLUTE_CODE_HASH = "45888f0c28b9e1007b74238f0dd90312efe9b3c4298957c80079845ed7725384";

let role           = null;
let isInitializing = false;

// ── Device registry ───────────────────────────────────────────────────────────
// Tracks which admin names have been registered on this device (persists
// through credential resets so the name stays in the dropdown).

function getRegistry() {
  try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || "[]"); }
  catch { return []; }
}

function addToRegistry(name) {
  const reg = getRegistry();
  if (!reg.includes(name)) {
    reg.push(name);
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
  }
}

/** Exported so index.js can populate the dropdown on load */
export function getRegisteredAdmins() {
  return getRegistry();
}

// ── Role hints ────────────────────────────────────────────────────────────────
// The role is stored unencrypted alongside the blob so the UI knows whether
// to show the structural code field without decrypting first.

function saveRoleHint(name, roleValue) {
  localStorage.setItem(ROLE_HINT_KEY(name), roleValue);
}

function getRoleHint(name) {
  return localStorage.getItem(ROLE_HINT_KEY(name)) || null;
}

// ── Crypto ────────────────────────────────────────────────────────────────────

async function deriveKey(password, salt, usage) {
  const enc         = new TextEncoder();
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

/** Encrypts a JSON payload (token + role) with the given password. */
async function encryptPayload(payload, password) {
  const enc    = new TextEncoder();
  const salt   = crypto.getRandomValues(new Uint8Array(16));
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const key    = await deriveKey(password, salt, "encrypt");
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(payload))
  );
  const packed = new Uint8Array(16 + 12 + cipher.byteLength);
  packed.set(salt, 0);
  packed.set(iv, 16);
  packed.set(new Uint8Array(cipher), 28);
  return btoa(String.fromCharCode(...packed));
}

/** Decrypts a blob and returns the payload object, or null on wrong password. */
async function decryptBlob(blob, password) {
  try {
    const raw  = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
    const salt = raw.slice(0, 16);
    const iv   = raw.slice(16, 28);
    const data = raw.slice(28);
    const key  = await deriveKey(password, salt, "decrypt");
    const dec  = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    const text = new TextDecoder().decode(dec);

    // Try new format first: { token, role }
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object' && obj.token) return obj;
    } catch { /* not JSON */ }

    // Fall back to old format: plain token string
    // role will be null — handled by the login() caller
    if (text && text.length > 10) return { token: text, role: null };

    return null;
  } catch {
    return null; // wrong password or corrupted blob
  }
}

// ── Blob storage ──────────────────────────────────────────────────────────────

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

export function isSetupComplete(name) {
  return !!getStoredBlob(name);
}

// ── Login mode ────────────────────────────────────────────────────────────────
// Determines what set of fields to show based on dropdown selection.
//
//   "none"       — nothing selected
//   "first_time" — "➕ First login" option chosen
//   "returning"  — known name with a valid blob
//   "reset"      — known name but blob was cleared (needs re-setup)

function getLoginMode() {
  const nameValue = el("admin-name")?.value;
  if (!nameValue)                        return "none";
  if (nameValue === "__first_time__")    return "first_time";
  if (isSetupComplete(nameValue))        return "returning";
  return "reset";
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function setVisible(id, visible) {
  const elem = el(id);
  if (elem) elem.style.display = visible ? "block" : "none";
}

/**
 * Called when the admin name dropdown changes.
 * Adjusts visible fields based on the login mode.
 */
export function onAdminNameChange() {
  const mode      = getLoginMode();
  const nameValue = el("admin-name")?.value;

  // Always reset to a clean state first
  setVisible("new-name-row",      false);
  setVisible("role-selector-row", false);
  setVisible("token-input-row",   false);
  setVisible("setup-note",        false);
  setVisible("code-input-row",    false);
  const pwdLabel = el("password-label");
  if (pwdLabel) pwdLabel.textContent = "🔑 Password";

  if (mode === "none") return;

  if (mode === "first_time") {
    setVisible("new-name-row",      true);
    setVisible("role-selector-row", true);
    setVisible("token-input-row",   true);
    setVisible("setup-note",        true);
    if (pwdLabel) pwdLabel.textContent = "🔑 Choose a Password";
    // Respect whatever role is currently selected in the toggle
    const currentRole = el("role-select")?.value || ROLE_LIMITED;
    _applyRoleToggleStyle(currentRole);
    setVisible("code-input-row", currentRole === ROLE_ABSOLUTE);
    return;
  }

  if (mode === "reset") {
    setVisible("token-input-row", true);
    setVisible("setup-note",      true);
    if (pwdLabel) pwdLabel.textContent = "🔑 Choose a New Password";
    // Show code field if this admin previously claimed absolute role
    if (getRoleHint(nameValue) === ROLE_ABSOLUTE) {
      setVisible("code-input-row", true);
    }
    return;
  }

  // mode === "returning" — password field is always visible; no extra fields
  // (The device + password is the only gate for returning users.)
}

/**
 * Called by the role toggle buttons (Limited / Absolute).
 * Updates button styles, the hidden input, and shows/hides the code field.
 */
export function selectRole(roleValue) {
  const hiddenInput = el("role-select");
  if (hiddenInput) hiddenInput.value = roleValue;
  _applyRoleToggleStyle(roleValue);
  setVisible("code-input-row", roleValue === ROLE_ABSOLUTE);
}

function _applyRoleToggleStyle(roleValue) {
  const limitedBtn  = el("role-btn-limited");
  const absoluteBtn = el("role-btn-absolute");
  if (!limitedBtn || !absoluteBtn) return;

  if (roleValue === ROLE_LIMITED) {
    limitedBtn.setAttribute("data-active", "true");
    absoluteBtn.removeAttribute("data-active");
  } else {
    absoluteBtn.setAttribute("data-active", "true");
    limitedBtn.removeAttribute("data-active");
  }
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

function finishLogin(token, adminName) {
  store.setCurrentUser(adminName, 'adminSecurity.finishLogin');
  setAdminUser(adminName);
  setGithubToken(token);
  el("login-section").classList.add("hidden");
  el("grade-section").classList.remove("hidden");
  el("admin-display").innerHTML =
    `✅ <strong>Authenticated:</strong> ${adminName} | ` +
    `<strong>Status:</strong> <span style="color:var(--success);">Active Session</span> | ` +
    `<a href="#" onclick="KSSS_UI_HOOKS.logout(); return false;" ` +
    `style="color:var(--danger);margin-left:10px;">Logout</a>`;
  showRoleBadge();
  
  // Re-run debug panel initialization now that role is established
  if (window.__initDebugPanel) {
      window.__initDebugPanel();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const AdminSecurity = (() => {

  async function login() {
    const btn = el("login-btn");
    if (!btn || btn.disabled) return;
    setButtonLoading(btn, true);

    try {
      const mode     = getLoginMode();
      const password = el("admin-password")?.value;

      if (mode === "none") {
        await showAlertModal("Missing Information", "Please select your name from the dropdown.");
        return;
      }
      if (!password) {
        await showAlertModal("Missing Information", "Please enter your password.");
        return;
      }

      // ── FIRST-TIME SETUP ─────────────────────────────────────────────────
      if (mode === "first_time") {
        const name     = el("admin-name-new")?.value?.trim();
        const tokenRaw = el("admin-token")?.value?.trim();
        const roleSel  = el("role-select")?.value || ROLE_LIMITED;
        const codeRaw  = el("admin-code")?.value?.trim();

        if (!name) {
          await showAlertModal("Missing Information", "Please enter your name.");
          return;
        }
        if (getRegistry().includes(name)) {
          await showAlertModal("Already Registered",
            `"${name}" is already set up on this device.\nSelect your name from the dropdown instead.`);
          return;
        }
        if (!tokenRaw) {
          await showAlertModal("Token Required",
            "Please enter your GitHub Personal Access Token.");
          return;
        }
        if (password.length < 8) {
          await showAlertModal("Weak Password",
            "Your password must be at least 8 characters long.");
          return;
        }

        // Absolute role requires the structural authority code
        if (roleSel === ROLE_ABSOLUTE) {
          if (!codeRaw) {
            await showAlertModal("Code Required",
              "Please enter the Absolute Admin structural authority code.");
            return;
          }
          const codeHash = await hashString(codeRaw);
          if (codeHash !== ABSOLUTE_CODE_HASH) {
            await showAlertModal("Code Rejected",
              "The Absolute Admin code you entered is incorrect.\n\n" +
              "If you do not have the code, switch to \"Limited Admin\" to continue.");
            return;
          }
        }

        // Validate GitHub token — checks authentication AND repo write access
        const valid = await validateGithubToken(tokenRaw);
        if (valid === 'no_repo_access') {
          await showAlertModal("Token Can't Access Repository",
            "Your token is valid but cannot access the KMTC-org repository.\n\n" +
            "For fine-grained PATs: make sure you selected the KMTC-org organization (not personal account) when creating the token, " +
            "and that the organization permits fine-grained PATs.");
          return;
        }
        if (valid === 'no_write') {
          await showAlertModal("Token Lacks Write Permission",
            "Your token can read the repository but cannot write to it.\n\n" +
            "  \u2022 Classic PAT: enable the 'repo' scope\n" +
            "  \u2022 Fine-grained PAT: set Contents to 'Read and write'");
          return;
        }
        if (!valid) {
          await showAlertModal("Invalid Token",
            "The GitHub token is invalid or has expired.\nPlease generate a new token and try again.");
          return;
        }

        // Encrypt { token, role } together and store on this device
        const blob = await encryptPayload({ token: tokenRaw, role: roleSel }, password);
        saveBlob(name, blob);
        addToRegistry(name);
        saveRoleHint(name, roleSel);

        // Refresh the dropdown so the new name appears
        window.__refreshAdminDropdown?.();

        await setRole(roleSel);
        finishLogin(tokenRaw, name);
        return;
      }

      // ── RESET SETUP (name in registry but blob was cleared) ──────────────
      if (mode === "reset") {
        const name     = el("admin-name")?.value;
        const tokenRaw = el("admin-token")?.value?.trim();
        const hint     = getRoleHint(name) || ROLE_LIMITED;

        if (!tokenRaw) {
          await showAlertModal("Token Required",
            "Please enter your GitHub token to restore your credentials.");
          return;
        }
        if (password.length < 8) {
          await showAlertModal("Weak Password",
            "Your password must be at least 8 characters long.");
          return;
        }

        // If the stored role was absolute, verify the code again
        if (hint === ROLE_ABSOLUTE) {
          const codeRaw = el("admin-code")?.value?.trim();
          if (!codeRaw) {
            await showAlertModal("Code Required",
              "Your account requires the Absolute Admin code to restore.");
            return;
          }
          const codeHash = await hashString(codeRaw);
          if (codeHash !== ABSOLUTE_CODE_HASH) {
            await showAlertModal("Code Rejected",
              "The Absolute Admin code is incorrect.");
            return;
          }
        }

        const valid = await validateGithubToken(tokenRaw);
        if (valid === 'no_repo_access') {
          await showAlertModal("Token Can't Access Repository",
            "Your token is valid but cannot access the KMTC-org repository.\n" +
            "Make sure the token is scoped to the KMTC-org organization.");
          return;
        }
        if (valid === 'no_write') {
          await showAlertModal("Token Lacks Write Permission",
            "Your token can read the repo but cannot write to it.\n" +
            "Enable the 'repo' scope (classic) or 'Contents: read and write' (fine-grained).");
          return;
        }
        if (!valid) {
          await showAlertModal("Invalid Token",
            "The GitHub token is invalid or has expired. Please generate a new one.");
          return;
        }

        const blob = await encryptPayload({ token: tokenRaw, role: hint }, password);
        saveBlob(name, blob);
        saveRoleHint(name, hint);

        await setRole(hint);
        finishLogin(tokenRaw, name);
        return;
      }

        // ── RETURNING LOGIN ──────────────────────────────────────────────────
      if (mode === "returning") {
        const name    = el("admin-name")?.value;
        const blob    = getStoredBlob(name);
        const payload = await decryptBlob(blob, password);

        if (!payload) {
          await showAlertModal("Access Denied",
            "Incorrect password.\n\n" +
            "If you forgot your password or your token has expired, " +
            "click \"Reset credentials\" below to set up again.");
          return;
        }

        let { token, role: storedRole } = payload;

        // Old-format blob had no role stored — default to limited
        if (!storedRole) storedRole = ROLE_LIMITED;

        // Check the token is still active and has write access
        const valid = await validateGithubToken(token);
        if (valid === false || valid === 'no_repo_access') {
          // Token expired or repo access revoked — force re-setup
          clearBlob(name);
          onAdminNameChange(); // switches to reset mode UI
          await showAlertModal("Token Expired or Revoked",
            "Your stored GitHub token has expired or no longer has access to this repository.\n\n" +
            "Please enter a new token to restore your credentials.");
          return;
        }
        if (valid === 'no_write') {
          // Token is valid but write access was revoked — warn but still log in (read works)
          await showAlertModal("Write Access Removed",
            "Warning: your token can no longer write to this repository.\n" +
            "You can view data but cannot save changes.\n\n" +
            "Use 'Reset credentials' to set up a new token with write access.");
          // Still let them log in in read-only context
        }

        await setRole(storedRole);
        finishLogin(token, name);
        return;
      }

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

  /**
   * Clears the encrypted blob for this admin.
   * The name stays in the registry and dropdown — only the credentials are reset.
   */
  async function resetCredentials() {
    const name = el("admin-name")?.value;
    if (!name || name === "__first_time__") {
      await showAlertModal(
        "No Name Selected",
        "Please select your name from the dropdown first, then click \"Reset credentials\"."
      );
      return;
    }
    clearBlob(name);
    onAdminNameChange(); // re-render: switches to "reset" mode UI
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
    selectRole,
    getRole:          () => role,
    isInitializing:   () => isInitializing,
    isAuthenticated:  () => role !== null
  });
})();
