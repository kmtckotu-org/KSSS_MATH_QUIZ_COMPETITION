// admin/src/debug.js — Full Audit Debug Panel v3.0
import { store } from './core/store.js';
import { ErrorHandler } from './utils/errorHandler.js';
import { CONFIG } from './core/config.js';

let debugPanel = null;
let debugToggle = null;
let currentTab = 'overview';

const TAB_DEFS = [
    { id: 'overview',   label: '📊 Overview'  },
    { id: 'hooks',      label: '🪝 Hooks'     },
    { id: 'store',      label: '📦 Store'     },
    { id: 'firebase',   label: '🔥 Firebase'  },
    { id: 'session',    label: '🔐 Session'   },
    { id: 'data',       label: '🏆 Data'      },
    { id: 'errors',     label: '🚨 Errors'    },
    { id: 'history',    label: '📝 History'   },
];

export function initDebugPanel() {
    if (!CONFIG.debug) return;

    // Check role
    let isAbsolute = false;
    try {
        const roleObj = JSON.parse(sessionStorage.getItem('secureAdminRole') || '{}');
        isAbsolute = roleObj.role === 'absolute';
    } catch {}
    if (!isAbsolute) return;
    // Don't mount twice
    if (document.getElementById('debug-toggle')) return;

    // ── Toggle Button: always a small circle in the bottom-left ──────
    debugToggle = document.createElement('button');
    debugToggle.id = 'debug-toggle';
    debugToggle.innerHTML = '🐞';
    debugToggle.title = 'Toggle debug panel';
    debugToggle.style.cssText = `
        position: fixed;
        bottom: 10px;
        left: 10px;
        z-index: 10002;
        background: rgba(100, 116, 139, 0.2);
        color: rgba(255, 255, 255, 0.4);
        border: 1px solid rgba(100, 116, 139, 0.3);
        width: 32px;
        height: 32px;
        border-radius: 50%;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        opacity: 0.5;
    `;
    debugToggle.onmouseover = () => {
        debugToggle.style.opacity = '1';
        debugToggle.style.background = 'rgba(100, 116, 139, 0.8)';
    };
    debugToggle.onmouseout = () => {
        debugToggle.style.opacity = '0.5';
        debugToggle.style.background = 'rgba(100, 116, 139, 0.2)';
    };

    // ── Panel: compact floating card, left side, NOT full width ──────
    debugPanel = document.createElement('div');
    debugPanel.id = 'debug-panel';
    debugPanel.style.cssText = `
        position: fixed;
        bottom: 72px;
        left: 12px;
        width: 380px;
        max-width: calc(100vw - 24px);
        max-height: 60vh;
        overflow: hidden;
        background: #0f172a;
        color: #e2e8f0;
        font-family: 'Fira Code', 'Segoe UI', monospace;
        font-size: 11px;
        border-radius: 12px;
        z-index: 10001;
        border: 1px solid #1e40af;
        box-shadow: 0 20px 60px rgba(0,0,0,0.7);
        display: none;
        flex-direction: column;
    `;

    debugToggle.onclick = () => {
        const isVisible = debugPanel.style.display !== 'none';
        debugPanel.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) renderPanel();
    };

    document.body.appendChild(debugToggle);
    document.body.appendChild(debugPanel);

    // Auto-refresh every 2 seconds when visible
    setInterval(() => {
        if (debugPanel.style.display !== 'none') renderPanel();
    }, 2000);

    // Flash red on error
    ErrorHandler.onError(() => {
        if (debugPanel.style.display !== 'none') renderPanel();
        flashToggle();
    });
}

function flashToggle() {
    if (!debugToggle) return;
    debugToggle.style.background = '#dc2626';
    debugToggle.style.borderColor = '#ef4444';
    setTimeout(() => {
        debugToggle.style.background = '#1e40af';
        debugToggle.style.borderColor = '#3b82f6';
    }, 1500);
}

// ── Diagnostic Helpers ────────────────────────────────────────────

function checkFirebase() {
    try {
        if (!window.firebase) return { ok: false, msg: 'window.firebase not found — SDK not loaded' };
        if (!window.firebase.apps || !window.firebase.apps.length) return { ok: false, msg: 'Firebase app not initialized' };
        const db = window.firebase.database();
        if (!db) return { ok: false, msg: 'firebase.database() returned null' };
        return { ok: true, msg: `Connected · App: ${window.firebase.apps[0].name}` };
    } catch (e) {
        return { ok: false, msg: e.message };
    }
}

function checkSession() {
    const token   = sessionStorage.getItem('githubToken') || null;
    const user    = sessionStorage.getItem('adminUser')   || localStorage.getItem('ksss_current_user') || null;
    const role    = sessionStorage.getItem('adminRole')   || null;
    const registry = (() => {
        try { return JSON.parse(localStorage.getItem('ksss_admin_registry') || '[]'); }
        catch { return []; }
    })();
    return { token, user, role, registry };
}

function checkData() {
    const d = store.getCurrentData();
    if (!d) return { ok: false, msg: 'No tournament data loaded', rounds: 0, matches: 0, grade: null };
    const rounds  = d.rounds?.length ?? 0;
    const matches = (d.rounds || []).reduce((s, r) => s + (r.matches?.length ?? 0), 0);
    const completed = (d.rounds || []).reduce((s, r) => s + (r.matches || []).filter(m => m.winner && m.winner !== 'Pending').length, 0);
    return { ok: true, msg: 'Data loaded', grade: d.grade, rounds, matches, completed };
}

function checkHooks() {
    const hooks = window.KSSS_UI_HOOKS;
    if (!hooks) return { count: 0, list: [], isProxy: false };
    const keys = Object.keys(hooks);
    // Determine if it is still the boot proxy or the real hooks
    const isProxy = keys.length === 0;
    return { count: keys.length, list: keys, isProxy };
}

// ── Tab Renderers ─────────────────────────────────────────────────

function renderOverview() {
    const fb      = checkFirebase();
    const sess    = checkSession();
    const data    = checkData();
    const hooks   = checkHooks();
    const errors  = ErrorHandler.errors.length;

    const row = (label, ok, msg) => `
        <div style="display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid #1e293b;">
            <span style="color:${ok ? '#4ade80' : '#f87171'};font-size:14px;">${ok ? '✅' : '❌'}</span>
            <span style="color:#94a3b8;min-width:110px;flex-shrink:0;">${label}</span>
            <span style="color:${ok ? '#d1fae5' : '#fecaca'};word-break:break-all;">${msg}</span>
        </div>`;

    return `
        <div style="font-weight:700;color:#fbbf24;margin-bottom:10px;font-size:13px;">🔎 System Audit — ${new Date().toLocaleTimeString()}</div>
        ${row('Firebase DB', fb.ok, fb.msg)}
        ${row('Session Token', !!sess.token, sess.token ? `Present (${sess.token.length} chars)` : 'Not set — unauthenticated')}
        ${row('Admin User', !!sess.user, sess.user || 'None')}
        ${row('Admin Role', !!sess.role, sess.role || 'None')}
        ${row('Tournament Data', data.ok, data.ok ? `Grade ${data.grade} · ${data.rounds}R · ${data.matches}M (${data.completed} done)` : data.msg)}
        ${row('UI Hooks', !hooks.isProxy && hooks.count > 0, hooks.isProxy ? '⚠️ Boot proxy still active (modules loading…)' : `${hooks.count} hooks registered`)}
        ${row('Error Count', errors === 0, errors === 0 ? 'No errors' : `${errors} error(s) captured`)}
        ${row('Registry', sess.registry.length > 0, sess.registry.length > 0 ? sess.registry.join(', ') : 'No admins registered on this device')}
        <div style="margin-top:10px;display:flex;gap:5px;flex-wrap:wrap;">
            <button onclick="window.__debugRunFullTest()" style="background:#1e40af;color:#bfdbfe;border:none;padding:4px 8px;border-radius:5px;cursor:pointer;font-size:10px;font-weight:600;white-space:nowrap;">⚡ Test</button>
            <button onclick="localStorage.setItem('ksss_debug','true')" style="background:#0f766e;color:#99f6e4;border:none;padding:4px 8px;border-radius:5px;cursor:pointer;font-size:10px;white-space:nowrap;">📌 ON</button>
            <button onclick="localStorage.setItem('ksss_debug','false')" style="background:#4b5563;color:#d1d5db;border:none;padding:4px 8px;border-radius:5px;cursor:pointer;font-size:10px;white-space:nowrap;">📌 OFF</button>
        </div>`;
}

function renderHooks() {
    const hooks = checkHooks();
    if (hooks.isProxy) return `<div style="color:#fbbf24;">⚠️ KSSS_UI_HOOKS is still the boot proxy. Modules haven't finished loading yet.</div>`;
    if (hooks.count === 0) return `<div style="color:#f87171;">❌ No hooks registered at all. Initialization likely failed.</div>`;
    return `
        <div style="color:#4ade80;margin-bottom:8px;">✅ ${hooks.count} hooks registered</div>
        <div style="columns:2;gap:8px;">
            ${hooks.list.map(k => `<div style="padding:2px 0;color:#93c5fd;">→ ${k}</div>`).join('')}
        </div>`;
}

function renderStore() {
    const s = store.state;
    return Object.entries(s).map(([k, v]) => {
        let display;
        if (v === null)               display = '<span style="color:#6b7280">null</span>';
        else if (typeof v === 'object') {
            const str = JSON.stringify(v);
            display = `<span style="color:#f472b6">${str.length > 80 ? str.slice(0,80)+'…' : str}</span>`;
        } else display = `<span style="color:#a5f3fc">${String(v)}</span>`;
        return `<div style="padding:3px 0;border-bottom:1px solid #1e293b;"><span style="color:#94a3b8;">${k}</span>: ${display}</div>`;
    }).join('');
}

function renderFirebase() {
    const fb = checkFirebase();
    let html = `<div style="color:${fb.ok ? '#4ade80':'#f87171'};margin-bottom:10px;">${fb.ok ? '✅' : '❌'} ${fb.msg}</div>`;
    if (window.firebase && window.firebase.apps && window.firebase.apps.length) {
        const app = window.firebase.apps[0];
        const cfg = app.options;
        html += `
            <div style="background:#1e293b;padding:8px;border-radius:6px;line-height:1.8;">
                <div><span style="color:#94a3b8">Project ID:</span> <span style="color:#67e8f9">${cfg.projectId}</span></div>
                <div><span style="color:#94a3b8">Database URL:</span> <span style="color:#67e8f9">${cfg.databaseURL}</span></div>
                <div><span style="color:#94a3b8">Auth Domain:</span> <span style="color:#67e8f9">${cfg.authDomain}</span></div>
            </div>`;
    }
    html += `
        <div style="margin-top:10px;">
            <button onclick="window.__debugTestFirebaseRead()" style="background:#1e40af;color:#bfdbfe;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;">🔥 Test DB Read (Grade 7)</button>
        </div>`;
    return html;
}

function renderSession() {
    const s = checkSession();
    return `
        <div style="line-height:2;background:#1e293b;padding:10px;border-radius:6px;">
            <div><span style="color:#94a3b8">User:</span> <span style="color:#a5f3fc">${s.user || '<none>'}</span></div>
            <div><span style="color:#94a3b8">Role:</span> <span style="color:#a5f3fc">${s.role || '<none>'}</span></div>
            <div><span style="color:#94a3b8">Token:</span> <span style="color:${s.token ? '#4ade80' : '#f87171'}">${s.token ? `✅ Present (${s.token.length} chars)` : '❌ Not set'}</span></div>
            <div><span style="color:#94a3b8">Registry:</span> <span style="color:#fbbf24">${s.registry.length ? s.registry.join(', ') : 'Empty'}</span></div>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;">
            <button onclick="sessionStorage.clear();location.reload();" style="background:#dc2626;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:10px;">🔴 Force Logout</button>
            <button onclick="console.log('Session:',{user:sessionStorage.getItem('adminUser'),role:sessionStorage.getItem('adminRole'),token:sessionStorage.getItem('githubToken')})" style="background:#4b5563;color:#d1d5db;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:10px;">📋 Log Session</button>
        </div>`;
}

function renderData() {
    const d = checkData();
    if (!d.ok) return `<div style="color:#f87171;">❌ ${d.msg}</div>`;
    const raw = store.getCurrentData();
    return `
        <div style="line-height:2;background:#1e293b;padding:10px;border-radius:6px;margin-bottom:8px;">
            <div><span style="color:#94a3b8">Grade:</span> <span style="color:#a5f3fc">${d.grade}</span></div>
            <div><span style="color:#94a3b8">Rounds:</span> <span style="color:#a5f3fc">${d.rounds}</span></div>
            <div><span style="color:#94a3b8">Matches:</span> <span style="color:#a5f3fc">${d.matches}</span></div>
            <div><span style="color:#94a3b8">Completed:</span> <span style="color:#4ade80">${d.completed} / ${d.matches}</span></div>
        </div>
        ${raw.rounds.map((r, i) => {
            const done = r.matches.filter(m => m.winner && m.winner !== 'Pending').length;
            const pct  = r.matches.length ? Math.round(done / r.matches.length * 100) : 0;
            return `<div style="padding:4px 0;border-bottom:1px solid #1e293b;">
                <span style="color:#94a3b8">${r.name}:</span>
                <span style="color:#fbbf24">${done}/${r.matches.length}</span>
                <span style="color:#4b5563"> (${pct}%) </span>
                <span style="color:${r.status==='locked'?'#f59e0b':'#4ade80'}">${r.status==='locked'?'🔒 Locked':'🔓 Active'}</span>
            </div>`;
        }).join('')}
        <div style="margin-top:8px;">
            <button onclick="console.log('Full data snapshot:',JSON.parse(JSON.stringify(window.__store?.getCurrentData?.()||{})))" style="background:#4b5563;color:#d1d5db;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:10px;">📋 Log Raw Data</button>
        </div>`;
}

function renderErrors() {
    const errs = ErrorHandler.errors;
    if (!errs.length) return `<div style="color:#4ade80;">✅ No errors captured yet.</div>`;
    return `
        <div style="color:#f87171;margin-bottom:8px;">${errs.length} error(s) captured:</div>
        <div style="max-height:280px;overflow-y:auto;">
        ${[...errs].reverse().map((e, i) => `
            <div style="background:#1e293b;border-left:3px solid #ef4444;padding:6px 8px;border-radius:4px;margin-bottom:6px;">
                <div style="color:#fca5a5;font-weight:700;font-size:10px;">[${e.timestamp?.substring(11,19)||'?'}] ${e.source}</div>
                <div style="color:#fecaca;margin:2px 0;">${e.message}</div>
            </div>`).join('')}
        </div>
        <button onclick="ErrorHandler.clearErrors();window.dispatchEvent(new Event('debug-refresh'))" style="margin-top:6px;background:#dc2626;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:10px;">🗑️ Clear All Errors</button>`;
}

function renderHistory() {
    const hist = store.getChangeHistory();
    if (!hist.length) return `<div style="color:#94a3b8;">No state changes recorded yet.</div>`;
    return `
        <div style="color:#94a3b8;margin-bottom:6px;">${hist.length} state change(s):</div>
        <div style="max-height:280px;overflow-y:auto;">
        ${[...hist].reverse().slice(0,40).map(h => `
            <div style="padding:4px 0;border-bottom:1px solid #1e293b;">
                <span style="color:#818cf8">${h.key}</span>
                <span style="color:#6b7280"> via </span>
                <span style="color:#fbbf24">${h.source}</span>
            </div>`).join('')}
        </div>
        <button onclick="store.clearHistory?store.clearHistory():null" style="margin-top:6px;background:#4b5563;color:#d1d5db;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:10px;">🗑️ Clear History</button>`;
}

// ── Main Render ───────────────────────────────────────────────────

function renderPanel() {
    if (!debugPanel) return;

    const tabBar = TAB_DEFS.map(t => `
        <button
            onclick="window.__debugSelectTab('${t.id}')"
            style="flex-shrink:0;background:${currentTab===t.id?'#1e40af':'transparent'};color:${currentTab===t.id?'#bfdbfe':'#64748b'};border:none;border-bottom:2px solid ${currentTab===t.id?'#60a5fa':'transparent'};padding:6px 8px;cursor:pointer;font-size:9px;font-weight:700;white-space:nowrap;transition:all 0.15s;">
            ${t.label}
        </button>`).join('');

    const errorCount = ErrorHandler.errors.length;
    let body = '';
    switch (currentTab) {
        case 'overview': body = renderOverview(); break;
        case 'hooks':    body = renderHooks();    break;
        case 'store':    body = renderStore();    break;
        case 'firebase': body = renderFirebase(); break;
        case 'session':  body = renderSession();  break;
        case 'data':     body = renderData();     break;
        case 'errors':   body = renderErrors();   break;
        case 'history':  body = renderHistory();  break;
    }

    debugPanel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #1e293b;background:#0f172a;border-radius:12px 12px 0 0;flex-shrink:0;">
            <span style="font-weight:700;color:#fbbf24;font-size:12px;">🐞 Debug Console v3.0</span>
            <div style="display:flex;gap:6px;align-items:center;">
                ${errorCount > 0 ? `<span style="background:#dc2626;color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700;">${errorCount} ERR</span>` : ''}
                <button onclick="document.getElementById('debug-panel').style.display='none'" style="background:transparent;color:#64748b;border:none;cursor:pointer;font-size:16px;line-height:1;">✕</button>
            </div>
        </div>
        <div style="display:flex;overflow-x:auto;border-bottom:1px solid #1e293b;background:#0c1526;flex-shrink:0;">${tabBar}</div>
        <div style="padding:12px 14px;overflow-y:auto;flex:1;">${body}</div>`;

    // Wire up global callbacks
    window.__debugSelectTab = (tab) => { currentTab = tab; renderPanel(); };
    window.__debugRunFullTest = runFullTest;
    window.__debugTestFirebaseRead = testFirebaseRead;
}

async function runFullTest() {
    const results = [];

    // 1. Hooks
    const h = checkHooks();
    results.push({ label: 'KSSS_UI_HOOKS', ok: !h.isProxy && h.count > 0, detail: `${h.count} hooks` });

    // 2. Firebase
    const fb = checkFirebase();
    results.push({ label: 'Firebase SDK', ok: fb.ok, detail: fb.msg });

    // 3. Session
    const s = checkSession();
    results.push({ label: 'Auth Token', ok: !!s.token, detail: s.token ? 'Present' : 'Missing' });

    // 4. Data
    const d = checkData();
    results.push({ label: 'Tournament Data', ok: d.ok, detail: d.msg });

    // 5. Key HTML elements
    ['login-section','editor-section','grade-section','matches-list','loading-overlay'].forEach(id => {
        results.push({ label: `DOM: #${id}`, ok: !!document.getElementById(id), detail: document.getElementById(id) ? 'Found' : 'MISSING FROM HTML' });
    });

    // 6. PDF export hook
    results.push({ label: 'exportToPDF hook', ok: typeof window.KSSS_UI_HOOKS?.exportToPDF === 'function', detail: '' });

    // 7. Export to CSV hook
    results.push({ label: 'exportToCSV hook', ok: typeof window.KSSS_UI_HOOKS?.exportToCSV === 'function', detail: '' });

    // 8. Error count
    results.push({ label: 'Error count', ok: ErrorHandler.errors.length === 0, detail: `${ErrorHandler.errors.length} error(s)` });

    console.group('🐞 Full Debug Test Results');
    results.forEach(r => {
        const m = `${r.ok ? '✅' : '❌'} ${r.label}${r.detail ? ': ' + r.detail : ''}`;
        r.ok ? console.log(m) : console.error(m);
    });
    console.groupEnd();

    // Report in panel
    const pass = results.filter(r => r.ok).length;
    alert(`Full Test: ${pass}/${results.length} passed.\n\nSee the browser console (F12) for the full breakdown!`);
}

async function testFirebaseRead() {
    try {
        if (!window.firebase) throw new Error('window.firebase not found');
        if (!window.firebase.apps.length) throw new Error('Firebase not initialized');
        const db  = window.firebase.database();
        const ref = db.ref('competition/grade7');
        const snap = await ref.once('value');
        if (snap.exists()) {
            console.log('🔥 Firebase read success (grade7):', snap.val());
            alert('✅ Firebase read succeeded! Grade 7 data found. Check console.');
        } else {
            console.warn('🔥 Firebase connected but grade7 node is empty.');
            alert('⚠️ Firebase connected but grade7 node has no data yet.');
        }
    } catch (e) {
        console.error('❌ Firebase test failed:', e);
        alert('❌ Firebase test failed: ' + e.message);
    }
}