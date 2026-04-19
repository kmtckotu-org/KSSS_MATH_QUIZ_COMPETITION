import { store } from '../core/store.js';
import { createEl } from '../utils/dom.js';
import { getMatchStatus } from '../tournament/matches.js';
import { isRoundComplete, getQualifiedTeams, hasBestLoserMatch, canGenerateNextRound, getAutoPromotedLoser } from '../tournament/rounds.js';
import { AdminSecurity } from '../auth/adminSecurity.js';
import { ROLE_ABSOLUTE } from '../auth/roles.js';
import { populateRoundFilter } from './filters.js';
import { initializePagination } from './pagination.js';
import { updateSchedule, updateScores } from '../tournament/matches.js';
import { CONSTANTS } from '../utils/constants.js';

export function createStatusBadge(status) {
    const badges = {
        'locked': '🔒 Locked',
        'completed': '✅ Complete',
        'in-progress': '⏳ In Progress',
        'pending': '⏸️ Pending'
    };
    const text = badges[status] || status;
    return createEl("span", `match-status-badge ${status}`, text);
}

export function createMatchCard(m, rIdx, mIdx, isLocked) {
    const switchModeActive = store.getSwitchModeActive();
    const switchModeRoundIdx = store.getSwitchModeRoundIdx();
    const unlockedTeams = store.getUnlockedTeams();
    const switchModeThisRound = switchModeActive && switchModeRoundIdx === rIdx;
    const eligibleA = switchModeThisRound && !isLocked && m.teamA.points == null && !m.winner;
    const eligibleB = switchModeThisRound && !isLocked && m.teamB.points == null && !m.winner;
    const unlockedA = switchModeThisRound && unlockedTeams.some(t => t.rIdx === rIdx && t.mIdx === mIdx && t.side === 'A');
    const unlockedB = switchModeThisRound && unlockedTeams.some(t => t.rIdx === rIdx && t.mIdx === mIdx && t.side === 'B');
    const isBestLoser = m.type === "best_loser";
    const matchStatus = getMatchStatus(m, isLocked);

    const card = createEl("div", `match-card ${isLocked ? "locked" : "active"} ${isBestLoser ? "best-loser-match" : ""} ${matchStatus}`);
    card.dataset.roundIdx = rIdx;
    card.dataset.matchIdx = mIdx;

    const header = createEl("div", "", null, "display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;");
    const titleText = isBestLoser ? '🏆 BEST LOSER PLAYOFF' : ('Match #' + m.id);
    if (isBestLoser && !isLocked) {
        const rName = store.getCurrentData().rounds[rIdx]?.name || "";
        header.appendChild(createEl("div", "", `🏆 BEST LOSER PLAYOFF (${rName})`, "font-weight:bold; color:#f59e0b;"));
    } else {
        header.appendChild(createEl("div", "", titleText, isBestLoser ? "font-weight:bold; color:#f59e0b;" : "font-weight:bold;"));
    }
    header.appendChild(createStatusBadge(matchStatus));
    card.appendChild(header);

    if (isLocked) {
        const meta = createEl("div", "", `📅 ${m.schedule.date ?? "-"}  ⏰ ${m.schedule.time ?? "-"}  📍 ${m.schedule.location ?? "-"}`, "font-size:12px; color:#64748b; text-align:center; width:100%; display:block; padding:4px 0; letter-spacing:0.02em;");
        card.appendChild(meta);
        const scores = createEl("div", "", null, "display:flex; justify-content:space-between; margin-top:10px; font-weight:bold;");
        scores.appendChild(createEl("span", "", `${m.teamA.name}: ${m.teamA.points ?? "-"}`));
        scores.appendChild(createEl("span", "vs-sep", "VS"));
        scores.appendChild(createEl("span", "", `${m.teamB.name}: ${m.teamB.points ?? "-"}`));
        card.appendChild(scores);
        const winnerDiv = createEl("div", "", `🏆 Winner: ${m.winner ?? "Pending"}`, "color:var(--primary); font-size:12px; margin-top:5px; font-weight:bold;");
        card.appendChild(winnerDiv);
    } else {
        const grid = createEl("div", "", null, "display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:12px;");
        ['date', 'time', 'location'].forEach(field => {
            const col = createEl("div");
            col.appendChild(createEl("label", "", field.charAt(0).toUpperCase() + field.slice(1)));
            const input = createEl("input");
            input.type = "text";
            input.value = m.schedule[field] ?? "";
            if (switchModeThisRound) input.disabled = true;
            input.onchange = (e) => updateSchedule(rIdx, mIdx, field, e.target.value);
            col.appendChild(input);
            grid.appendChild(col);
        });
        card.appendChild(grid);

        const scoreRow = createEl("div", "score-row");
        const colA = createEl("div");
        const labelA = createEl("label", "", (unlockedA ? '🔓 ' : '') + m.teamA.name + (unlockedA ? ' (Click to Re-lock)' : eligibleA ? ' 👆 Click to Unlock' : ''));
        if (unlockedA) {
            labelA.style.cssText = "background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);color:#fff;padding:6px 12px;border-radius:8px;cursor:pointer;font-weight:bold;box-shadow:0 2px 8px rgba(59,130,246,0.4);animation:pulse 1.5s infinite;";
            labelA.dataset.action = "relockTeam";
            labelA.dataset.params = JSON.stringify([rIdx, mIdx, 'A']);
        } else if (eligibleA) {
            labelA.style.cssText = "cursor:pointer;color:#3b82f6;font-weight:bold;text-decoration:underline;padding:4px 8px;border-radius:6px;background:var(--active-bg);transition:all 0.2s ease;";
            labelA.onmouseover = function () { this.style.background = 'var(--active-overlay)'; };
            labelA.onmouseout = function () { this.style.background = 'var(--active-bg)'; };
            labelA.dataset.action = "unlockTeam";
            labelA.dataset.params = JSON.stringify([rIdx, mIdx, 'A']);
        }
        colA.appendChild(labelA);
        const inputA = createEl("input");
        inputA.type = "number";
        inputA.value = m.teamA.points ?? "";
        inputA.min = CONSTANTS.MIN_SCORE;
        inputA.max = CONSTANTS.MAX_SCORE;
        inputA.step = "1";
        inputA.placeholder = `${CONSTANTS.MIN_SCORE}-${CONSTANTS.MAX_SCORE} points`;
        inputA.ariaLabel = `Score for ${m.teamA.name}`;
        if (switchModeThisRound) inputA.disabled = true;
        inputA.oninput = (e) => updateScores(rIdx, mIdx, 'teamA', e.target.value);
        inputA.addEventListener('wheel', function(e) { this.blur(); });
        colA.appendChild(inputA);
        scoreRow.appendChild(colA);

        scoreRow.appendChild(createEl("div", "vs-label", "VS"));

        const colB = createEl("div");
        const labelB = createEl("label", "", (unlockedB ? '🔓 ' : '') + m.teamB.name + (unlockedB ? ' (Click to Re-lock)' : eligibleB ? ' 👆 Click to Unlock' : ''));
        if (unlockedB) {
            labelB.style.cssText = "background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);color:#fff;padding:6px 12px;border-radius:8px;cursor:pointer;font-weight:bold;box-shadow:0 2px 8px rgba(59,130,246,0.4);animation:pulse 1.5s infinite;";
            labelB.dataset.action = "relockTeam";
            labelB.dataset.params = JSON.stringify([rIdx, mIdx, 'B']);
        } else if (eligibleB) {
            labelB.style.cssText = "cursor:pointer;color:#3b82f6;font-weight:bold;text-decoration:underline;padding:4px 8px;border-radius:6px;background:#eff6ff;transition:all 0.2s ease;";
            labelB.onmouseover = function () { this.style.background = '#dbeafe'; };
            labelB.onmouseout = function () { this.style.background = '#eff6ff'; };
            labelB.dataset.action = "unlockTeam";
            labelB.dataset.params = JSON.stringify([rIdx, mIdx, 'B']);
        }
        colB.appendChild(labelB);
        const inputB = createEl("input");
        inputB.type = "number";
        inputB.value = m.teamB.points ?? "";
        inputB.min = CONSTANTS.MIN_SCORE;
        inputB.max = CONSTANTS.MAX_SCORE;
        inputB.step = "1";
        inputB.placeholder = `${CONSTANTS.MIN_SCORE}-${CONSTANTS.MAX_SCORE} points`;
        inputB.ariaLabel = `Score for ${m.teamB.name}`;
        if (switchModeThisRound) inputB.disabled = true;
        inputB.oninput = (e) => updateScores(rIdx, mIdx, 'teamB', e.target.value);
        inputB.addEventListener('wheel', function(e) { this.blur(); });
        colB.appendChild(inputB);
        scoreRow.appendChild(colB);
        card.appendChild(scoreRow);

        const winBox = createEl("div", "winner-box", `🏆 Winner: ${m.winner ?? "Pending"}`);
        winBox.id = `win-${rIdx}-${mIdx}`;
        card.appendChild(winBox);
    }
    return card;
}

export function renderForm() {
    const container = document.getElementById("matches-list");
    container.innerHTML = "";
    const currentData = store.getCurrentData();
    if (!currentData) return;
    currentData.rounds.forEach((round, rIdx) => {
        const isLocked = round.status === "locked";
        const divider = createEl("div", "round-divider");
        divider.appendChild(createEl("span", "", round.name));
        divider.appendChild(createEl("span", "round-badge", isLocked ? "🔒 ARCHIVED" : "🔓 EDITABLE"));
        container.appendChild(divider);
        round.matches.forEach((m, mIdx) => {
            container.appendChild(createMatchCard(m, rIdx, mIdx, isLocked));
        });
        if (!isLocked) {
            addRoundManagementControls(container, round, rIdx);
        }
        addRoundDeletionControls(container, round, rIdx);
    });
    updateSidebarStats();
    populateRoundFilter();
    initializePagination();
}

export function updateSidebarStats() {
    const currentData = store.getCurrentData();
    if (!currentData) return;
    document.getElementById("sidebar-grade").textContent = currentData.grade || "--";
    document.getElementById("sidebar-rounds").textContent = currentData.rounds?.length || 0;
    let totalMatches = 0, completedMatches = 0, qualifiedTeams = 0;
    currentData.rounds.forEach(round => {
        if (round.matches) {
            totalMatches += round.matches.length;
            completedMatches += round.matches.filter(m => m.winner).length;
            if (round === currentData.rounds[currentData.rounds.length - 1]) {
                qualifiedTeams = getQualifiedTeams(round).length;
            }
        }
    });
    document.getElementById("sidebar-matches").textContent = totalMatches;
    document.getElementById("sidebar-completed").textContent = `${completedMatches}/${totalMatches}`;
    document.getElementById("sidebar-qualified").textContent = qualifiedTeams;
}

function addRoundDeletionControls(container, round, rIdx) {
    const role = AdminSecurity.getRole();
    if (role !== ROLE_ABSOLUTE) return;

    const controlsDiv = createEl("div", "", null, "background: var(--danger-bg); padding: 15px; border-radius: 12px; margin: 20px 0; border: 2px solid var(--danger-border);");

    const header = createEl("div", "", "⚠️ Round Management", "font-weight: bold; font-size: 16px; margin-bottom: 10px; color: var(--danger-text);");
    controlsDiv.appendChild(header);

    let hasAnyButton = false;

    // Delete button only for active (non-locked) rounds AND NOT for the first round (rIdx !== 0)
    if (round.status !== "locked" && rIdx !== 0) {   // ← added condition to protect Round 1
        const hasSubsequentRounds = rIdx < store.getCurrentData().rounds.length - 1;
        const subsequentCount = store.getCurrentData().rounds.length - 1 - rIdx;
        const btnText = `🗑️ Delete This Round${hasSubsequentRounds ? ` (+${subsequentCount} subsequent)` : ''}`;
        const deleteBtn = createEl("button", "", btnText, "background: var(--danger); border: 2px solid var(--danger-text); width: 100%; color: white; padding: 8px; cursor: pointer; border-radius: 6px;");
        deleteBtn.dataset.action = "cascadeDeleteRound";
        deleteBtn.dataset.params = JSON.stringify([rIdx]);
        controlsDiv.appendChild(deleteBtn);
        hasAnyButton = true;

        if (hasSubsequentRounds) {
            const warningText = `⚠️ Warning: This will cascade delete all rounds from ${round.name} onwards (${subsequentCount + 1} total)`;
            const warning = createEl("div", "", warningText, "font-size: 11px; color: var(--danger-text); margin-top: 8px; padding: 8px; background: var(--danger-bg); border-radius: 4px; border: 1px solid var(--danger-border);");
            controlsDiv.appendChild(warning);
        }
    }

    // Unlock button only for final round if locked
    if (round.status === "locked" && rIdx === store.getCurrentData().rounds.length - 1) {
        const unlockBtn = createEl("button", "", "🔓 Unlock Final Round", "background: #3b82f6; margin-top: 10px; width:100%; padding:8px; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;");
        unlockBtn.dataset.action = "unlockFinalRound";
        unlockBtn.dataset.params = JSON.stringify([rIdx]);
        controlsDiv.appendChild(unlockBtn);
        hasAnyButton = true;
    }

    // Only add the controlsDiv if it contains any actionable items
    if (hasAnyButton) {
        container.appendChild(controlsDiv);
    }
}

function addRoundManagementControls(container, round, rIdx) {
    const controlsDiv = createEl("div", "", null, "background: var(--card-bg); padding: 20px; border-radius: 12px; margin: 20px 0; border: 2px dashed var(--border-color); box-shadow: var(--card-shadow);");

    if (store.getSwitchModeActive()) {
        let banner = document.getElementById("switch-mode-banner");
        if (!banner) {
            banner = createEl("div");
            banner.id = "switch-mode-banner";
            banner.style.cssText = "background:#0d47a1;color:#fff;padding:12px 20px;margin-bottom:18px;border-radius:8px;font-weight:bold;font-size:16px;text-align:center; display:flex; align-items:center; justify-content:center; gap:15px;";
            const textSpan = createEl("span", "", "⚠️ Structural Switch Mode Active — Only unplayed teams can be swapped.");
            banner.appendChild(textSpan);
            const exitBtn = createEl("button", "", "Exit Switch Mode", "background:#64748b;color:#fff;padding:6px 16px;border-radius:8px;border:none;cursor:pointer;");
            exitBtn.dataset.action = "exitTeamSwitchMode";
            banner.appendChild(exitBtn);
            container.parentNode.insertBefore(banner, container);
        }
    } else {
        const banner = document.getElementById("switch-mode-banner");
        if (banner) banner.remove();
    }

    const roundComplete = isRoundComplete(round);
    const qualified = getQualifiedTeams(round);
    const autoPromoted = getAutoPromotedLoser(round);
    const hasBestLoser = hasBestLoserMatch(round);

    const header = createEl("div", "", "📋 Round Management (v2.2.5)", "font-weight: bold; font-size: 18px; margin-bottom: 15px; color: var(--primary);");
    controlsDiv.appendChild(header);

    const completedMatches = round.matches.filter(m => m.winner).length;
    const infoDiv = createEl("div", "", null, "margin-bottom: 15px; font-size: 14px;");
    const info1 = createEl("div", "", `✅ Completed Matches: ${completedMatches} / ${round.matches.length}`);
    const info2 = createEl("div", "", `🏆 Qualified Teams: ${qualified.length}${autoPromoted ? ' (Including Best Loser: ' + autoPromoted + ')' : ''}`);
    infoDiv.appendChild(info1);
    infoDiv.appendChild(info2);
    controlsDiv.appendChild(infoDiv);

    if (autoPromoted && AdminSecurity.getRole() === ROLE_ABSOLUTE) {
        const overrideBtn = createEl("button", "", "🔄 Override Best Loser", "margin-bottom: 10px; background: #64748b; width:100%; padding:10px; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;");
        overrideBtn.dataset.action = "showBestLoserOverride";
        overrideBtn.dataset.params = JSON.stringify([rIdx]);
        controlsDiv.appendChild(overrideBtn);
    }

    if (hasBestLoser) {
        const blStatus = createEl("div", "", "✅ Best Loser Playoff exists natively", "padding: 10px; background: var(--warning-bg); color: var(--warning-text); border: 1px solid var(--warning-border); border-radius: 6px; margin-bottom: 10px;");
        controlsDiv.appendChild(blStatus);
    }

    // Show generate button ONLY when:
    // 1. This round IS the last round (not an older round)
    // 2. The round is complete (all matches have winners)
    // 3. Enough qualified teams for next round (even number, >= 2)
    const currentData = store.getCurrentData();
    const isLastRound = rIdx === currentData.rounds.length - 1;
    const canGenerate = isLastRound && roundComplete && qualified.length >= 2 && qualified.length % 2 === 0;

    if (canGenerate) {
        const genBtn = createEl("button", "", "➕ Generate Next Round", "background: var(--success); margin-bottom: 10px; width:100%; padding:10px; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;");
        genBtn.dataset.action = "showRoundGenerator";
        genBtn.dataset.params = JSON.stringify([rIdx]);
        controlsDiv.appendChild(genBtn);
    } else if (!roundComplete) {
        const warning = createEl("div", "", "⚠️ Complete all matches before generating next round", "padding: 10px; background: var(--info-bg); border: 1px solid var(--info-border); border-radius: 6px; color: var(--info-text); margin-bottom: 10px;");
        controlsDiv.appendChild(warning);
    } else if (isLastRound && qualified.length % 2 !== 0) {
        const oddWarning = createEl("div", "", `⚠️ ${qualified.length} qualified teams — need an even number to generate next round (use Best Loser to add one more)`, "padding: 10px; background: var(--warning-bg); border: 1px solid var(--warning-border); border-radius: 6px; color: var(--warning-text); margin-bottom: 10px;");
        controlsDiv.appendChild(oddWarning);
    }

    if (roundComplete && qualified.length === 1) {
        const endBtn = createEl("button", "", "🏁 End Tournament & Lock Final Round", "background: #7c3aed; margin-top: 10px; width:100%; padding:10px; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;");
        endBtn.dataset.action = "endTournament";
        endBtn.dataset.params = JSON.stringify([rIdx]);
        controlsDiv.appendChild(endBtn);
    }

    container.appendChild(controlsDiv);

    const role = AdminSecurity.getRole();
    if (role === ROLE_ABSOLUTE && !store.getSwitchModeActive()) {
        const switchBtn = createEl("button", "", "🔄 Enable Team Switch Mode", "background:#0d47a1;color:#fff;margin-top:10px;width:100%;padding:10px;border:none;border-radius:6px;cursor:pointer;font-weight:bold;");
        switchBtn.dataset.action = "activateTeamSwitchMode";
        switchBtn.dataset.params = JSON.stringify([rIdx]);
        controlsDiv.appendChild(switchBtn);
    }
}

export function showLoginModal() {
    const loginSection = document.getElementById("login-section");
    const gradeSection = document.getElementById("grade-section");
    const editorSection = document.getElementById("editor-section");
    const adminDisplay = document.getElementById("admin-display");
    if (loginSection) loginSection.classList.remove("hidden");
    if (gradeSection) gradeSection.classList.add("hidden");
    if (editorSection) editorSection.classList.add("hidden");
    if (adminDisplay) adminDisplay.innerHTML = "Please authenticate to access tournament management";
}