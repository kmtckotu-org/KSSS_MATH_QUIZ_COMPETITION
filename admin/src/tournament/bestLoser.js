import { store } from '../core/store.js';
import { getLosersSorted, hasBestLoserMatch } from './rounds.js';
import { saveHistorySnapshot } from '../core/history.js';
import { renderForm, updateSidebarStats } from '../ui/render.js';
import { closeBestLoserModal } from '../ui/modals.js';
import { showStatus } from '../utils/dom.js';
import { saveToGitHub } from '../api/github.js';
import { showAlertModal } from '../ui/modals.js'; // ADDED

export async function overrideBestLoserSave(rIdx) {
    const overrideTeam = document.getElementById("loser-override").value;
    if (!overrideTeam) {
        await showAlertModal("Missing Selection", "Please select a team to override the Best Loser.");
        return;
    }

    const currentData = store.getCurrentData();
    const round = currentData.rounds[rIdx];

    saveHistorySnapshot();

    round.overrideBestLoser = overrideTeam;

    closeBestLoserModal();
    renderForm();
    updateSidebarStats();

    if (window.KSSS_UI_HOOKS?.saveToGitHub) {
        await window.KSSS_UI_HOOKS.saveToGitHub();
    } else {
        await saveToGitHub();
    }
    showStatus("✅ Best Loser override saved natively!", "#16a34a");
}