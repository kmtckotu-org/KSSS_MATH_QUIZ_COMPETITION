// admin/src/debug.js — Full Audit Debug Panel v4.0
import { store } from './core/store.js';
import { ErrorHandler } from './utils/errorHandler.js';
import { CONFIG } from './core/config.js';

let debugPanel  = null;
let debugToggle = null;
let currentTab  = 'overview';
let debugInterval = null;

const TAB_DEFS = [
    { id: 'overview', label: '📊',  title: 'Overview'  },
    { id: 'session',  label: '🔐',  title: 'Session'   },
    { id: 'firebase', label: '🔥',  title: 'Firebase'  },
    { id: 'hooks',    label: '🪝',  title: 'Hooks'     },
    { id: 'store',    label: '📦',  title: 'Store'     },
    { id: 'data',     label: '🏆',  title: 'Data'      },
    { id: 'errors',   label: '🚨',  title: 'Errors'    },
    { id: 'history',  label: '📝',  title: 'History'   },
];

// ── CSS injected once ──────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('debug-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'debug-panel-styles';
    style.textContent = `
        #debug-panel {
            font-family: 'Fira Code', 'Cascadia Code', 'Segoe UI', monospace !important;
        }
        #debug-panel * { box-sizing: border-box; }
        #debug-panel::-webkit-scrollbar { width: 4px; }
        #debug-panel::-webkit-scrollbar-track { background: #0f172a; }
        #debug-panel::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
        .dp-tab-scroll::-webkit-scrollbar { height: 0; }
        .dp-content::-webkit-scrollbar { width: 4px; }
        .dp-content::-webkit-scrollbar-track { background: transparent; }
        .dp-content::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
        .dp-tab-wrap {
            display: flex;
            overflow-x: auto;
            overflow-y: hidden;
            background: #0c1526;
            border-bottom: 1px solid #1e293b;
            flex-shrink: 0;
            scroll-behavior: smooth;
            -webkit-overflow-scrolling: touch;
            user-select: none;
            cursor: grab;
            gap: 2px;
            padding: 4px 6px;
        }
        .dp-tab-wrap::-webkit-scrollbar { height: 0; }
        .dp-tab-wrap.dragging { cursor: grabbing; }
        .dp-tab-btn {
            flex-shrink: 0;
            background: transparent;
            color: #475569;
            border: 1px solid transparent;
            border-radius: 6px;
            padding: 5px 9px;
            cursor: pointer;
            font-size: 10px;
            font-weight: 600;
            white-space: nowrap;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            gap: 5px;
            line-height: 1.2;
            font-family: inherit;
        }
        .dp-tab-btn .dp-tab-icon { font-size: 13px; }
        .dp-tab-btn .dp-tab-lbl  { font-size: 10px; letter-spacing: 0.02em; }
        .dp-tab-btn:hover  { background: #1e293b; color: #94a3b8; }
        .dp-tab-btn.active { background: rgba(59,130,246,0.18); color: #60a5fa; border-color: rgba(59,130,246,0.4); }
        .dp-row {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 6px 0;
            border-bottom: 1px solid #1e293b;
            font-size: 11px;
            line-height: 1.5;
        }
        .dp-row:last-child { border-bottom: none; }
        .dp-label {
            color: #64748b;
            min-width: 100px;
            flex-shrink: 0;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            padding-top: 1px;
        }
        .dp-val { color: #cbd5e1; word-break: break-all; flex: 1; }
        .dp-val.ok { color: #4ade80; }
        .dp-val.warn { color: #fbbf24; }
        .dp-val.err { color: #f87171; }
        .dp-card {
            background: #0c1526;
            border: 1px solid #1e293b;
            border-radius: 8px;
            padding: 10px 12px;
            margin-bottom: 8px;
        }
        .dp-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.04em;
        }
        .dp-badge.green  { background: rgba(74,222,128,0.15); color: #4ade80; border: 1px solid rgba(74,222,128,0.3); }
        .dp-badge.yellow { background: rgba(251,191,36,0.15);  color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
        .dp-badge.red    { background: rgba(248,113,113,0.15); color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
        .dp-badge.blue   { background: rgba(96,165,250,0.15);  color: #60a5fa; border: 1px solid rgba(96,165,250,0.3); }
        .dp-action-btn {
            background: #1e293b;
            color: #94a3b8;
            border: 1px solid #334155;
            padding: 5px 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 10px;
            font-weight: 600;
            transition: all 0.15s;
            font-family: inherit;
        }
        .dp-action-btn:hover { background: #2d3f5e; color: #e2e8f0; border-color: #60a5fa; }
        .dp-action-btn.danger { border-color: #dc2626; color: #f87171; }
        .dp-action-btn.danger:hover { background: rgba(220,38,38,0.2); color: #fca5a5; }
        .dp-title-bar {
            background: linear-gradient(135deg, #0f172a 0%, #0c1526 100%);
            border-bottom: 1px solid #1e3a5f;
        }
        @keyframes dp-pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        .dp-live-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: #4ade80;
            animation: dp-pulse 2s ease-in-out infinite;
            display: inline-block;
            margin-right: 4px;
        }
    `;
    document.head.appendChild(style);
}

// ── Init ──────────────────────────────────────────────────────────
export function initDebugPanel() {
    if (!CONFIG.debug) return;

    // ── Role gate: only absolute admins see the panel ──
    let isAbsolute = false;
    try {
        const roleObj = JSON.parse(sessionStorage.getItem('secureAdminRole') || '{}');
        isAbsolute = roleObj?.role === 'absolute';
    } catch {}
    if (!isAbsolute) return;

    // Don't re-mount if already present
    if (document.getElementById('debug-toggle')) return;

    injectStyles();

    // ── The faint trigger button ───────────────────────
    debugToggle = document.createElement('button');
    debugToggle.id    = 'debug-toggle';
    debugToggle.title = 'Toggle debug panel (Absolute Admin only)';
    debugToggle.innerHTML = '🐞';
    debugToggle.style.cssText = `
        position: fixed;
        bottom: 12px;
        left: 12px;
        z-index: 10002;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(100, 116, 139, 0.15);
        border: 1px solid rgba(100, 116, 139, 0.2);
        color: rgba(255,255,255,0.3);
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        opacity: 0.4;
        transition: opacity 0.2s, background 0.2s, transform 0.2s;
        line-height: 1;
    `;
    debugToggle.onmouseover = () => {
        debugToggle.style.opacity  = '1';
        debugToggle.style.background = 'rgba(59,130,246,0.6)';
        debugToggle.style.transform  = 'scale(1.15)';
    };
    debugToggle.onmouseout = () => {
        debugToggle.style.opacity  = '0.4';
        debugToggle.style.background = 'rgba(100,116,139,0.15)';
        debugToggle.style.transform  = 'scale(1)';
    };

    // ── Panel shell ───────────────────────────────────
    debugPanel = document.createElement('div');
    debugPanel.id = 'debug-panel';
    debugPanel.style.cssText = `
        position: fixed;
        bottom: 50px;
        left: 12px;
        width: 460px;
        max-width: calc(100vw - 24px);
        max-height: 68vh;
        overflow: hidden;
        background: #0f172a;
        color: #e2e8f0;
        border-radius: 14px;
        z-index: 10001;
        border: 1px solid #1e3a5f;
        box-shadow: 0 25px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(96,165,250,0.08);
        display: none;
        flex-direction: column;
        backdrop-filter: blur(12px);
    `;

    debugToggle.onclick = () => {
        const isOpen = debugPanel.style.display !== 'none';
        debugPanel.style.display = isOpen ? 'none' : 'flex';
        if (!isOpen) renderPanel();
    };

    document.body.appendChild(debugToggle);
    document.body.appendChild(debugPanel);

    // Auto-refresh when visible
    if (debugInterval) clearInterval(debugInterval);
    debugInterval = setInterval(() => {
        if (debugPanel && debugPanel.style.display !== 'none') renderPanel();
    }, 2000);

    // Flash on error
    ErrorHandler.onError(() => {
        if (debugPanel && debugPanel.style.display !== 'none') renderPanel();
        flashToggle();
    });
}

// Clean up interval on page unload
window.addEventListener('beforeunload', () => {
    if (debugInterval) clearInterval(debugInterval);
});

function flashToggle() {
    if (!debugToggle) return;
    debugToggle.style.background   = 'rgba(220,38,38,0.7)';
    debugToggle.style.borderColor  = '#ef4444';
    debugToggle.style.opacity      = '1';
    setTimeout(() => {
        debugToggle.style.background  = 'rgba(100,116,139,0.15)';
        debugToggle.style.borderColor = 'rgba(100,116,139,0.2)';
        debugToggle.style.opacity     = '0.4';
    }, 2000);
}

// ── Diagnostic Helpers ────────────────────────────────────────────

/**
 * Read the real admin role from sessionStorage.
 * The role is stored as a signed JSON object under 'secureAdminRole',
 * NOT as a plain string under 'adminRole'.
 */
function getAdminRole() {
    try {
        const raw = sessionStorage.getItem('secureAdminRole');
        if (!raw) return null;
        const obj = JSON.parse(raw);
        return obj?.role || null;
    } catch {
        return null;
    }
}

function checkSession() {
    const token = sessionStorage.getItem('githubToken') || null;
    const user  = sessionStorage.getItem('adminUser')   || null;
    const role  = getAdminRole();
    return { token, user, role };
}

function checkFirebase() {
    try {
        if (!window.firebase)
            return { ok: false, msg: 'window.firebase not found — SDK not loaded' };
        if (!window.firebase.apps?.length)
            return { ok: false, msg: 'Firebase app not initialized' };
        const db = window.firebase.database();
        if (!db)
            return { ok: false, msg: 'firebase.database() returned null' };
        return { ok: true, msg: `Connected · App: ${window.firebase.apps[0].name}` };
    } catch (e) {
        return { ok: false, msg: e.message };
    }
}

function checkData() {
    const d = store.getCurrentData();
    if (!d) return { ok: false, msg: 'No tournament data loaded', rounds: 0, matches: 0, grade: null };
    const rounds    = d.rounds?.length ?? 0;
    const matches   = (d.rounds || []).reduce((s, r) => s + (r.matches?.length ?? 0), 0);
    const completed = (d.rounds || []).reduce((s, r) => s + (r.matches || []).filter(m => m.winner && m.winner !== 'Pending').length, 0);
    return { ok: true, msg: 'Data loaded', grade: d.grade, rounds, matches, completed };
}

function checkHooks() {
    const hooks = window.KSSS_UI_HOOKS;
    if (!hooks) return { count: 0, list: [], isProxy: false };
    const keys    = Object.keys(hooks);
    const isProxy = keys.length === 0;
    return { count: keys.length, list: keys, isProxy };
}

// ── Tab Renderers ─────────────────────────────────────────────────

function renderOverview() {
    const fb    = checkFirebase();
    const sess  = checkSession();
    const data  = checkData();
    const hooks = checkHooks();
    const errors = ErrorHandler.errors.length;
    const role  = sess.role;

    const badge = (text, type) => `<span class="dp-badge ${type}">${text}</span>`;

    const row = (label, statusOk, value, extra = '') => `
        <div class="dp-row">
            <span class="dp-label">${label}</span>
            <span class="dp-val ${statusOk ? 'ok' : 'err'}" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                ${statusOk ? '✅' : '❌'} ${value}
                ${extra}
            </span>
        </div>`;

    const roleBadge = role
        ? (role === 'absolute'
            ? badge('⭐ ABSOLUTE', 'yellow')
            : badge('LIMITED', 'blue'))
        : badge('NOT SET', 'red');

    return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
            <span class="dp-live-dot"></span>
            <span style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;">
                Live Audit · ${new Date().toLocaleTimeString()}
            </span>
        </div>
        <div class="dp-card">
            ${row('Admin', !!sess.user,  sess.user  || 'Not authenticated')}
            ${row('Role',  !!role,       role ? role.toUpperCase() : 'None', roleBadge)}
            ${row('Token', !!sess.token, sess.token ? `Present (${sess.token.length} chars)` : 'Missing — not logged in')}
        </div>
        <div class="dp-card">
            ${row('Firebase', fb.ok,    fb.msg)}
            ${row('UI Hooks', !hooks.isProxy && hooks.count > 0,
                hooks.isProxy ? 'Boot proxy (loading…)' : `${hooks.count} hooks ready`)}
            ${row('Match Data', data.ok, data.ok
                ? `Grade ${data.grade} · ${data.rounds} rounds · ${data.matches} matches (${data.completed} done)`
                : data.msg)}
            ${row('Errors', errors === 0, errors === 0 ? 'Clean' : `${errors} captured`, errors > 0 ? badge(`${errors} ERR`, 'red') : '')}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;">
            <button class="dp-action-btn" onclick="window.__debugRunFullTest()">⚡ Run Full Test</button>
            <button class="dp-action-btn" onclick="window.__debugSelectTab('errors')">🚨 View Errors</button>
            <button class="dp-action-btn" onclick="localStorage.setItem('ksss_debug','true');location.reload()">🟢 Debug ON</button>
            <button class="dp-action-btn" onclick="localStorage.setItem('ksss_debug','false');location.reload()">⭕ Debug OFF</button>
        </div>`;
}

function renderSession() {
    const s    = checkSession();
    const role = s.role;

    const roleColor = role === 'absolute' ? '#fbbf24' : role ? '#60a5fa' : '#f87171';
    const roleTxt   = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'None (not logged in)';

    // Parse the raw secureAdminRole object for inspection
    let secureRoleRaw = '—';
    try {
        const raw = sessionStorage.getItem('secureAdminRole');
        if (raw) {
            const obj = JSON.parse(raw);
            secureRoleRaw = `role=${obj.role} · nonce=${obj.nonce?.slice(0,6)}… · sig=${obj.hash?.slice(0,12)}…`;
        }
    } catch {}

    return `
        <div class="dp-card">
            <div class="dp-row">
                <span class="dp-label">Admin User</span>
                <span class="dp-val ${s.user ? 'ok' : 'err'}">${s.user || '&lt;none&gt;'}</span>
            </div>
            <div class="dp-row">
                <span class="dp-label">Role</span>
                <span class="dp-val" style="color:${roleColor};font-weight:700;">${roleTxt}</span>
            </div>
            <div class="dp-row">
                <span class="dp-label">Signed Blob</span>
                <span class="dp-val" style="color:#64748b;font-size:10px;">${secureRoleRaw}</span>
            </div>
            <div class="dp-row">
                <span class="dp-label">Auth Token</span>
                <span class="dp-val ${s.token ? 'ok' : 'err'}">
                    ${s.token ? `✅ Present (${s.token.length} chars)` : '❌ Not set'}
                </span>
            </div>
            <div class="dp-row">
                <span class="dp-label">Token Preview</span>
                <span class="dp-val" style="color:#64748b;font-size:10px;">
                    ${s.token ? s.token.slice(0, 4) + '…' + s.token.slice(-4) : '—'}
                </span>
            </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="dp-action-btn danger" onclick="sessionStorage.clear();location.reload();">🔴 Force Logout</button>
            <button class="dp-action-btn" onclick="
                const o = {user:sessionStorage.getItem('adminUser'), secureRole:sessionStorage.getItem('secureAdminRole'), token:sessionStorage.getItem('githubToken')};
                console.table(o); console.log('secureAdminRole parsed:', JSON.parse(o.secureRole||'null'));
            ">📋 Log to Console</button>
        </div>`;
}

function renderFirebase() {
    const fb = checkFirebase();
    let html = `
        <div class="dp-card">
            <div class="dp-row">
                <span class="dp-label">Status</span>
                <span class="dp-val ${fb.ok ? 'ok' : 'err'}">${fb.ok ? '✅' : '❌'} ${fb.msg}</span>
            </div>`;

    if (window.firebase?.apps?.length) {
        const cfg = window.firebase.apps[0].options;
        html += `
            <div class="dp-row">
                <span class="dp-label">Project</span>
                <span class="dp-val" style="color:#67e8f9;">${cfg.projectId}</span>
            </div>
            <div class="dp-row">
                <span class="dp-label">DB URL</span>
                <span class="dp-val" style="color:#67e8f9;font-size:10px;">${cfg.databaseURL}</span>
            </div>
            <div class="dp-row">
                <span class="dp-label">Auth Domain</span>
                <span class="dp-val" style="color:#67e8f9;font-size:10px;">${cfg.authDomain}</span>
            </div>`;
    }

    html += `</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="dp-action-btn" onclick="window.__debugTestFirebaseRead()">🔥 Test DB Read</button>
            <button class="dp-action-btn" onclick="
                firebase.database().ref('admins').once('value')
                    .then(s => { console.log('RTDB admins:', s.val()); alert('Admins node logged to console.'); })
                    .catch(e => alert('Error: '+e.message));
            ">👤 List Admins Node</button>
        </div>`;
    return html;
}

function renderHooks() {
    const hooks = checkHooks();
    if (hooks.isProxy) return `<div style="color:#fbbf24;padding:8px 0;">⚠️ KSSS_UI_HOOKS is still the boot proxy. Modules haven't finished loading.</div>`;
    if (hooks.count === 0)  return `<div style="color:#f87171;padding:8px 0;">❌ No hooks registered. Initialization likely failed — check console for errors.</div>`;
    return `
        <div style="color:#4ade80;margin-bottom:10px;font-size:11px;">✅ ${hooks.count} hooks registered</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;">
            ${hooks.list.map(k => `
                <div style="padding:4px 6px;background:#0c1526;border-radius:4px;color:#93c5fd;font-size:10px;">→ ${k}</div>
            `).join('')}
        </div>`;
}

function renderStore() {
    const s = store.state;
    const entries = Object.entries(s);
    if (!entries.length) return `<div style="color:#64748b;padding:8px 0;">Store is empty.</div>`;
    return entries.map(([k, v]) => {
        let display;
        if (v === null)              display = `<span style="color:#475569">null</span>`;
        else if (typeof v === 'object') {
            const str = JSON.stringify(v);
            display = `<span style="color:#f472b6">${str.length > 100 ? str.slice(0, 100) + '…' : str}</span>`;
        } else {
            display = `<span style="color:#a5f3fc">${String(v)}</span>`;
        }
        return `
            <div class="dp-row">
                <span class="dp-label">${k}</span>
                <span class="dp-val" style="word-break:break-all;">${display}</span>
            </div>`;
    }).join('');
}

function renderData() {
    const d = checkData();
    if (!d.ok) return `<div class="dp-card" style="color:#f87171;">❌ ${d.msg}</div>`;

    const raw = store.getCurrentData();
    const pct = d.matches ? Math.round(d.completed / d.matches * 100) : 0;

    return `
        <div class="dp-card">
            <div class="dp-row"><span class="dp-label">Grade</span><span class="dp-val ok">${d.grade}</span></div>
            <div class="dp-row"><span class="dp-label">Rounds</span><span class="dp-val">${d.rounds}</span></div>
            <div class="dp-row"><span class="dp-label">Matches</span><span class="dp-val">${d.matches}</span></div>
            <div class="dp-row">
                <span class="dp-label">Progress</span>
                <span class="dp-val">
                    <span style="color:#4ade80;">${d.completed}</span>
                    <span style="color:#475569;"> / ${d.matches} done</span>
                    <span style="color:#fbbf24;margin-left:4px;">(${pct}%)</span>
                </span>
            </div>
        </div>
        <div style="margin-bottom:8px;">
        ${(raw.rounds || []).map((r) => {
            const done = r.matches.filter(m => m.winner && m.winner !== 'Pending').length;
            const rPct = r.matches.length ? Math.round(done / r.matches.length * 100) : 0;
            return `
                <div class="dp-row">
                    <span class="dp-label" style="min-width:80px;">${r.name}</span>
                    <span style="flex:1;">
                        <div style="background:#1e293b;border-radius:4px;height:6px;overflow:hidden;margin-bottom:3px;">
                            <div style="background:${rPct===100?'#4ade80':'#3b82f6'};width:${rPct}%;height:100%;transition:width 0.3s;"></div>
                        </div>
                        <span style="color:#94a3b8;font-size:10px;">${done}/${r.matches.length} · ${rPct}% · </span>
                        <span style="color:${r.status==='locked'?'#f59e0b':'#4ade80'};font-size:10px;">${r.status==='locked'?'🔒 Locked':'🔓 Active'}</span>
                    </span>
                </div>`;
        }).join('')}
        </div>
        <button class="dp-action-btn" onclick="console.log('Full data:',JSON.parse(JSON.stringify(window.KSSS_UI_HOOKS||{})))">📋 Log Raw Data</button>`;
}

function renderErrors() {
    const errs = ErrorHandler.errors;
    if (!errs.length) return `<div style="color:#4ade80;padding:8px 0;">✅ No errors captured yet. Looking good!</div>`;

    return `
        <div style="color:#f87171;margin-bottom:8px;font-size:11px;">${errs.length} error(s) captured:</div>
        <div class="dp-content" style="max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
        ${[...errs].reverse().map(e => `
            <div style="background:#160a0a;border-left:3px solid #ef4444;padding:8px 10px;border-radius:0 6px 6px 0;">
                <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                    <span style="color:#fca5a5;font-weight:700;font-size:10px;">${e.source || 'unknown'}</span>
                    <span style="color:#6b7280;font-size:9px;">${e.timestamp?.substring(11,19) || '?'}</span>
                </div>
                <div style="color:#fecaca;font-size:10px;word-break:break-word;">${e.message}</div>
            </div>`).join('')}
        </div>
        <button class="dp-action-btn danger" style="margin-top:8px;" onclick="ErrorHandler.clearErrors()">🗑️ Clear All Errors</button>`;
}

function renderHistory() {
    const hist = store.getChangeHistory?.() || [];
    if (!hist.length) return `<div style="color:#64748b;padding:8px 0;">No state changes recorded yet.</div>`;

    return `
        <div style="color:#64748b;font-size:10px;margin-bottom:8px;">${hist.length} state change(s) — latest first</div>
        <div class="dp-content" style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
        ${[...hist].reverse().slice(0, 50).map(h => `
            <div class="dp-row" style="padding:4px 0;">
                <span style="color:#818cf8;flex-shrink:0;min-width:90px;font-size:10px;">${h.key || '?'}</span>
                <span style="color:#475569;font-size:10px;">via</span>
                <span style="color:#fbbf24;font-size:10px;">${h.source || '?'}</span>
            </div>`).join('')}
        </div>
        <button class="dp-action-btn" style="margin-top:8px;" onclick="store.clearHistory?.();renderPanel?.()">🗑️ Clear History</button>`;
}

// ── Main Render ───────────────────────────────────────────────────

function renderPanel() {
    if (!debugPanel) return;
    const errorCount = ErrorHandler.errors.length;
    const sess       = checkSession();
    const roleLabel  = sess.role ? sess.role.toUpperCase() : 'NO ROLE';
    const roleColor  = sess.role === 'absolute' ? '#fbbf24' : sess.role ? '#60a5fa' : '#ef4444';

    const tabBar = TAB_DEFS.map(t => {
        const isActive = currentTab === t.id;
        return `<button
            id="dp-tab-${t.id}"
            onclick="window.__debugSelectTab('${t.id}')"
            title="${t.title}"
            style="
                flex-shrink:0;
                display:inline-flex;
                align-items:center;
                gap:4px;
                padding:5px 10px;
                border-radius:6px;
                border:1px solid ${isActive ? 'rgba(59,130,246,0.45)' : 'transparent'};
                background:${isActive ? 'rgba(59,130,246,0.18)' : 'transparent'};
                color:${isActive ? '#60a5fa' : '#475569'};
                cursor:pointer;
                font-size:10px;
                font-weight:600;
                white-space:nowrap;
                font-family:inherit;
                transition:all 0.15s;
                line-height:1.3;
            "
            onmouseover="if(this.id!=='dp-tab-${currentTab}'){this.style.background='#1e293b';this.style.color='#94a3b8';}"
            onmouseout="if(this.id!=='dp-tab-${currentTab}'){this.style.background='transparent';this.style.color='#475569';}">
            <span style="font-size:13px;">${t.label}</span>
            <span style="font-size:10px;">${t.title}</span>
        </button>`;
    }).join('');

    let body = '';
    switch (currentTab) {
        case 'overview': body = renderOverview(); break;
        case 'session':  body = renderSession();  break;
        case 'firebase': body = renderFirebase(); break;
        case 'hooks':    body = renderHooks();    break;
        case 'store':    body = renderStore();    break;
        case 'data':     body = renderData();     break;
        case 'errors':   body = renderErrors();   break;
        case 'history':  body = renderHistory();  break;
    }

    debugPanel.innerHTML = `
        <div class="dp-title-bar" style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            padding:10px 14px;
            border-bottom:1px solid #1e3a5f;
            flex-shrink:0;
            border-radius:14px 14px 0 0;
        ">
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:15px;">🐞</span>
                <div>
                    <div style="font-weight:700;color:#e2e8f0;font-size:12px;letter-spacing:0.03em;">Debug Console <span style="color:#334155;">v4.1</span></div>
                    <div style="font-size:9px;color:${roleColor};font-weight:600;letter-spacing:0.06em;">${roleLabel}</div>
                </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
                ${errorCount > 0 ? `<span class="dp-badge red">${errorCount} ERR</span>` : ''}
                <span class="dp-live-dot" title="Auto-refreshing every 2s"></span>
                <button
                    onclick="document.getElementById('debug-panel').style.display='none'"
                    style="background:transparent;color:#475569;border:none;cursor:pointer;font-size:18px;line-height:1;padding:0;transition:color 0.15s;"
                    onmouseover="this.style.color='#e2e8f0'"
                    onmouseout="this.style.color='#475569'"
                >✕</button>
            </div>
        </div>
        <div id="dp-tab-wrap" style="display:flex;overflow-x:auto;overflow-y:hidden;padding:5px 6px;gap:3px;background:#0c1526;border-bottom:1px solid #1e293b;flex-shrink:0;-webkit-overflow-scrolling:touch;scrollbar-width:none;user-select:none;cursor:grab;">${tabBar}</div>
        <div style="padding:12px 14px;overflow-y:auto;flex:1;">${body}</div>`;

    // Wire up global callbacks
    window.__debugSelectTab = (tab) => {
        currentTab = tab;
        renderPanel();
        // Auto-scroll active tab button into view
        requestAnimationFrame(() => {
            const wrap = document.getElementById('dp-tab-wrap');
            const active = wrap?.querySelector('.dp-tab-btn.active');
            if (active && wrap) {
                const wrapRect   = wrap.getBoundingClientRect();
                const btnRect    = active.getBoundingClientRect();
                const offset     = btnRect.left - wrapRect.left - (wrapRect.width / 2) + (btnRect.width / 2);
                wrap.scrollBy({ left: offset, behavior: 'smooth' });
            }
        });
    };
    window.__debugRunFullTest      = runFullTest;
    window.__debugTestFirebaseRead = testFirebaseRead;

    // Drag-to-scroll on the tab bar
    requestAnimationFrame(() => {
        const wrap = document.getElementById('dp-tab-wrap');
        if (!wrap || wrap._dragBound) return;
        wrap._dragBound = true;
        let isDown = false, startX = 0, scrollLeft = 0;
        wrap.addEventListener('mousedown', e => {
            isDown = true;
            wrap.classList.add('dragging');
            startX = e.pageX - wrap.offsetLeft;
            scrollLeft = wrap.scrollLeft;
        });
        wrap.addEventListener('mouseleave', () => { isDown = false; wrap.classList.remove('dragging'); });
        wrap.addEventListener('mouseup',    () => { isDown = false; wrap.classList.remove('dragging'); });
        wrap.addEventListener('mousemove',  e => {
            if (!isDown) return;
            e.preventDefault();
            const x    = e.pageX - wrap.offsetLeft;
            const walk = (x - startX) * 1.5;
            wrap.scrollLeft = scrollLeft - walk;
        });
    });
    // Scroll active tab into view on initial render
    requestAnimationFrame(() => {
        const wrap = document.getElementById('dp-tab-wrap');
        const active = wrap?.querySelector('.dp-tab-btn.active');
        if (active && wrap) {
            const wrapRect = wrap.getBoundingClientRect();
            const btnRect  = active.getBoundingClientRect();
            const offset   = btnRect.left - wrapRect.left - (wrapRect.width / 2) + (btnRect.width / 2);
            wrap.scrollBy({ left: offset, behavior: 'smooth' });
        }
    });
}

// ── Tests ─────────────────────────────────────────────────────────

async function runFullTest() {
    const results = [];

    const h = checkHooks();
    results.push({ label: 'KSSS_UI_HOOKS',    ok: !h.isProxy && h.count > 0, detail: `${h.count} hooks` });

    const fb = checkFirebase();
    results.push({ label: 'Firebase SDK',     ok: fb.ok,   detail: fb.msg });

    const s = checkSession();
    results.push({ label: 'Auth Token',       ok: !!s.token, detail: s.token ? 'Present' : 'Missing' });
    results.push({ label: 'Admin Role',       ok: !!s.role,  detail: s.role || 'None — check secureAdminRole in sessionStorage' });

    const d = checkData();
    results.push({ label: 'Tournament Data',  ok: d.ok,    detail: d.msg });

    ['login-section','grade-section','matches-list'].forEach(id => {
        results.push({ label: `DOM: #${id}`, ok: !!document.getElementById(id), detail: document.getElementById(id) ? 'Found' : 'MISSING' });
    });
    results.push({ label: 'exportToPDF hook', ok: typeof window.KSSS_UI_HOOKS?.exportToPDF === 'function', detail: '' });
    results.push({ label: 'exportToCSV hook', ok: typeof window.KSSS_UI_HOOKS?.exportToCSV === 'function', detail: '' });
    results.push({ label: 'Error count',      ok: ErrorHandler.errors.length === 0, detail: `${ErrorHandler.errors.length} error(s)` });

    console.group('🐞 Full Debug Test Results — v4.0');
    results.forEach(r => {
        const m = `${r.ok ? '✅' : '❌'} ${r.label}${r.detail ? ': ' + r.detail : ''}`;
        r.ok ? console.log(m) : console.error(m);
    });
    console.groupEnd();

    const pass = results.filter(r => r.ok).length;
    alert(`Full Test: ${pass}/${results.length} passed.\n\nSee the browser console (F12) for the breakdown!`);
}

async function testFirebaseRead() {
    try {
        if (!window.firebase)          throw new Error('window.firebase not found');
        if (!window.firebase.apps.length) throw new Error('Firebase not initialized');
        const snap = await window.firebase.database().ref('competition/grade7').once('value');
        if (snap.exists()) {
            console.log('🔥 Firebase read success (grade7):', snap.val());
            alert('✅ Firebase read succeeded! Grade 7 data found. Check console.');
        } else {
            alert('⚠️ Firebase connected but grade7 node has no data yet.');
        }
    } catch (e) {
        console.error('❌ Firebase test failed:', e);
        alert('❌ Firebase test failed: ' + e.message);
    }
}