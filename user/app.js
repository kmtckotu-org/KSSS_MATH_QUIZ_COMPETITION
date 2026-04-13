// user/app.js
// Single JavaScript file for the entire user site.
// No imports. No modules. No connection to the admin side.
// Detects which page it is on and runs the correct logic.
// ─────────────────────────────────────────────────────────

"use strict";

// ── Config ──────────────────────────────────────────────────
const VERSION         = "2.2.5";
const DATA_PATH       = "../data/";          // relative to user/ folder
const MAX_FUTURE      = 3;
const MAX_PAST        = 3;
const MAX_TOTAL       = 6;
const SURVEY_KEY      = "ksss_survey_done";
const THEME_KEY       = "ksss-user-theme";
const POLL_INTERVAL   = 30_000;              // poll every 30 seconds for live changes

// Replace with your actual Netlify function URL after deploying
const SURVEY_ENDPOINT = "https://YOUR-NETLIFY-SITE.netlify.app/.netlify/functions/survey";

// ── Survey Questions ─────────────────────────────────────────
const QUESTIONS = [
  {
    text: "Are you a student at Kotu Senior Secondary School?",
    options: [
      "Yes, I am a current student",
      "I am a teacher or staff member",
      "I am a parent or guardian",
      "I am from another school",
      "Other"
    ]
  },
  {
    text: "Were you already aware of the KSSS Maths & Tech Club before visiting this site?",
    options: [
      "Yes, I know the club well",
      "I have heard of it but do not know much",
      "No, this is my first time hearing about it"
    ]
  },
  {
    text: "How did you find out about this website?",
    options: [
      "A club member told me",
      "A teacher or staff member mentioned it",
      "I saw it shared online or on social media",
      "I searched for it myself",
      "Other"
    ]
  },
  {
    text: "Did you know the club designs and builds real software used in the school?",
    options: [
      "Yes, I already knew that",
      "I suspected it but was not sure",
      "No, I did not know that"
    ]
  },
  {
    text: "Have you ever followed or participated in the KSSS Math Quiz Competition?",
    options: [
      "Yes, I competed in it",
      "Yes, I followed it as a spectator",
      "I heard about it but did not follow it",
      "No, this is my first time hearing about it"
    ]
  },
  {
    text: "How interested are you in joining or supporting the club?",
    options: [
      "Very interested — I want to join",
      "Somewhat interested — I want to know more",
      "I support it but do not want to join",
      "Not interested"
    ]
  },
  {
    text: "What would you most like to see from the club?",
    options: [
      "More mathematics competitions",
      "More technology projects and apps",
      "Workshops and training sessions",
      "Community and school outreach",
      "All of the above"
    ]
  }
];

// ── Theme ────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = document.getElementById("theme-icon");
  if (icon) icon.textContent = theme === "dark" ? "☀️" : "🌙";
}

function initTheme() {
  const saved       = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
}

function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const cur  = document.documentElement.getAttribute("data-theme") || "light";
    const next = cur === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });
}

// ── Date Parsing ─────────────────────────────────────────────
function cleanTime(t) {
  return t ? t.replace(/\s*\([^)]*\)/g, "").trim() : "";
}

function isPending(schedule) {
  if (!schedule) return true;
  const d = String(schedule.date ?? "").toLowerCase().trim();
  const t = String(schedule.time ?? "").toLowerCase().trim();
  return !d || d.includes("pending") || d.includes("tbd") ||
         t.includes("pending") || t.includes("tbd");
}

function parseDate(schedule) {
  if (isPending(schedule)) return new Date("9999-12-31");
  const raw  = String(schedule.date ?? "").trim();
  const time = cleanTime(String(schedule.time ?? "").trim());
  const year = new Date().getFullYear();
  let d = new Date(`${raw} ${year} ${time}`.trim());
  if (!isNaN(d)) return d;
  d = new Date(`${raw} ${time}`.trim());
  if (!isNaN(d)) return d;
  return new Date("9999-12-31");
}

function hasValidDate(schedule) {
  if (isPending(schedule)) return false;
  const d = parseDate(schedule);
  return !isNaN(d.getTime()) && d < new Date("9999-01-01");
}

// ── Skeleton / Error Helpers ────────────────────────────────
function showError(el, msg) {
  if (!el) return;
  el.innerHTML = `
    <div class="error-state">
      <p>⚠️ ${msg}</p>
      <button onclick="location.reload()">Retry</button>
    </div>`;
}

/** Renders N shimmer skeleton cards matching the real match-card layout */
function showSkeleton(el, count) {
  count = count || 3;
  const cards = Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skel skel-tag"></div>
      <div class="skel skel-tag-r"></div>
      <div class="skel skel-sched"></div>
      <div class="skel skel-sched2"></div>
      <div class="skel-teams">
        <div class="skel skel-team"></div>
        <div class="skel skel-vs-dot"></div>
        <div class="skel skel-team"></div>
      </div>
    </div>`).join("");
  el.innerHTML = `<div class="skeleton-grid">${cards}</div>`;
}

// ── Match Card HTML ──────────────────────────────────────────
function matchCardHTML(m, opts) {
  opts = opts || {};
  const isBestLoser = m.type === "best_loser";
  const tA = m.teamA || {};
  const tB = m.teamB || {};
  const hasScores = tA.points != null && tB.points != null;

  let clsA = "team", clsB = "team";
  if (hasScores) {
    if (tA.points > tB.points) clsA += " leading";
    if (tB.points > tA.points) clsB += " leading";
  }
  if (m.winner === tA.name) clsA += " winner";
  if (m.winner === tB.name) clsB += " winner";

  // Build tags
  let tags = "";
  if (opts.showGrade) {
    tags += `<div class="grade-tag">GRADE ${m.gradeLevel}</div>`;
  }
  if (isBestLoser) {
    tags += `<div class="best-loser-tag">🏆 Best Loser</div>`;
  } else if (opts.showPast && m._isPast) {
    tags += m.winner
      ? `<div class="past-tag">✅ Done</div>`
      : `<div class="past-tag">Past</div>`;
  }

  const ptsA = hasScores ? `<span class="team-pts" style="display:inline-block">${tA.points} pts</span>` : `<span class="team-pts"></span>`;
  const ptsB = hasScores ? `<span class="team-pts" style="display:inline-block">${tB.points} pts</span>` : `<span class="team-pts"></span>`;

  const sched = m.schedule || {};

  return `
    <div class="match-card${isBestLoser ? " best-loser" : ""}">
      ${tags}
      <div class="match-schedule">
        <div class="sched-date">${sched.date || "Pending"}</div>
        <div class="sched-time">${sched.time || "TBD"}</div>
        <div class="sched-location">${sched.location || "Maths Lab"}</div>
      </div>
      <div class="match-teams">
        <div class="${clsA}">
          <span class="team-name">${tA.name || "TBD"}</span>
          ${ptsA}
        </div>
        <span class="vs">VS</span>
        <div class="${clsB}">
          <span class="team-name">${tB.name || "TBD"}</span>
          ${ptsB}
        </div>
      </div>
    </div>`;
}

// ── JSON Fetch with in-memory cache (stale-while-revalidate) ────────────
// Each cache entry: { data: object, raw: string }
const _jsonCache = new Map();

async function fetchJSON(url) {
  const key = url + "?v=" + VERSION;
  // Return cached data instantly if already fetched
  if (_jsonCache.has(key)) return _jsonCache.get(key).data;

  const res = await fetch(key, { cache: "default" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  _jsonCache.set(key, { data, raw: JSON.stringify(data) });
  return data;
}

/**
 * Poll a URL every POLL_INTERVAL ms.
 * Uses `cache: "no-cache"` so the server always sends the latest file.
 * Calls onUpdate(newData) only when the content has actually changed.
 * Returns the interval ID so the caller can stop it.
 */
function pollForChanges(url, onUpdate) {
  const key = url + "?v=" + VERSION;

  async function check() {
    try {
      const res = await fetch(key, { cache: "no-cache" });
      if (!res.ok) return;
      const data = await res.json();
      const raw  = JSON.stringify(data);
      const cached = _jsonCache.get(key);
      // Only update if data actually changed
      if (!cached || cached.raw !== raw) {
        _jsonCache.set(key, { data, raw });
        onUpdate(data);
      }
    } catch (_) {
      // Silently ignore network errors during polling
    }
  }

  return setInterval(check, POLL_INTERVAL);
}

/** Silently pre-fetch all grade JSON files in the background. */
function prefetchAll() {
  ["10", "11", "12"].forEach(g => {
    fetchJSON(DATA_PATH + "competition-grade" + g + ".json").catch(() => {});
  });
}

// ── Toast notification ────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  let toast = document.getElementById("live-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "live-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

// ═══════════════════════════════════════════════════════════
// PAGE: SURVEY (survey.html)
// ═══════════════════════════════════════════════════════════
function initSurvey() {
  // If already completed, skip to home
  if (localStorage.getItem(SURVEY_KEY)) {
    location.replace("index.html");
    return;
  }

  const answers     = new Array(QUESTIONS.length).fill(null);
  let   currentIdx  = 0;

  const progressFill  = document.getElementById("progress-fill");
  const progressLabel = document.getElementById("progress-label");
  const questionEl    = document.getElementById("question-number");
  const questionText  = document.getElementById("question-text");
  const optionsList   = document.getElementById("options-list");
  const btnNext       = document.getElementById("btn-next");
  const btnPrev       = document.getElementById("btn-prev");
  const surveyForm    = document.getElementById("survey-form");
  const surveyDone    = document.getElementById("survey-submitting");

  function renderQuestion(idx) {
    const q   = QUESTIONS[idx];
    const pct = Math.round(((idx) / QUESTIONS.length) * 100);

    progressFill.style.width  = pct + "%";
    progressLabel.textContent = `Question ${idx + 1} of ${QUESTIONS.length}`;
    questionEl.textContent    = `Question ${idx + 1}`;
    questionText.textContent  = q.text;

    optionsList.innerHTML = q.options.map((opt, i) => `
      <button
        class="option-btn${answers[idx] === opt ? " selected" : ""}"
        data-value="${opt}"
        aria-pressed="${answers[idx] === opt}"
        type="button">
        <span class="option-indicator">${answers[idx] === opt ? "✓" : ""}</span>
        ${opt}
      </button>`).join("");

    // Attach click handlers
    optionsList.querySelectorAll(".option-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        answers[idx] = btn.dataset.value;
        // Re-render options to reflect selection
        optionsList.querySelectorAll(".option-btn").forEach(b => {
          const sel = b.dataset.value === answers[idx];
          b.classList.toggle("selected", sel);
          b.setAttribute("aria-pressed", sel);
          b.querySelector(".option-indicator").textContent = sel ? "✓" : "";
        });
        btnNext.disabled = false;
      });
    });

    // Prev button visibility
    btnPrev.style.display = idx > 0 ? "flex" : "none";

    // Next button state
    btnNext.disabled  = answers[idx] === null;
    btnNext.textContent = idx === QUESTIONS.length - 1 ? "Submit →" : "Next →";
  }

  btnNext.addEventListener("click", async () => {
    if (answers[currentIdx] === null) return;

    if (currentIdx < QUESTIONS.length - 1) {
      currentIdx++;
      renderQuestion(currentIdx);
    } else {
      // All answered — submit
      surveyForm.style.display      = "none";
      surveyDone.style.display      = "block";

      try {
        await fetch(SURVEY_ENDPOINT, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(answers)
        });
      } catch (e) {
        // Even if submission fails, let the user through
        console.warn("Survey submission failed:", e.message);
      }

      localStorage.setItem(SURVEY_KEY, "1");

      // Give user a moment to see the thank-you state, then go home
      setTimeout(() => {
        location.replace("index.html");
      }, 1800);
    }
  });

  btnPrev.addEventListener("click", () => {
    if (currentIdx > 0) {
      currentIdx--;
      renderQuestion(currentIdx);
    }
  });

  // Initial render
  renderQuestion(0);
}

// ═══════════════════════════════════════════════════════════
// PAGE: HOME (index.html)
// ═══════════════════════════════════════════════════════════
function initHome() {
  if (!localStorage.getItem(SURVEY_KEY)) {
    location.replace("survey.html");
    return;
  }

  const container = document.getElementById("matches-container");
  if (!container) return;

  showSkeleton(container, 3);

  const grades = ["10", "11", "12"];

  /** Build and inject the match grid from an array of grade results */
  function renderHome(results, isLiveUpdate) {
    const allMatches = results.flatMap(r => {
      if (!r || !r.data) return [];
      const gradeLevel = r.data.grade || r.grade;
      return (r.data.rounds || []).flatMap(round =>
        (round.matches || []).map(m => ({ ...m, gradeLevel }))
      );
    });

    const valid = allMatches.filter(m => hasValidDate(m.schedule));
    const today = new Date(); today.setHours(0, 0, 0, 0);

    function isPast(m) {
      const d = new Date(parseDate(m.schedule)); d.setHours(0, 0, 0, 0);
      return d < today;
    }

    const future = valid
      .filter(m => !isPast(m))
      .sort((a, b) => parseDate(a.schedule) - parseDate(b.schedule));

    const past = valid
      .filter(m => isPast(m))
      .sort((a, b) => parseDate(b.schedule) - parseDate(a.schedule));

    let display;
    if (future.length === 0) {
      display = past.slice(0, MAX_TOTAL);
    } else {
      display = [
        ...future.slice(0, MAX_FUTURE).map(m => ({ ...m, _isPast: false })),
        ...past.slice(0,   MAX_PAST  ).map(m => ({ ...m, _isPast: true  }))
      ];
    }

    if (display.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📅</div>
          <p>No matches to display right now.</p>
          <p>Check back soon!</p>
        </div>`;
    } else {
      container.innerHTML = `<div class="matches-grid">${
        display.map(m => matchCardHTML(m, { showGrade: true, showPast: true })).join("")
      }</div>`;
    }

    if (isLiveUpdate) showToast("✓ Scores updated");
  }

  // Initial fetch — show data as soon as it arrives
  Promise.all(
    grades.map(g =>
      fetchJSON(DATA_PATH + "competition-grade" + g + ".json")
        .then(data => ({ data, grade: g }))
        .catch(() => null)
    )
  ).then(results => {
    renderHome(results, false);
    prefetchAll();
  }).catch(err => {
    showError(container, "Could not load match data. Please check your connection.");
    console.error(err);
  });

  // Live polling — re-fetch each grade every 30 s; re-render if anything changed
  grades.forEach(g => {
    const url = DATA_PATH + "competition-grade" + g + ".json";
    pollForChanges(url, () => {
      // One or more grades changed — re-fetch all and re-render
      Promise.all(
        grades.map(gr =>
          fetchJSON(DATA_PATH + "competition-grade" + gr + ".json")
            .then(data => ({ data, grade: gr }))
            .catch(() => null)
        )
      ).then(results => renderHome(results, true)).catch(() => {});
    });
  });
}

// ═══════════════════════════════════════════════════════════
// PAGE: BRACKET (bracket.html)
// ═══════════════════════════════════════════════════════════
function initBracket() {
  if (!localStorage.getItem(SURVEY_KEY)) {
    location.replace("survey.html");
    return;
  }

  const params    = new URLSearchParams(window.location.search);
  const grade     = params.get("grade") || "10";
  const container = document.getElementById("bracket-container");
  const titleEl   = document.getElementById("page-title");

  if (titleEl) {
    titleEl.textContent = "Grade " + grade + " – Math Quiz Competition";
    document.title      = "Grade " + grade + " Math Quiz Bracket";
  }

  document.querySelectorAll(".tab-list a[data-grade]").forEach(a => {
    a.classList.toggle("active", a.dataset.grade === grade);
  });

  if (!container) return;
  showSkeleton(container, 4);

  const colorClasses = ["round-1","round-2","round-3","round-4","round-5","round-6"];

  /** Build and inject the round/match HTML from a data object */
  function renderBracket(data, isLiveUpdate) {
    const rounds = Array.isArray(data.rounds) ? data.rounds : [];

    if (rounds.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">🏆</div>
          <p>No rounds available for Grade ${grade} yet.</p>
        </div>`;
      return;
    }

    container.innerHTML = rounds.map((round, idx) => {
      const colorClass = colorClasses[(round.id ? round.id - 1 : idx) % colorClasses.length];
      const isLocked   = round.status === "locked";

      const matches = [...(round.matches || [])].sort((a, b) => {
        const pa = isPending(a.schedule);
        const pb = isPending(b.schedule);
        if (pa && !pb) return 1;
        if (!pa && pb) return -1;
        return parseDate(a.schedule) - parseDate(b.schedule);
      });

      const cardElements = matches.map(m => {
        const isBL   = m.type === "best_loser";
        const tA     = m.teamA || {};
        const tB     = m.teamB || {};
        const hasSc  = tA.points != null && tB.points != null;
        let cA = "team", cB = "team";
        if (hasSc) {
          if (tA.points > tB.points) cA += " leading";
          if (tB.points > tA.points) cB += " leading";
        }
        if (m.winner === tA.name) cA += " winner";
        if (m.winner === tB.name) cB += " winner";
        const ptsA = hasSc ? `<span class="team-pts" style="display:inline-block">${tA.points} pts</span>` : `<span class="team-pts"></span>`;
        const ptsB = hasSc ? `<span class="team-pts" style="display:inline-block">${tB.points} pts</span>` : `<span class="team-pts"></span>`;
        const sched = m.schedule || {};
        const roundBadge = isBL
          ? `<div class="best-loser-tag">🏆 Best Loser Playoff</div>`
          : `<div class="round-badge">${round.name || "Round " + (round.id || idx + 1)}</div>`;

        return `
          <div class="match-card${isBL ? " best-loser" : ""}">
            ${roundBadge}
            <div class="match-schedule">
              <div class="sched-date">${sched.date || "Pending"}</div>
              <div class="sched-time">${sched.time || "TBD"}</div>
              <div class="sched-location">${sched.location || "Maths Lab"}</div>
            </div>
            <div class="match-teams">
              <div class="${cA}">
                <span class="team-name">${tA.name || "TBD"}</span>
                ${ptsA}
              </div>
              <span class="vs">VS</span>
              <div class="${cB}">
                <span class="team-name">${tB.name || "TBD"}</span>
                ${ptsB}
              </div>
            </div>
          </div>`;
      }).join("");

      return `
        <div class="round-section ${colorClass}">
          <div class="round-title">
            ${round.name || "Round " + (round.id || idx + 1)}
            ${isLocked ? " 🔒" : ""}
          </div>
          <div class="matches-grid">${cardElements}</div>
        </div>`;
    }).join("");

    if (isLiveUpdate) showToast("✓ Bracket updated");
  }

  // Initial fetch
  const gradeUrl = DATA_PATH + "competition-grade" + grade + ".json";
  fetchJSON(gradeUrl)
    .then(data => {
      renderBracket(data, false);
      // Pre-fetch other grades silently
      ["10","11","12"].filter(g => g !== grade).forEach(g => {
        fetchJSON(DATA_PATH + "competition-grade" + g + ".json").catch(() => {});
      });
    })
    .catch(err => {
      showError(container, "Could not load bracket for Grade " + grade + ".");
      console.error(err);
    });

  // Live polling — re-render automatically when data changes
  pollForChanges(gradeUrl, data => renderBracket(data, true));
}

// ──────────────────────────────────────────────────────────────
// SPA NAVIGATION
// Every page starts with #page-transition at opacity:1 (covers
// the page). On first rAF we add .ready → fades to opacity:0
// (page fades IN). When navigating away we remove .ready →
// fades to opacity:1 (covers page), then redirect after the
// transition duration. Result: seamless fade-to-fade transitions
// with zero white flash on any device or network speed.
// ──────────────────────────────────────────────────────────────
function setupSpaNav() {
  const overlay = document.getElementById("page-transition");
  if (!overlay) return;

  // ── Fade IN on page load ──────────────────────────────────
  // Two rAF calls guarantee the browser has painted one frame
  // at opacity:1 before we start the transition to opacity:0.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add("ready");
    });
  });

  // ── Fade OUT then navigate ────────────────────────────────
  function navigate(href) {
    if (overlay.dataset.navigating) return; // prevent double-click
    overlay.dataset.navigating = "1";
    overlay.classList.remove("ready");   // triggers fade to opacity:1
    setTimeout(() => {
      window.location.href = href;
    }, 300); // slightly longer than CSS transition (280ms) for safety
  }

  // ── Attach to nav links ───────────────────────────────────
  // Use delegation so dynamically-rendered links also work.
  document.addEventListener("click", (e) => {
    const link = e.target.closest(".tab-list a, .back-btn");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("#")) return;
    e.preventDefault();
    navigate(href);
  });
}

// ═══════════════════════════════════════════════════════════
// ROUTER — detect page and initialize
// ═══════════════════════════════════════════════════════════
function init() {
  initTheme();
  setupThemeToggle();
  setupSpaNav();

  const path = window.location.pathname;

  if (path.includes("survey"))  { initSurvey();  return; }
  if (path.includes("bracket")) { initBracket(); return; }

  // Default → home (index.html)
  initHome();
}

// Run after DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
