// src/tournament/rounds.js
import { store } from '../core/store.js';
import { saveToGitHub } from '../api/github.js';
import { renderForm, updateSidebarStats } from '../ui/render.js';
import { showStatus } from '../utils/dom.js';
import { AdminSecurity } from '../auth/adminSecurity.js';
import { ROLE_ABSOLUTE } from '../auth/roles.js';
import { resetHistory, saveHistorySnapshot } from '../core/history.js';
import { logStructuralAction } from '../utils/logger.js';
import { CONFIG } from '../core/config.js';
import { showAlertModal, showConfirmModal, showPromptModal } from '../ui/modals.js';

export function isRoundComplete(round) {
    if (!round || !round.matches || round.matches.length === 0) return false;
    return round.matches.every(m => m.winner !== null && m.winner !== undefined && m.winner !== "");
}

export function getQualifiedTeams(round) {
    if (!round || !round.matches) return [];
    const winners = [];
    round.matches.forEach(m => {
        if (m.winner) winners.push(m.winner);
    });
    
    if (winners.length > 0 && winners.length % 2 !== 0 && isRoundComplete(round) && !hasBestLoserMatch(round)) {
        if (round.overrideBestLoser) {
            winners.push(round.overrideBestLoser);
        } else {
            const losers = getLosersSorted(round);
            if (losers.length > 0) {
                winners.push(losers[0].name);
            }
        }
    }
    
    return winners;
}

export function getAutoPromotedLoser(round) {
    if (!round || !round.matches || !isRoundComplete(round) || hasBestLoserMatch(round)) return null;
    const winners = [];
    round.matches.forEach(m => {
        if (m.winner) winners.push(m.winner);
    });
    if (winners.length > 0 && winners.length % 2 !== 0) {
        if (round.overrideBestLoser) return round.overrideBestLoser;
        const losers = getLosersSorted(round);
        if (losers.length > 0) return losers[0].name;
    }
    return null;
}

export function getLosersSorted(round) {
    if (!round || !round.matches) return [];
    const losers = [];
    round.matches.forEach(m => {
        if (m.type === "best_loser") return;
        if (m.winner) {
            if (m.winner === m.teamA.name && m.teamB.points !== null) {
                losers.push({ name: m.teamB.name, points: m.teamB.points });
            } else if (m.winner === m.teamB.name && m.teamA.points !== null) {
                losers.push({ name: m.teamA.name, points: m.teamA.points });
            }
        }
    });
    losers.sort((a, b) => b.points - a.points);
    return losers;
}

export function hasBestLoserMatch(round) {
    if (!round || !round.matches) return false;
    return round.matches.some(m => m.type === "best_loser");
}

export function getLastRound() {
    const currentData = store.getCurrentData();
    if (!currentData || !currentData.rounds || currentData.rounds.length === 0) return null;
    return currentData.rounds[currentData.rounds.length - 1];
}

export function canGenerateNextRound() {
    const lastRound = getLastRound();
    if (!lastRound) return false;
    if (!isRoundComplete(lastRound)) return false;
    const qualified = getQualifiedTeams(lastRound);
    return qualified.length >= 2 && qualified.length % 2 === 0;
}

/**
 * Cascade delete a round and all subsequent rounds
 * @param {number} rIdx - Index of the round to delete
 */
export async function cascadeDeleteRound(rIdx) {
    const currentData = store.getCurrentData();
    const currentUser = store.getCurrentUser();

    const overrideConfirmed = await showConfirmModal(
        "Structural Override",
        "You are performing a structural override. Continue?",
        "Continue",
        "Cancel"
    );
    if (!overrideConfirmed) {
        showStatus("Structural action cancelled.", "#64748b");
        return;
    }
    logStructuralAction("Cascade Delete Round", { admin: currentUser, roundIndex: rIdx, timestamp: new Date().toISOString() });

    const role = AdminSecurity.getRole();
    if (role !== ROLE_ABSOLUTE) {
        await showAlertModal("Permission Denied", "Only the absolute admin can perform this structural action.");
        return;
    }
    const round = currentData.rounds[rIdx];
    const totalRounds = currentData.rounds.length;
    const subsequentCount = totalRounds - rIdx;

    if (round.status === "locked") {
        await showAlertModal("Round Locked", "Cannot delete a locked round. You can unlock the final round if needed.");
        return;
    }

    const roundsToDelete = currentData.rounds.slice(rIdx);
    const totalMatchesToDelete = roundsToDelete.reduce((sum, r) => sum + (r.matches?.length || 0), 0);
    const bestLoserMatchesToDelete = roundsToDelete.reduce((sum, r) => {
        return sum + (r.matches?.filter(m => m.type === "best_loser").length || 0);
    }, 0);

    let confirmMsg = `You are about to DELETE:\n`;
    confirmMsg += `• ${subsequentCount} round${subsequentCount > 1 ? 's' : ''} (${roundsToDelete.map(r => r.name).join(', ')})\n`;
    confirmMsg += `• ${totalMatchesToDelete} match${totalMatchesToDelete !== 1 ? 'es' : ''} with all scores and results\n`;

    if (bestLoserMatchesToDelete > 0) {
        confirmMsg += `• ${bestLoserMatchesToDelete} Best Loser match${bestLoserMatchesToDelete !== 1 ? 'es' : ''}\n`;
    }

    confirmMsg += `\nThis action will:\n`;
    confirmMsg += `1. Permanently delete all listed rounds\n`;
    confirmMsg += `2. Remove all matches and scores from those rounds\n`;
    confirmMsg += `3. Remove all Best Loser matches in those rounds\n`;
    confirmMsg += `4. Cannot be undone (Undo history will be cleared)\n\n`;
    confirmMsg += `Are you sure you want to proceed?`;

    const firstConfirmed = await showConfirmModal(
        "⚠️ CRITICAL DELETION WARNING",
        confirmMsg,
        "Yes, Delete",
        "Cancel"
    );
    if (!firstConfirmed) {
        showStatus("Round deletion cancelled", "#64748b");
        return;
    }

    const verification = await showPromptModal(
        "FINAL CONFIRMATION",
        `This will permanently delete ${subsequentCount} round(s) and ${totalMatchesToDelete} match(es).\n\nType "CONFIRM REVERT" (all caps, exactly as shown) to proceed:`,
        "CONFIRM REVERT"
    );

    if (verification !== "CONFIRM REVERT") {
        showStatus("Round deletion cancelled - verification failed", "#ef4444");
        return;
    }

    if (CONFIG.debug) {
        console.log("=== CASCADE DELETE INITIATED ===");
        console.log("Deleting rounds from index:", rIdx);
        console.log("Rounds to delete:", roundsToDelete.map(r => r.name));
    }

    resetHistory();

    currentData.rounds = currentData.rounds.slice(0, rIdx);

    let unlockedRound = null;
    let removedBestLoser = false;
    if (rIdx > 0 && currentData.rounds.length > 0) {
        const previousRound = currentData.rounds[rIdx - 1];
        if (previousRound && previousRound.status === "locked") {
            previousRound.status = "active";
            unlockedRound = previousRound.name;

            const originalMatchCount = previousRound.matches.length;
            previousRound.matches = previousRound.matches.filter(m => m.type !== "best_loser");
            removedBestLoser = previousRound.matches.length < originalMatchCount;

            if (CONFIG.debug) {
                console.log(`Unlocked ${previousRound.name} after cascade deletion`);
                if (removedBestLoser) {
                    console.log(`Removed Best Loser match from ${previousRound.name} - will need recalculation`);
                }
            }
        }
    }

    if (currentData.rounds.length === 0) {
        currentData.rounds = [{
            id: 1,
            name: "Round 1",
            status: "active",
            matches: []
        }];
    }

    if (!currentData.auditLog) currentData.auditLog = [];
    currentData.auditLog.push({
        timestamp: new Date().toISOString(),
        action: "CASCADE_DELETE_ROUNDS",
        user: currentUser || "Unknown",
        details: {
            deletedRounds: roundsToDelete.map(r => r.name),
            matchesDeleted: totalMatchesToDelete,
            bestLoserMatchesDeleted: bestLoserMatchesToDelete,
            unlockedRound: unlockedRound || null,
            removedBestLoserFromUnlocked: removedBestLoser
        }
    });

    renderForm();
    updateSidebarStats();

    let statusMsg = `🗑️ Deleted ${subsequentCount} round(s) and ${totalMatchesToDelete} match(es).`;
    if (unlockedRound) {
        statusMsg += ` ${unlockedRound} unlocked`;
        if (removedBestLoser) {
            statusMsg += ` (Best Loser removed)`;
        }
        statusMsg += `.`;
    }
    statusMsg += ` Save to persist changes.`;

    showStatus(statusMsg, "#ef4444");

    await saveToGitHub();
}

/**
 * End tournament and lock the final round
 */
export async function endTournament(rIdx) {
    const currentData = store.getCurrentData();
    const currentUser = store.getCurrentUser();

    const overrideConfirmed = await showConfirmModal(
        "Structural Override",
        "You are performing a structural override. Continue?",
        "Continue",
        "Cancel"
    );
    if (!overrideConfirmed) {
        showStatus("Structural action cancelled.", "#64748b");
        return;
    }
    logStructuralAction("End Tournament", { admin: currentUser, roundIndex: rIdx, timestamp: new Date().toISOString() });

    const role = AdminSecurity.getRole();
    if (role !== ROLE_ABSOLUTE) {
        await showAlertModal("Permission Denied", "Only the absolute admin can perform this structural action.");
        return;
    }

    const confirmed = await showConfirmModal(
        "End Tournament",
        "Are you sure you want to end the tournament? This will lock the final round and prevent further changes.",
        "Yes, End Tournament",
        "Cancel"
    );

    if (!confirmed) return;

    saveHistorySnapshot();

    currentData.rounds[rIdx].status = "locked";

    if (!currentData.tournamentStatus) {
        currentData.tournamentStatus = "completed";
    }

    renderForm();
    updateSidebarStats();
    showStatus("🏁 Tournament ended! Final round locked. Save to publish.", "#7c3aed");
}

/**
 * Unlock the final round (only the last round) for absolute admin.
 * Allows editing after tournament ended, with appropriate warnings.
 * @param {number} rIdx - Index of the round to unlock
 */
export async function unlockFinalRound(rIdx) {
    const currentData = store.getCurrentData();
    const currentUser = store.getCurrentUser();
    const role = AdminSecurity.getRole();

    if (role !== ROLE_ABSOLUTE) {
        await showAlertModal("Permission Denied", "Only the absolute admin can unlock rounds.");
        return;
    }

    if (rIdx !== currentData.rounds.length - 1) {
        await showAlertModal("Invalid Round", "Only the final round can be unlocked.");
        return;
    }

    const round = currentData.rounds[rIdx];
    if (round.status !== "locked") {
        await showAlertModal("Round Not Locked", "This round is not locked.");
        return;
    }

    const confirmed = await showConfirmModal(
        "Unlock Final Round",
        "You are about to unlock the final round. This will allow editing of scores and results. The tournament will no longer be considered ended. Are you sure?",
        "Yes, Unlock",
        "Cancel"
    );
    if (!confirmed) return;

    round.status = "active";
    if (currentData.tournamentStatus) {
        delete currentData.tournamentStatus;
    }
    logStructuralAction("Unlock Final Round", { admin: currentUser, roundIndex: rIdx, roundName: round.name });
    renderForm();
    updateSidebarStats();
    showStatus(`🔓 Final round unlocked.`, "#3b82f6");
}