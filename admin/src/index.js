console.log("🚀 Starting KSSS Admin initialization...");

import { ErrorHandler } from './utils/errorHandler.js';
import { loadModules } from './bootstrap.js';
import { store } from './core/store.js';
import { CONFIG } from './core/config.js';

// Make store globally accessible for debugging
window.__store = store;

// Expose so adminSecurity.js can refresh after a new admin registers
// (The actual fill function is defined inline in index.html; this is just a compatibility shim)
if (!window.__refreshAdminDropdown) {
    window.__refreshAdminDropdown = function() {};
}

// --- Immediate UI correction in case page was restored from bfcache ---
if (!sessionStorage.getItem("githubToken")) {
    // No token → force login screen
    document.getElementById("editor-section")?.classList.add("hidden");
    document.getElementById("login-section")?.classList.remove("hidden");
    document.getElementById("grade-section")?.classList.add("hidden");
    const adminDisplay = document.getElementById("admin-display");
    if (adminDisplay) adminDisplay.innerHTML = "Please authenticate to access tournament management";
}

// Handle pageshow for bfcache (when user navigates back/forward)
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        // Page restored from bfcache – re‑evaluate session
        if (!sessionStorage.getItem("githubToken")) {
            document.getElementById("editor-section")?.classList.add("hidden");
            document.getElementById("login-section")?.classList.remove("hidden");
            document.getElementById("grade-section")?.classList.add("hidden");
            const adminDisplay = document.getElementById("admin-display");
            if (adminDisplay) adminDisplay.innerHTML = "Please authenticate to access tournament management";
        }
    }
});

async function initializeApp() {
    try {
        // Initialize debug panel dynamically so any failure in debug.js
        // cannot block the rest of the app from loading
        import('./debug.js').then(dbg => {
            window.__initDebugPanel = dbg.initDebugPanel;
            try { dbg.initDebugPanel(); } catch(e) { console.warn('Debug panel skipped:', e.message); }
        }).catch(e => console.warn('debug.js failed to load:', e.message));

        // Phase 1: Core modules (must succeed)
        const core = await loadModules([
            { name: 'config', path: './core/config.js', critical: true },
            { name: 'session', path: './auth/session.js', critical: true },
            { name: 'security', path: './utils/security.js', critical: true },
            { name: 'dom', path: './utils/dom.js', critical: true },
            { name: 'theme', path: './ui/theme.js', critical: true },
            { name: 'history', path: './core/history.js', critical: true }
        ]);

        // Phase 2: Authentication module (needs core)
        const authModule = await loadModules([
            { name: 'roles', path: './auth/roles.js', critical: true },
            { name: 'adminSecurity', path: './auth/adminSecurity.js', critical: true }
        ]);

        // Phase 3: Basic UI (needed for initial render)
        const uiModule = await loadModules([
            { name: 'render', path: './ui/render.js', critical: true },
            { name: 'filters', path: './ui/filters.js', critical: false },
            { name: 'pagination', path: './ui/pagination.js', critical: false },
            { name: 'modals', path: './ui/modals.js', critical: false }
        ]);

        // Phase 4: Tournament logic
        const tournamentModule = await loadModules([
            { name: 'matches', path: './tournament/matches.js', critical: false },
            { name: 'rounds', path: './tournament/rounds.js', critical: false },
            { name: 'bestLoser', path: './tournament/bestLoser.js', critical: false },
            { name: 'generation', path: './tournament/generation.js', critical: false },
            { name: 'teamSwitch', path: './tournament/teamSwitch.js', critical: false }
        ]);

        // Phase 5: GitHub API
        const apiModule = await loadModules([
            { name: 'cache', path: './api/cache.js', critical: false },
            { name: 'github', path: './api/github.js', critical: false }
        ]);

        // Phase 6: Export modules
        const exportModule = await loadModules([
            { name: 'csv', path: './export/csv.js', critical: false },
            { name: 'pdf', path: './export/pdf.js', critical: false }
        ]);

        console.log("✅ All modules loaded");

        // Build KSSS_UI_HOOKS from loaded modules
        const hooks = {};

        // Authentication
        if (authModule.adminSecurity) {
            hooks.login               = authModule.adminSecurity.AdminSecurity.login;
            hooks.logout              = authModule.adminSecurity.AdminSecurity.logout;
            hooks.onAdminNameChange   = authModule.adminSecurity.AdminSecurity.onAdminNameChange;
            hooks.selectRole          = authModule.adminSecurity.AdminSecurity.selectRole;
            hooks.resetCredentials    = authModule.adminSecurity.AdminSecurity.resetCredentials;
        }

        // GitHub API
        if (apiModule.github) {
            hooks.loadMatches = apiModule.github.loadMatches;
            hooks.saveToGitHub = apiModule.github.saveToGitHub;
        }

        // Tournament functions
        if (tournamentModule.teamSwitch) {
            hooks.activateTeamSwitchMode = tournamentModule.teamSwitch.activateTeamSwitchMode;
            hooks.exitTeamSwitchMode = tournamentModule.teamSwitch.exitTeamSwitchMode;
            hooks.unlockTeam = tournamentModule.teamSwitch.unlockTeam;
            hooks.relockTeam = tournamentModule.teamSwitch.relockTeam;
            hooks.confirmTeamSwap = tournamentModule.teamSwitch.confirmTeamSwap;
        }

        if (tournamentModule.rounds) {
            hooks.cascadeDeleteRound = tournamentModule.rounds.cascadeDeleteRound;
            hooks.endTournament = tournamentModule.rounds.endTournament;
            hooks.unlockFinalRound = tournamentModule.rounds.unlockFinalRound; // ADDED
        }

        if (tournamentModule.bestLoser) {
            hooks.overrideBestLoserSave = tournamentModule.bestLoser.overrideBestLoserSave;
        }

        if (tournamentModule.generation) {
            hooks.startPairing = tournamentModule.generation.startPairing;
            hooks.finalizePairing = tournamentModule.generation.finalizePairing;
        }

        if (uiModule.modals) {
            hooks.cancelTeamSwap = uiModule.modals.cancelTeamSwap;
            hooks.showRoundGenerator = uiModule.modals.showRoundGenerator;
            hooks.closeRoundGenModal = uiModule.modals.closeRoundGenModal;
            hooks.showStructuralActionLog = uiModule.modals.showStructuralActionLog;
            hooks.closeStructuralLogModal = uiModule.modals.closeStructuralLogModal;
            hooks.showBestLoserOverride = uiModule.modals.showBestLoserOverride;
            hooks.closeBestLoserModal = uiModule.modals.closeBestLoserModal;
            hooks.showStructuralAuthModal = uiModule.modals.showStructuralAuthModal;
        }

        if (uiModule.filters) {
            hooks.filterMatches = uiModule.filters.filterMatches;
            hooks.clearFilters = uiModule.filters.clearFilters;
        }

        if (uiModule.pagination) {
            hooks.changePage = uiModule.pagination.changePage;
        }

        if (exportModule.csv) hooks.exportToCSV = exportModule.csv.exportToCSV;
        if (exportModule.pdf) hooks.exportToPDF = exportModule.pdf.exportToPDF;

        // Undo/redo need special handling because they take callbacks
        if (core.history) {
            hooks.undoChange = () => core.history.undoChange(uiModule.render?.renderForm);
            hooks.redoChange = () => core.history.redoChange(uiModule.render?.renderForm);
        }

        // Wrap all hooks with error handling
        for (const [key, fn] of Object.entries(hooks)) {
            if (typeof fn === 'function') {
                const originalFn = fn;
                hooks[key] = function (...args) {
                    try {
                        return originalFn.apply(this, args);
                    } catch (error) {
                        ErrorHandler.captureError(error, `KSSS_UI_HOOKS.${key}`);
                        throw error;
                    }
                };
            }
        }

        // Expose hooks globally
        window.KSSS_UI_HOOKS = Object.freeze(hooks);

        // Legacy support
        Object.keys(hooks).forEach(key => {
            window[key] = hooks[key];
        });

        // Theme functions (already imported)
        window.toggleDarkMode = core.theme?.toggleDarkMode;
        window.toggleSidebar = core.theme?.toggleSidebar;

        // Initialize theme
        if (core.theme?.initTheme) core.theme.initTheme();

        // Initialize debug panel was already called at the start
        // (keeps the panel alive even if some modules failed to load)

        // Start session verification
        if (authModule.adminSecurity) {
            authModule.adminSecurity.AdminSecurity.verifySession().catch(err => {
                ErrorHandler.captureError(err, 'verifySession');
            });
        }

        // Expose dropdown refresh functionality globally
        window.__refreshAdminDropdown = async () => {
            if (!apiModule.github || !apiModule.github.getDatabase) return;
            const rtdb = apiModule.github.getDatabase();
            const sel = document.getElementById('admin-name');
            if (!sel) return;
            
            sel.innerHTML = '<option value="">-- Select Your Name --</option>';
            try {
                const snapshot = await rtdb.ref('admins').once('value');
                const admins = snapshot.val() || {};
                
                Object.keys(admins).forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    sel.appendChild(opt);
                });
            } catch (err) {
                console.warn("Failed to fetch admin registry from RTDB", err);
            }
            
            const ftOpt = document.createElement('option');
            ftOpt.value = '__first_time__';
            ftOpt.textContent = '➕ First login on this device';
            sel.appendChild(ftOpt);
        };

        // Populate dropdown immediately
        window.__refreshAdminDropdown();

        console.log("✅ KSSS_UI_HOOKS ready", Object.keys(hooks));
    } catch (error) {
        ErrorHandler.captureError(error, 'bootstrap');
        alert(`Fatal initialization error: ${error.message}\n\nCheck console for details.`);
    }
}

// Start the app
initializeApp();

// Clear token on page unload to force logout on reload
window.addEventListener('beforeunload', () => {
    sessionStorage.removeItem("githubToken");
});

// Event delegation with logging
document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        if (!action) return;
        console.log(`📢 Click on data-action: "${action}"`, target);
        if (window.KSSS_UI_HOOKS && typeof window.KSSS_UI_HOOKS[action] === 'function') {
            e.preventDefault();
            let params = [];
            if (target.dataset.params) {
                try {
                    params = JSON.parse(target.dataset.params);
                    if (!Array.isArray(params)) params = [params];
                } catch (err) {
                    console.warn(`Invalid params for action ${action}:`, err);
                    return;
                }
            }
            window.KSSS_UI_HOOKS[action](...params);
        } else {
            console.warn(`No function found for action: ${action}`);
        }
    });
});