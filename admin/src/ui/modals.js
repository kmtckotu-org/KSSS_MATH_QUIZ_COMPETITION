import { store } from '../core/store.js';
import { getLosersSorted, getQualifiedTeams } from '../tournament/rounds.js';
import { renderForm } from './render.js';
import { createEl } from '../utils/dom.js';
import { pairingState } from '../tournament/generation.js';

let viewportResizeHandler = null;
let originalModalTop = null;

export function initIOSHandling() {
    if (!window.visualViewport || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
    if (viewportResizeHandler) {
        window.visualViewport.removeEventListener('resize', viewportResizeHandler);
    }
    viewportResizeHandler = () => {
        const modal = document.querySelector('.modal-container');
        if (!modal) return;
        const viewport = window.visualViewport;
        const keyboardHeight = window.innerHeight - viewport.height;
        if (originalModalTop === null) {
            originalModalTop = modal.style.top || '50%';
        }
        if (keyboardHeight > 100) {
            const modalHeight = modal.offsetHeight;
            const availableSpace = viewport.height;
            let newTop = Math.max(10, (availableSpace - modalHeight) / 2);
            modal.style.position = 'fixed';
            modal.style.top = `${newTop}px`;
            modal.style.transform = 'translateX(-50%)';
            modal.style.maxHeight = `${availableSpace - 20}px`;
            modal.style.overflowY = 'auto';
            const focusedInput = document.activeElement;
            if (focusedInput && (focusedInput.tagName === 'INPUT' || focusedInput.tagName === 'SELECT')) {
                setTimeout(() => {
                    focusedInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        } else {
            modal.style.position = 'fixed';
            modal.style.top = originalModalTop;
            modal.style.transform = 'translate(-50%, -50%)';
            modal.style.maxHeight = '85vh';
        }
    };
    window.visualViewport.addEventListener('resize', viewportResizeHandler);
    window.visualViewport.addEventListener('scroll', viewportResizeHandler);
}

export function teardownIOSHandling() {
    if (viewportResizeHandler && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', viewportResizeHandler);
        window.visualViewport.removeEventListener('scroll', viewportResizeHandler);
    }
    viewportResizeHandler = null;
    originalModalTop = null;
}

export function showSwapModal() {
    const unlockedTeams = store.getUnlockedTeams();
    const [t1, t2] = unlockedTeams;
    if (t1.rIdx !== t2.rIdx) {
        alert("⚠️ Teams must be in the same round to swap.");
        store.setUnlockedTeams([], 'modals.swapModal');
        renderForm();
        return;
    }
    const currentData = store.getCurrentData();
    const round = currentData.rounds[t1.rIdx];
    const m1 = round.matches[t1.mIdx];
    const m2 = round.matches[t2.mIdx];
    const teamA = t1.side === 'A' ? m1.teamA : m1.teamB;
    const teamB = t2.side === 'A' ? m2.teamA : m2.teamB;
    if (teamA.points != null || teamB.points != null || m1.winner || m2.winner) {
        alert("❌ Cannot swap teams with recorded scores or completed matches.");
        store.setUnlockedTeams([], 'modals.swapModal');
        renderForm();
        return;
    }
    const html = `
        <div style='text-align:center;'>
            <div style='font-size:48px;margin-bottom:16px;'>🔄</div>
            <div style='font-size:20px;font-weight:bold;margin-bottom:12px;color:var(--text-main);'>Confirm Team Swap</div>
            <div style='font-size:15px;margin-bottom:20px;color:var(--text-muted);line-height:1.5;'>
                You are about to swap:<br><br>
                <span style='display:inline-block;background:var(--active-bg);color:var(--primary);padding:8px 16px;border-radius:8px;font-weight:bold;margin:4px;'>
                    ${teamA.name}
                </span>
                <br>with<br>
                <span style='display:inline-block;background:var(--active-bg);color:var(--primary);padding:8px 16px;border-radius:8px;font-weight:bold;margin:4px;'>
                    ${teamB.name}
                </span>
            </div>
            <div style='font-size:13px;color:var(--warning-text);margin-bottom:24px;padding:12px;background:var(--warning-bg);border-radius:8px;border:1px solid var(--warning-border);'>
                ⚠️ This action will immediately save to GitHub
            </div>
            <div style='display:flex;gap:12px;justify-content:center;'>
                <button data-action="confirmTeamSwap" style='flex:1;background:linear-gradient(135deg, var(--success) 0%, #15803d 100%);color:#fff;padding:12px 24px;border:none;border-radius:10px;font-weight:bold;cursor:pointer;font-size:15px;box-shadow:0 4px 12px rgba(22,163,74,0.3);transition:all 0.2s;' onmouseover='this.style.transform="translateY(-2px)";this.style.boxShadow="0 6px 16px rgba(22,163,74,0.4)"' onmouseout='this.style.transform="translateY(0)";this.style.boxShadow="0 4px 12px rgba(22,163,74,0.3)"'>
                    ✓ Yes, Swap Teams
                </button>
                <button data-action="cancelTeamSwap" style='flex:1;background:var(--locked-bg);color:var(--text-muted);padding:12px 24px;border:2px solid var(--border-color);border-radius:10px;font-weight:bold;cursor:pointer;font-size:15px;transition:all 0.2s;' onmouseover='this.style.background="var(--border-color)";this.style.color="white"' onmouseout='this.style.background="var(--locked-bg)";this.style.color="var(--text-muted)"'>
                    × Cancel
                </button>
            </div>
        </div>
    `;
    const modal = document.createElement('div');
    modal.id = 'swap-modal';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--card-bg);padding:40px;z-index:9999;border-radius:16px;box-shadow:var(--card-shadow);min-width:400px;max-width:90vw;animation:modalFadeIn 0.2s ease;';
    modal.innerHTML = html;
    document.body.appendChild(modal);
    const backdrop = document.createElement('div');
    backdrop.id = 'swap-modal-backdrop';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9998;animation:backdropFadeIn 0.2s ease;';
    backdrop.onclick = cancelTeamSwap;
    document.body.appendChild(backdrop);
}

export function cancelTeamSwap() {
    const modal = document.getElementById('swap-modal');
    const backdrop = document.getElementById('swap-modal-backdrop');
    if (modal) modal.remove();
    if (backdrop) backdrop.remove();
    store.setUnlockedTeams([], 'modals.cancelSwap');
    renderForm();
}

export function showBestLoserOverride(rIdx) {
    const currentData = store.getCurrentData();
    const round = currentData.rounds[rIdx];
    const losers = getLosersSorted(round);

    if (losers.length < 1) {
        alert("No losers available to pick from in this round.");
        return;
    }
    const backdrop = document.createElement("div");
    backdrop.id = "modal-backdrop";
    backdrop.className = "modal-overlay";
    backdrop.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 2999;";
    backdrop.onclick = closeBestLoserModal;

    const modal = document.createElement("div");
    modal.id = "best-loser-modal";
    modal.className = "modal-container";
    modal.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--card-bg); color: var(--text-main); padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 3000; max-width: 500px; width: 90%; border: 1px solid var(--border-color);";

    let html = `
        <div class="modal-header">
            <h3 class="modal-title">🔄 Override Automatic Best Loser</h3>
            <p class="modal-subtitle">The system automatically promoted the highest-scoring loser. You can manually select a different team to advance instead.</p>
        </div>
        <div class="modal-body">
            <div class="input-group">
                <label>Select Team to Advance:</label>
                <select id="loser-override" class="modal-select">
                    <option value="">-- Choose Team --</option>
                    ${losers.map(l => `<option value="${l.name}">${l.name} (${l.points} pts)</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="modal-footer">
            <button data-action="overrideBestLoserSave" data-params="[${rIdx}]" style="background: var(--success);">✅ Save Override</button>
            <button data-action="closeBestLoserModal" style="background: var(--danger);">❌ Cancel</button>
        </div>
    `;
    modal.innerHTML = html;
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    initIOSHandling();
}



export function closeBestLoserModal() {
    teardownIOSHandling();
    const modal = document.getElementById("best-loser-modal");
    const backdrop = document.getElementById("modal-backdrop");
    if (modal) modal.remove();
    if (backdrop) backdrop.remove();
}

export function showRoundGenerator(rIdx) {
    const round = store.getCurrentData().rounds[rIdx];
    const qualified = getQualifiedTeams(round);
    const suggestedMatches = qualified.length / 2;

    const backdrop = document.createElement("div");
    backdrop.id = "modal-backdrop";
    backdrop.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 2999;";
    backdrop.onclick = closeRoundGenModal;

    const modal = document.createElement("div");
    modal.id = "round-gen-modal";
    modal.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--card-bg); color: var(--text-main); padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 3000; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; border: 1px solid var(--border-color);";

    let html = '<h3 style="margin-top: 0; color: var(--primary);">➕ Generate Next Round</h3>';
    html += `<p style="font-size: 14px; color: #64748b;">${qualified.length} teams qualified. Suggested: ${suggestedMatches} matches.</p>`;
    html += `<div style="margin: 20px 0;">
        <label>Number of Matches:</label>
        <input type="number" id="num-matches" value="${suggestedMatches}" min="1" max="${suggestedMatches}" style="margin-top: 5px;">
        <div style="font-size: 12px; color: #64748b; margin-top: 5px;">Must pair all ${qualified.length} teams</div>
    </div>`;
    html += `<div style="display: flex; gap: 10px; margin-top: 20px;">
        <button data-action="startPairing" data-params="[${rIdx}]" style="flex: 1; background: var(--success);">✅ Start Pairing</button>
        <button data-action="closeRoundGenModal" style="flex: 1; background: #ef4444;">❌ Cancel</button>
    </div>`;

    modal.innerHTML = html;
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    initIOSHandling();
}

export function closeRoundGenModal() {
    teardownIOSHandling();
    const modal = document.getElementById("round-gen-modal");
    const backdrop = document.getElementById("modal-backdrop");
    if (modal) modal.remove();
    if (backdrop) backdrop.remove();
}

// --- MODIFIED: showAuthModal now returns a Promise (no callback) ---
export function showAuthModal() {
    return new Promise((resolve, reject) => {
        const backdrop = document.createElement("div");
        backdrop.id = "auth-modal-backdrop";
        backdrop.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 3000;";
        const modal = document.createElement("div");
        modal.id = "auth-modal";
        modal.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--card-bg); padding: 25px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 3001; width: 300px; text-align: center; color: var(--text-main);";
        const html = `
            <div style="font-size: 24px; margin-bottom: 10px;">🔒</div>
            <h3 style="margin: 0 0 15px 0; color: var(--text-main);">Structural Auth</h3>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px;">Enter the structural code for Y-JAMMEH</p>
            <input type="password" id="auth-code-input" style="width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid var(--border-color); border-radius: 6px;" placeholder="Enter code">
            <div style="display: flex; gap: 10px;">
                <button id="auth-submit-btn" style="flex: 1; background: var(--primary); color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer;">Authenticate</button>
                <button id="auth-cancel-btn" style="flex: 1; background: var(--locked-bg); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px; border-radius: 6px; cursor: pointer;">Cancel</button>
            </div>
        `;
        modal.innerHTML = html;
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        const input = document.getElementById("auth-code-input");
        const submitBtn = document.getElementById("auth-submit-btn");
        const cancelBtn = document.getElementById("auth-cancel-btn");

        setTimeout(() => input && input.focus(), 50);

        const cleanup = () => {
            if (modal) modal.remove();
            if (backdrop) backdrop.remove();
        };

        submitBtn.onclick = () => {
            const code = input.value;
            cleanup();
            resolve(code);
        };
        cancelBtn.onclick = () => {
            cleanup();
            reject(new Error("User cancelled"));
        };
        input.onkeydown = (e) => {
            if (e.key === "Enter") {
                const code = input.value;
                cleanup();
                resolve(code);
            }
            if (e.key === "Escape") {
                cleanup();
                reject(new Error("User cancelled"));
            }
        };
        backdrop.onclick = () => {
            cleanup();
            reject(new Error("User cancelled"));
        };
    });
}

// --- Structural Auth Modal (for team switch) ---
export function showStructuralAuthModal(onSuccess) {
    const backdrop = document.createElement("div");
    backdrop.id = "auth-modal-backdrop";
    backdrop.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 3000;";
    const modal = document.createElement("div");
    modal.id = "auth-modal";
    modal.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--card-bg); padding: 25px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 3001; width: 300px; text-align: center; color: var(--text-main);";
    const html = `
        <div style="font-size: 24px; margin-bottom: 10px;">🔐</div>
        <h3 style="margin: 0 0 15px 0; color: var(--text-main);">Structural Authentication</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px;">Enter the structural code to enable team switching</p>
        <input type="password" id="structural-code-input" style="width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid var(--border-color); border-radius: 6px;" placeholder="Enter code">
        <div style="display: flex; gap: 10px;">
            <button id="structural-submit-btn" style="flex: 1; background: var(--primary); color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer;">Authenticate</button>
            <button id="structural-cancel-btn" style="flex: 1; background: var(--locked-bg); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px; border-radius: 6px; cursor: pointer;">Cancel</button>
        </div>
    `;
    modal.innerHTML = html;
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const input = document.getElementById("structural-code-input");
    const submitBtn = document.getElementById("structural-submit-btn");
    const cancelBtn = document.getElementById("structural-cancel-btn");

    setTimeout(() => input && input.focus(), 50);

    const cleanup = () => {
        if (modal) modal.remove();
        if (backdrop) backdrop.remove();
    };
    const submit = () => {
        const code = input.value;
        cleanup();
        if (code) onSuccess(code);
    };
    submitBtn.onclick = submit;
    cancelBtn.onclick = cleanup;
    input.onkeydown = (e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") cleanup();
    };
    backdrop.onclick = cleanup;
}

// --- Structural Action Log Modal ---
export function showStructuralActionLog() {
    try {
        // PREVENT MULTIPLE STACKED MODALS WHICH TRAP THE UI
        closeStructuralLogModal();

        const logKey = 'ksss_structural_action_log';
        const log = JSON.parse(localStorage.getItem(logKey) || '[]');

        const backdrop = document.createElement("div");
        backdrop.id = "structural-log-backdrop";
        backdrop.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9998;";
        backdrop.onclick = closeStructuralLogModal;
        document.body.appendChild(backdrop);

        const modal = document.createElement("div");
        modal.id = "structural-log-modal";
        modal.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--card-bg);color:var(--text-main);padding:30px;z-index:9999;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.25);min-width:320px;max-width:90vw;border:1px solid var(--border-color);";

        let html = '<h3 style="margin-top:0;">📝 Structural Action Log</h3>';
        if (log.length === 0) {
            html += '<p style="color:#64748b;">No structural actions recorded yet.</p>';
        } else {
            html += '<ul style="max-height:300px;overflow-y:auto;padding-left:18px;">';
            for (const entry of log.slice().reverse()) {
                html += `<li><b>${entry.action}</b> by <span style="color:#0d47a1;">${entry.admin}</span> <span style="color:#64748b;">[${entry.timestamp}]</span></li>`;
            }
            html += '</ul>';
        }
        html += '<button id="close-structural-log" style="margin-top:15px;background:#64748b;color:#fff;padding:8px 18px;border-radius:8px;border:none;cursor:pointer;">Cancel</button>';

        modal.innerHTML = html;
        document.body.appendChild(modal);

        document.getElementById("close-structural-log").onclick = closeStructuralLogModal;
    } catch (e) {
        alert('Failed to load structural action log.');
    }
}

export function closeStructuralLogModal() {
    const modal = document.getElementById('structural-log-modal');
    const backdrop = document.getElementById('structural-log-backdrop');
    if (modal) modal.remove();
    if (backdrop) backdrop.remove();
}

// --- Critical Action Confirmation Modal (two-step) ---
// MODIFIED: now accepts newRoundId and matchCount
export function showCriticalActionModal(roundName, newRoundId, matchCount) {
    return new Promise((resolve) => {
        // Step 1: Confirmation modal
        const backdrop1 = document.createElement("div");
        backdrop1.id = "critical-backdrop-1";
        backdrop1.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 3050;";

        const modal1 = document.createElement("div");
        modal1.id = "critical-modal-1";
        modal1.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--card-bg); color: var(--text-main); padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 3051; max-width: 500px; width: 90%; border: 1px solid var(--border-color); text-align: center;";

        modal1.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h3 style="margin: 0 0 15px 0; color: var(--primary);">CRITICAL ACTION</h3>
            <div style="font-size: 15px; margin-bottom: 20px; color: var(--text-muted); line-height: 1.5; text-align: left;">
                <p>This will:</p>
                <ul style="text-align: left; margin-left: 20px;">
                    <li><strong>LOCK ${roundName}</strong> (cannot be edited after)</li>
                    <li>Create Round ${newRoundId} with ${matchCount} matches</li>
                </ul>
                <p>Are you absolutely sure you want to proceed?</p>
            </div>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="critical-ok-1" style="flex:1; background: var(--primary); color:white; border:none; padding:12px 0; border-radius:8px; font-weight:bold; cursor:pointer;">OK</button>
                <button id="critical-cancel-1" style="flex:1; background: var(--danger); color:white; border:none; padding:12px 0; border-radius:8px; font-weight:bold; cursor:pointer;">Cancel</button>
            </div>
        `;

        document.body.appendChild(backdrop1);
        document.body.appendChild(modal1);

        const cleanup1 = () => {
            modal1.remove();
            backdrop1.remove();
        };

        document.getElementById("critical-ok-1").onclick = () => {
            cleanup1();
            // Step 2: Typing confirmation modal
            const backdrop2 = document.createElement("div");
            backdrop2.id = "critical-backdrop-2";
            backdrop2.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 3060;";

            const modal2 = document.createElement("div");
            modal2.id = "critical-modal-2";
            modal2.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--card-bg); color: var(--text-main); padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 3061; max-width: 400px; width: 90%; border: 1px solid var(--border-color); text-align: center;";

            modal2.innerHTML = `
                <div style="font-size: 32px; margin-bottom: 16px;">🔐</div>
                <h3 style="margin: 0 0 15px 0; color: var(--primary);">Final Confirmation</h3>
                <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 15px;">Type <strong>CONFIRM</strong> (all caps) to lock ${roundName} and create the new round:</p>
                <input type="text" id="critical-confirm-input" style="width: 100%; padding: 10px; margin-bottom: 15px; border: 2px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-main);" placeholder="CONFIRM">
                <div style="display: flex; gap: 10px;">
                    <button id="critical-confirm-btn" style="flex:1; background: var(--success); color:white; border:none; padding:8px 0; border-radius:6px; cursor:pointer;">Confirm</button>
                    <button id="critical-cancel-2" style="flex:1; background: var(--locked-bg); color:var(--text-muted); border:1px solid var(--border-color); padding:8px 0; border-radius:6px; cursor:pointer;">Cancel</button>
                </div>
            `;

            document.body.appendChild(backdrop2);
            document.body.appendChild(modal2);

            const cleanup2 = () => {
                modal2.remove();
                backdrop2.remove();
            };

            const input = document.getElementById("critical-confirm-input");
            const confirmBtn = document.getElementById("critical-confirm-btn");
            const cancelBtn = document.getElementById("critical-cancel-2");

            const submit = () => {
                const typed = input.value.trim();
                cleanup2();
                resolve(typed === "CONFIRM");
            };

            confirmBtn.onclick = submit;
            cancelBtn.onclick = () => {
                cleanup2();
                resolve(false);
            };
            input.onkeydown = (e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") {
                    cleanup2();
                    resolve(false);
                }
            };
            backdrop2.onclick = () => {
                cleanup2();
                resolve(false);
            };

            input.focus();
        };

        document.getElementById("critical-cancel-1").onclick = () => {
            cleanup1();
            resolve(false);
        };
        backdrop1.onclick = () => {
            cleanup1();
            resolve(false);
        };
    });
}

// --- Simple Alert Modal (just a message and OK button) ---
export function showAlertModal(title, message) {
    return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 3100;";

        const modal = document.createElement("div");
        modal.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--card-bg); color: var(--text-main); padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 3101; max-width: 400px; width: 90%; border: 1px solid var(--border-color); text-align: center;";

        modal.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 16px;">⚠️</div>
            <h3 style="margin: 0 0 15px 0; color: var(--primary);">${title}</h3>
            <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 20px;">${message}</p>
            <button id="alert-ok" style="background: var(--primary); color: white; border: none; padding: 10px 30px; border-radius: 8px; font-weight: bold; cursor: pointer;">OK</button>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        const cleanup = () => {
            modal.remove();
            backdrop.remove();
            resolve();
        };

        document.getElementById("alert-ok").onclick = cleanup;
        backdrop.onclick = cleanup;
        modal.addEventListener('keydown', (e) => { if (e.key === "Escape") cleanup(); });
        modal.querySelector('button').focus();
    });
}

// --- Generic Confirm Modal (two buttons) ---
export function showConfirmModal(title, message, confirmText = "OK", cancelText = "Cancel") {
    return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.id = "confirm-backdrop";
        backdrop.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 3110;";

        const modal = document.createElement("div");
        modal.id = "confirm-modal";
        modal.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--card-bg); color: var(--text-main); padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 3111; max-width: 400px; width: 90%; border: 1px solid var(--border-color); text-align: center;";

        modal.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 16px;">⚠️</div>
            <h3 style="margin: 0 0 15px 0; color: var(--primary);">${title}</h3>
            <div style="font-size: 14px; margin-bottom: 20px; color: var(--text-muted); line-height: 1.5; text-align: left;">
                ${message}
            </div>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="confirm-ok" style="flex:1; background: var(--primary); color:white; border:none; padding:10px 0; border-radius:8px; font-weight:bold; cursor:pointer;">${confirmText}</button>
                <button id="confirm-cancel" style="flex:1; background: var(--danger); color:white; border:none; padding:10px 0; border-radius:8px; font-weight:bold; cursor:pointer;">${cancelText}</button>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        const cleanup = () => {
            modal.remove();
            backdrop.remove();
        };

        document.getElementById("confirm-ok").onclick = () => {
            cleanup();
            resolve(true);
        };
        document.getElementById("confirm-cancel").onclick = () => {
            cleanup();
            resolve(false);
        };
        backdrop.onclick = () => {
            cleanup();
            resolve(false);
        };
    });
}

// --- Generic Prompt Modal (for typing confirmation) ---
export function showPromptModal(title, message, placeholder = "") {
    return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.id = "prompt-backdrop";
        backdrop.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 3120;";

        const modal = document.createElement("div");
        modal.id = "prompt-modal";
        modal.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--card-bg); color: var(--text-main); padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 3121; max-width: 400px; width: 90%; border: 1px solid var(--border-color); text-align: center;";

        modal.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 16px;">🔐</div>
            <h3 style="margin: 0 0 15px 0; color: var(--primary);">${title}</h3>
            <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 15px;">${message}</p>
            <input type="text" id="prompt-input" style="width: 100%; padding: 10px; margin-bottom: 15px; border: 2px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-main);" placeholder="${placeholder}">
            <div style="display: flex; gap: 10px;">
                <button id="prompt-confirm" style="flex:1; background: var(--success); color:white; border:none; padding:8px 0; border-radius:6px; cursor:pointer;">Confirm</button>
                <button id="prompt-cancel" style="flex:1; background: var(--locked-bg); color:var(--text-muted); border:1px solid var(--border-color); padding:8px 0; border-radius:6px; cursor:pointer;">Cancel</button>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        const input = document.getElementById("prompt-input");
        const confirmBtn = document.getElementById("prompt-confirm");
        const cancelBtn = document.getElementById("prompt-cancel");

        const cleanup = () => {
            modal.remove();
            backdrop.remove();
        };

        const submit = () => {
            const value = input.value.trim();
            cleanup();
            resolve(value);
        };

        confirmBtn.onclick = submit;
        cancelBtn.onclick = () => {
            cleanup();
            resolve(null);
        };
        input.onkeydown = (e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
                cleanup();
                resolve(null);
            }
        };
        backdrop.onclick = () => {
            cleanup();
            resolve(null);
        };

        input.focus();
    });
}