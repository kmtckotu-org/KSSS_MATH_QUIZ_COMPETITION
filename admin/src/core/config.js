const DEFAULT_CONFIG = {
    owner: "KMTC-org",
    repo: "KSSS_MATH_QUIZ_COMPETITION-now"
};

function resolveRepositoryConfig() {
    const params = new URLSearchParams(window.location.search);
    const ownerFromQuery = (params.get("owner") || "").trim();
    const repoFromQuery = (params.get("repo") || "").trim();

    let ownerFromStorage = "";
    let repoFromStorage = "";

    try {
        ownerFromStorage = (localStorage.getItem("ksss_repo_owner") || "").trim();
        repoFromStorage = (localStorage.getItem("ksss_repo_name") || "").trim();
        if (ownerFromQuery && repoFromQuery) {
            localStorage.setItem("ksss_repo_owner", ownerFromQuery);
            localStorage.setItem("ksss_repo_name", repoFromQuery);
        }
    } catch (e) { /* ignore */ }

    return {
        owner: ownerFromQuery || ownerFromStorage || DEFAULT_CONFIG.owner,
        repo: repoFromQuery || repoFromStorage || DEFAULT_CONFIG.repo
    };
}

const repositoryConfig = resolveRepositoryConfig();

export const CONFIG = {
    owner: repositoryConfig.owner,
    repo: repositoryConfig.repo,
    version: "2.2.9",
    // Debug mode: set true here to enable, or toggle at runtime via:
    //   localStorage.setItem('ksss_debug', 'true')  → then refresh to enable
    //   localStorage.removeItem('ksss_debug')        → then refresh to disable
    get debug() {
        try {
            // Runtime toggle takes priority; hardcoded fallback = true
            const stored = localStorage.getItem('ksss_debug');
            if (stored === 'false') return false;
            if (stored === 'true')  return true;
            return true; // hardcoded ON — change to false to disable by default
        } catch { return true; }
    }
};

// Expose to non-module scripts (e.g. the standalone debug bootstrapper in index.html)
try { window._KSSS_DEBUG_FLAG = CONFIG.debug; } catch(e) {}