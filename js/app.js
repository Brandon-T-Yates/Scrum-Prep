/**
 * Shared Scrum certification practice engine.
 *
 * Each practice page provides its question source and stats key through data
 * attributes on <body>. Run through a local web server so fetch() can load the
 * configured JSON question bank.
 */

// Configuration
const CONFIG = {
  examSize: 80,
  examDurationSeconds: 3600,
  passingScore: 85,
  themeStorageKey: "pspo-theme",
  practiceStatsKey: document.body.dataset.practiceStatsKey || "pspo-practice-stats",
  questionSource: document.body.dataset.questionSource || "./data/questions.json",
  certificationName: document.body.dataset.certificationName || "Scrum certification",
  letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  mobileNavigatorMaxWidth: 560,
};

// Application State
const state = {
  questionBank: [],
  questions: [],
  attemptSize: CONFIG.examSize,
  currentQuestionIndex: 0,
  answers: {},
  reviewed: {},
  mode: null,
  secondsRemaining: CONFIG.examDurationSeconds,
  timerRunning: false,
  timerIntervalId: null,
  examStartedAt: null,
  examEndedAt: null,
  examSubmitting: false,
  lastMissedQuestions: [],
  completedAttempt: null,
  lastExamResults: null,
  isLoaded: false,
};

// DOM References
const dom = {
  loadError: document.getElementById("loadError"),
  startScreen: document.getElementById("startScreen"),
  examView: document.getElementById("examView"),
  examCard: document.getElementById("examCard"),
  results: document.getElementById("results"),
  themeToggleStart: document.getElementById("themeToggleStart"),
  themeToggleExam: document.getElementById("themeToggleExam"),
  modeTitle: document.getElementById("modeTitle"),
  modeSubtitle: document.getElementById("modeSubtitle"),
  timerCard: document.getElementById("timerCard"),
  timer: document.getElementById("timer"),
  answeredSummary: document.getElementById("answeredSummary"),
  progressBar: document.getElementById("progressBar"),
  progressFill: document.getElementById("progressFill"),
  progressPct: document.getElementById("progressPct"),
  navigator: document.getElementById("navigator"),
  navigatorToggle: document.getElementById("navigatorToggle"),
  navigatorSummary: document.getElementById("navigatorSummary"),
  navigatorLegend: document.getElementById("navigatorLegend"),
  questionGrid: document.getElementById("questionGrid"),
  questionCount: document.getElementById("questionCount"),
  questionType: document.getElementById("questionType"),
  questionText: document.getElementById("questionText"),
  options: document.getElementById("options"),
  reviewFeedback: document.getElementById("reviewFeedback"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  checkBtn: document.getElementById("checkBtn"),
  submitBtn: document.getElementById("submitBtn"),
  helperText: document.getElementById("helperText"),
  backToModesBtn: document.getElementById("backToModesBtn"),
  startTimedBtn: document.getElementById("startTimedBtn"),
  startReviewBtn: document.getElementById("startReviewBtn"),
  disclaimerDialog: document.getElementById("disclaimerDialog"),
  disclaimerCancelBtn: document.getElementById("disclaimerCancelBtn"),
  disclaimerStartBtn: document.getElementById("disclaimerStartBtn"),
  practiceStats: document.getElementById("practiceStats"),
  statLastAttempt: document.getElementById("statLastAttempt"),
  statLastAttemptMeta: document.getElementById("statLastAttemptMeta"),
  statBestScore: document.getElementById("statBestScore"),
  statBestScoreMeta: document.getElementById("statBestScoreMeta"),
  statFastestPassBlock: document.getElementById("statFastestPassBlock"),
  statFastestPass: document.getElementById("statFastestPass"),
  statFastestPassMeta: document.getElementById("statFastestPassMeta"),
};

// Utilities
function shuffledCopy(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatElapsedTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function formatElapsedDuration(totalMs) {
  return formatElapsedTime(Math.floor(totalMs / 1000));
}

function formatPercent(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function sameAnswer(selected, correct) {
  const a = [...(selected || [])].sort((x, y) => x - y);
  const b = [...correct].sort((x, y) => x - y);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isReviewLikeMode() {
  return state.mode === "review" || state.mode === "missedReview";
}

function isAnswerReviewMode() {
  return state.mode === "answerReview";
}

function isInteractiveReviewMode() {
  return isReviewLikeMode();
}

function isMobileNavigator() {
  return window.matchMedia(`(max-width: ${CONFIG.mobileNavigatorMaxWidth}px)`).matches;
}

function answeredCount() {
  return state.questions.filter((question) => (state.answers[question.id] || []).length).length;
}

function reviewedCount() {
  return Object.keys(state.reviewed).length;
}

function unansweredCount() {
  return state.questions.length - answeredCount();
}

function isLastQuestion() {
  return state.currentQuestionIndex === state.questions.length - 1;
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToQuestion() {
  const target = dom.examCard || dom.examView;
  if (!target) return;
  target.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

function setButtonsDisabled(disabled) {
  dom.startTimedBtn.disabled = disabled;
  dom.startReviewBtn.disabled = disabled;
}

// Question Selection
/**
 * Select random questions for an attempt.
 * Supports optional future filters: category, difficulty.
 * Does not mutate the master question bank.
 */
function selectQuestions({ count = CONFIG.examSize, category, difficulty } = {}) {
  let pool = state.questionBank;

  if (category !== undefined) {
    pool = pool.filter((question) => question.category === category);
  }

  if (difficulty !== undefined) {
    pool = pool.filter((question) => question.difficulty === difficulty);
  }

  const targetCount = Math.min(count, pool.length);
  return shuffledCopy(pool).slice(0, targetCount).map((question) => ({ ...question }));
}

function createAttempt() {
  return selectQuestions({ count: CONFIG.examSize });
}

function getQuestionResultStatus(question, userAnswer) {
  if (!userAnswer || userAnswer.length === 0) {
    return "unanswered";
  }
  return sameAnswer(userAnswer, question.correct) ? "correct" : "incorrect";
}

function formatAnswerLetters(indices) {
  if (!indices || !indices.length) {
    return "Unanswered";
  }

  const letters = [...indices]
    .sort((a, b) => a - b)
    .map((index) => CONFIG.letters[index]);

  if (letters.length === 1) return letters[0];
  if (letters.length === 2) return `${letters[0]} and ${letters[1]}`;
  return `${letters.slice(0, -1).join(", ")}, and ${letters[letters.length - 1]}`;
}

function getAnswerReviewStatusLabel(status) {
  if (status === "correct") return "✓ Correct";
  if (status === "incorrect") return "✕ Incorrect";
  return "— Unanswered";
}

// Practice Stats
function createEmptyPracticeStats() {
  return {
    version: 1,
    lastAttempt: null,
    bestScore: null,
    fastestPass: null,
  };
}

function isValidAttemptRecord(record) {
  return Boolean(
    record
    && typeof record.score === "number"
    && typeof record.total === "number"
    && typeof record.percentage === "number"
    && typeof record.elapsedSeconds === "number"
    && typeof record.passed === "boolean"
  );
}

function loadPracticeStats() {
  try {
    const raw = localStorage.getItem(CONFIG.practiceStatsKey);
    if (!raw) return createEmptyPracticeStats();

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return createEmptyPracticeStats();

    return {
      version: 1,
      lastAttempt: isValidAttemptRecord(parsed.lastAttempt) ? parsed.lastAttempt : null,
      bestScore: isValidAttemptRecord(parsed.bestScore) ? parsed.bestScore : null,
      fastestPass: isValidAttemptRecord(parsed.fastestPass) ? parsed.fastestPass : null,
    };
  } catch (error) {
    console.warn("Unable to load practice stats:", error);
    return createEmptyPracticeStats();
  }
}

function savePracticeStats(stats) {
  try {
    localStorage.setItem(CONFIG.practiceStatsKey, JSON.stringify(stats));
  } catch (error) {
    console.warn("Unable to save practice stats:", error);
  }
}

function formatCompletionDate(isoString) {
  if (!isoString) return "";

  const completed = new Date(isoString);
  const now = new Date();
  const completedDay = new Date(completed.getFullYear(), completed.getMonth(), completed.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today - completedDay) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return completed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderPracticeStats(stats = loadPracticeStats()) {
  if (!dom.practiceStats) return;

  if (!stats.lastAttempt) {
    dom.practiceStats.classList.add("hidden");
    return;
  }

  dom.practiceStats.classList.remove("hidden");

  dom.statLastAttempt.textContent =
    `${formatPercent(stats.lastAttempt.percentage)}% • ${formatElapsedTime(stats.lastAttempt.elapsedSeconds)}`;
  dom.statLastAttemptMeta.textContent = [
    stats.lastAttempt.passed ? "Passed" : "Did not pass",
    formatCompletionDate(stats.lastAttempt.completedAt),
  ].filter(Boolean).join(" · ");
  dom.statLastAttemptMeta.className = `practice-stat-meta ${stats.lastAttempt.passed ? "pass" : "fail"}`;

  if (stats.bestScore) {
    dom.statBestScore.textContent = `${formatPercent(stats.bestScore.percentage)}%`;
    dom.statBestScoreMeta.textContent = `${stats.bestScore.score} / ${stats.bestScore.total}`;
  }

  if (stats.fastestPass) {
    dom.statFastestPassBlock.classList.remove("hidden");
    dom.statFastestPass.textContent = formatElapsedTime(stats.fastestPass.elapsedSeconds);
    dom.statFastestPassMeta.textContent =
      `${formatPercent(stats.fastestPass.percentage)}% · ${stats.fastestPass.score} / ${stats.fastestPass.total}`;
  } else {
    dom.statFastestPassBlock.classList.add("hidden");
  }
}

function recordTimedExamStats(summary) {
  const stats = loadPracticeStats();
  const attemptRecord = {
    score: summary.correctCount,
    total: summary.total,
    percentage: summary.percent,
    passed: summary.passed,
    elapsedSeconds: summary.elapsedSeconds,
    completedAt: new Date().toISOString(),
  };

  stats.lastAttempt = attemptRecord;

  if (!stats.bestScore || summary.percent > stats.bestScore.percentage) {
    stats.bestScore = attemptRecord;
  }

  if (summary.passed) {
    if (!stats.fastestPass || summary.elapsedSeconds < stats.fastestPass.elapsedSeconds) {
      stats.fastestPass = attemptRecord;
    }
  }

  savePracticeStats(stats);
  renderPracticeStats(stats);
}

// Category Performance
function calculateCategoryPerformance(questions, answers) {
  const categories = new Map();

  questions.forEach((question) => {
    if (question.category === undefined) return;

    if (!categories.has(question.category)) {
      categories.set(question.category, {
        category: question.category,
        total: 0,
        correct: 0,
        incorrect: 0,
        unanswered: 0,
      });
    }

    const entry = categories.get(question.category);
    const userAnswer = answers[question.id] || [];
    const status = getQuestionResultStatus(question, userAnswer);

    entry.total += 1;
    entry[status] += 1;
  });

  return [...categories.values()]
    .map((entry) => ({
      ...entry,
      percentage: entry.total ? Math.round((entry.correct / entry.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function buildCategoryPerformanceHtml(categories, examTotal) {
  if (!categories.length) return "";

  const categorizedTotal = categories.reduce((sum, entry) => sum + entry.total, 0);
  const partialCoverage = categorizedTotal < examTotal;

  let html = `<section class="category-performance" aria-label="Performance by category">
    <h3>Performance by category</h3>`;

  if (partialCoverage) {
    html += `<p class="category-performance-note">Category breakdown based on ${categorizedTotal} of ${examTotal} questions.</p>`;
  }

  html += `<div class="category-list">`;
  categories.forEach((entry) => {
    html += `
      <div class="category-row">
        <div class="category-row-head">
          <span>${escapeHtml(entry.category)}</span>
          <span class="category-row-score">${entry.correct} / ${entry.total} — ${formatPercent(entry.percentage)}%</span>
        </div>
        <div class="category-row-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${entry.percentage}">
          <div class="category-row-fill" style="width:${entry.percentage}%"></div>
        </div>
      </div>`;
  });
  html += `</div></section>`;

  return html;
}

function saveCompletedAttempt(summary) {
  const results = {};

  state.questions.forEach((question) => {
    results[question.id] = getQuestionResultStatus(question, state.answers[question.id]);
  });

  state.completedAttempt = {
    questions: state.questions.map((question) => ({ ...question })),
    answers: JSON.parse(JSON.stringify(state.answers)),
    results,
    summary: { ...summary },
  };
}

// Data Loading
async function loadQuestionBank() {
  try {
    const response = await fetch(CONFIG.questionSource);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Question bank is empty or invalid.");
    }

    state.questionBank = data;
    state.isLoaded = true;
    setButtonsDisabled(false);
    dom.loadError.classList.add("hidden");
  } catch (error) {
    console.error("Failed to load question bank:", error);
    state.isLoaded = false;
    setButtonsDisabled(true);
    dom.loadError.textContent =
      `Unable to load the ${CONFIG.certificationName} question bank. If you're opening this project directly from your computer, run it through a local web server.`;
    dom.loadError.classList.remove("hidden");
  }
}

// Theme
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(CONFIG.themeStorageKey, theme);

  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  const text = isDark ? "☀️ Light" : "🌙 Dark";

  [dom.themeToggleStart, dom.themeToggleExam].forEach((button) => {
    if (!button) return;
    button.textContent = text;
    button.setAttribute("aria-label", label);
  });
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
}

function initTheme() {
  const stored = localStorage.getItem(CONFIG.themeStorageKey);
  if (stored === "light" || stored === "dark") {
    applyTheme(stored);
    return;
  }

  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

// Disclaimer
function openDisclaimer() {
  if (!ensureQuestionsLoaded()) return;

  dom.disclaimerDialog.classList.remove("hidden");
  dom.disclaimerDialog.setAttribute("aria-hidden", "false");
  dom.disclaimerStartBtn.focus();
}

function closeDisclaimer() {
  dom.disclaimerDialog.classList.add("hidden");
  dom.disclaimerDialog.setAttribute("aria-hidden", "true");
  dom.startTimedBtn.focus();
}

function handleDisclaimerKeydown(event) {
  if (event.key === "Escape" && !dom.disclaimerDialog.classList.contains("hidden")) {
    closeDisclaimer();
  }
}

// Mobile Navigator
function setNavigatorExpanded(expanded) {
  if (!dom.navigator || !dom.navigatorToggle) return;

  dom.navigator.classList.toggle("navigator-collapsed", !expanded);
  dom.navigatorToggle.setAttribute("aria-expanded", String(expanded));
  dom.navigatorToggle.textContent = expanded ? "Hide questions" : "Show questions";
}

function initNavigatorForViewport() {
  if (!dom.navigator) return;

  if (isMobileNavigator()) {
    setNavigatorExpanded(false);
  } else {
    dom.navigator.classList.remove("navigator-collapsed");
    dom.navigatorToggle.setAttribute("aria-expanded", "true");
    dom.navigatorToggle.textContent = "Hide questions";
  }
}

function updateNavigatorSummary() {
  if (!dom.navigatorSummary) return;

  const total = state.questions.length;

  if (isAnswerReviewMode()) {
    dom.navigatorSummary.textContent = `— ${state.currentQuestionIndex + 1} / ${total}`;
    return;
  }

  if (isReviewLikeMode()) {
    dom.navigatorSummary.textContent = `— ${reviewedCount()} / ${total}`;
    return;
  }

  dom.navigatorSummary.textContent = `— ${answeredCount()} / ${total}`;
}

// Exam Setup
function ensureQuestionsLoaded() {
  if (!state.isLoaded) {
    dom.loadError.classList.remove("hidden");
    return false;
  }
  if (state.questionBank.length < CONFIG.examSize) {
    dom.loadError.textContent = `The question bank only has ${state.questionBank.length} questions, but this exam requires ${CONFIG.examSize}.`;
    dom.loadError.classList.remove("hidden");
    return false;
  }
  return true;
}

function clearTimerInterval() {
  if (state.timerIntervalId) {
    clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
  }
}

function stopTimer() {
  state.timerRunning = false;
  clearTimerInterval();
}

function resetAttemptState() {
  stopTimer();
  state.questions = [];
  state.attemptSize = CONFIG.examSize;
  state.currentQuestionIndex = 0;
  state.answers = {};
  state.reviewed = {};
  state.secondsRemaining = CONFIG.examDurationSeconds;
  state.examStartedAt = null;
  state.examEndedAt = null;
  state.examSubmitting = false;
}

function configureReviewLikeSession({ title, subtitle, legendMode }) {
  dom.modeTitle.textContent = title;
  dom.modeSubtitle.textContent = subtitle;
  dom.timerCard.classList.add("hidden");
  dom.submitBtn.classList.add("hidden");
  dom.checkBtn.classList.remove("hidden");
  dom.nextBtn.classList.remove("hidden");
  dom.helperText.textContent =
    "Choose your answer, then select Check answer to reveal whether you were correct and why.";
  updateNavigatorLegend(legendMode);
  state.timerRunning = false;
}

function startMode(selectedMode) {
  if (!ensureQuestionsLoaded()) return;

  resetAttemptState();
  state.mode = selectedMode;

  if (selectedMode === "timed") {
    state.questions = createAttempt();
  } else {
    state.questions = createAttempt();
  }

  state.attemptSize = state.questions.length;

  dom.startScreen.classList.add("hidden");
  dom.results.style.display = "none";
  dom.results.innerHTML = "";
  dom.examView.classList.remove("hidden");
  dom.examView.setAttribute("aria-hidden", "false");
  initNavigatorForViewport();

  if (selectedMode === "timed") {
    dom.modeTitle.textContent = "Timed Practice Exam";
    dom.modeSubtitle.textContent = `${state.attemptSize} questions · 60 minutes · 85% passing score`;
    dom.timerCard.classList.remove("hidden");
    dom.checkBtn.classList.add("hidden");
    dom.submitBtn.classList.add("hidden");
    dom.nextBtn.classList.remove("hidden");
    updateHelperText();
    updateNavigatorLegend("timed");

    state.examStartedAt = Date.now();
    state.secondsRemaining = CONFIG.examDurationSeconds;
    dom.timer.textContent = formatCountdown(state.secondsRemaining);
    startTimer();
  } else {
    configureReviewLikeSession({
      title: "Review Mode",
      subtitle: `${state.attemptSize} questions · Untimed · Instant feedback`,
      legendMode: "review",
    });
  }

  renderQuestion();
}

function startMissedReview(questions) {
  if (!questions.length) return;

  resetAttemptState();
  state.mode = "missedReview";
  state.questions = questions.map((question) => ({ ...question }));
  state.attemptSize = state.questions.length;

  dom.startScreen.classList.add("hidden");
  dom.results.style.display = "none";
  dom.results.innerHTML = "";
  dom.examView.classList.remove("hidden");
  dom.examView.setAttribute("aria-hidden", "false");
  initNavigatorForViewport();

  configureReviewLikeSession({
    title: "Review Missed Questions",
    subtitle: "Review the questions you missed on your last attempt.",
    legendMode: "review",
  });

  renderQuestion();
  scrollToTop();
}

function startAnswerReview() {
  if (!state.completedAttempt) return;

  stopTimer();
  state.mode = "answerReview";
  state.questions = state.completedAttempt.questions.map((question) => ({ ...question }));
  state.answers = JSON.parse(JSON.stringify(state.completedAttempt.answers));
  state.reviewed = {};
  state.attemptSize = state.questions.length;
  state.currentQuestionIndex = 0;

  dom.results.style.display = "none";
  dom.examView.classList.remove("hidden");
  dom.examView.setAttribute("aria-hidden", "false");
  initNavigatorForViewport();

  dom.modeTitle.textContent = "Review Your Answers";
  dom.modeSubtitle.textContent =
    `Review all ${state.attemptSize} questions from your completed practice exam.`;
  dom.timerCard.classList.add("hidden");
  dom.submitBtn.classList.add("hidden");
  dom.checkBtn.classList.add("hidden");
  dom.nextBtn.classList.remove("hidden");
  dom.helperText.textContent = "Browse each question to see your answer, the correct answer, and the explanation.";
  updateNavigatorLegend("answerReview");
  state.timerRunning = false;

  renderQuestion();
  scrollToTop();
}

function backToResults() {
  if (!state.lastExamResults) {
    backHome();
    return;
  }

  state.mode = null;
  state.questions = [];
  state.answers = {};
  state.reviewed = {};
  state.currentQuestionIndex = 0;

  dom.examView.classList.add("hidden");
  dom.examView.setAttribute("aria-hidden", "true");
  dom.nextBtn.textContent = "Next →";
  renderResultsScreen(state.lastExamResults);
  scrollToTop();
}

function updateNavigatorLegend(mode) {
  if (mode === "answerReview") {
    dom.navigatorLegend.innerHTML = `
      <span class="legend-item"><span class="dot result-correct" aria-hidden="true"></span> Correct</span>
      <span class="legend-item"><span class="dot result-incorrect" aria-hidden="true"></span> Incorrect</span>
      <span class="legend-item"><span class="dot result-unanswered" aria-hidden="true"></span> Unanswered</span>
      <span class="legend-item"><span class="dot current" aria-hidden="true"></span> Current</span>`;
    return;
  }

  if (mode === "review") {
    dom.navigatorLegend.innerHTML = `
      <span class="legend-item"><span class="dot" aria-hidden="true"></span> Unreviewed</span>
      <span class="legend-item"><span class="dot reviewed" aria-hidden="true"></span> Reviewed</span>
      <span class="legend-item"><span class="dot current" aria-hidden="true"></span> Current</span>`;
    return;
  }

  dom.navigatorLegend.innerHTML = `
    <span class="legend-item"><span class="dot" aria-hidden="true"></span> Unanswered</span>
    <span class="legend-item"><span class="dot answered" aria-hidden="true"></span> Answered</span>
    <span class="legend-item"><span class="dot current" aria-hidden="true"></span> Current</span>`;
}

function updateHelperText() {
  if (state.mode !== "timed") return;

  if (isLastQuestion()) {
    dom.helperText.textContent = "You're on the final question.";
    return;
  }

  dom.helperText.textContent =
    "For multi-select questions, choose every correct option. Unanswered questions count as incorrect.";
}

function updateExamFooter() {
  dom.prevBtn.disabled = state.currentQuestionIndex === 0;

  if (state.mode === "timed") {
    dom.checkBtn.classList.add("hidden");
    dom.nextBtn.textContent = "Next →";

    if (isLastQuestion()) {
      dom.nextBtn.classList.add("hidden");
      dom.submitBtn.classList.remove("hidden");
    } else {
      dom.nextBtn.classList.remove("hidden");
      dom.nextBtn.disabled = false;
      dom.submitBtn.classList.add("hidden");
    }
    return;
  }

  if (isAnswerReviewMode()) {
    dom.submitBtn.classList.add("hidden");
    dom.checkBtn.classList.add("hidden");
    dom.nextBtn.classList.remove("hidden");

    if (isLastQuestion()) {
      dom.nextBtn.disabled = false;
      dom.nextBtn.textContent = "Back to results";
    } else {
      dom.nextBtn.disabled = false;
      dom.nextBtn.textContent = "Next →";
    }
    return;
  }

  if (isReviewLikeMode()) {
    dom.submitBtn.classList.add("hidden");
    dom.nextBtn.classList.remove("hidden");
    dom.nextBtn.textContent = "Next →";
    dom.nextBtn.disabled = isLastQuestion();
    dom.checkBtn.classList.remove("hidden");
  }
}

// Rendering
function updateProgress() {
  const total = state.questions.length;

  if (isAnswerReviewMode()) {
    const viewed = state.currentQuestionIndex + 1;
    const percent = total ? Math.round((viewed / total) * 100) : 0;
    dom.answeredSummary.textContent = `Reviewing ${viewed} / ${total}`;
    dom.progressPct.textContent = `${percent}%`;
    dom.progressFill.style.width = `${percent}%`;
    dom.progressBar.setAttribute("aria-valuenow", String(percent));
    updateNavigatorSummary();
    return;
  }

  const count = isReviewLikeMode() ? reviewedCount() : answeredCount();
  const percent = total ? Math.round((count / total) * 100) : 0;

  dom.answeredSummary.textContent = isReviewLikeMode()
    ? `${count} / ${total} reviewed`
    : `${count} / ${total} answered`;
  dom.progressPct.textContent = `${percent}%`;
  dom.progressFill.style.width = `${percent}%`;
  dom.progressBar.setAttribute("aria-valuenow", String(percent));
  updateNavigatorSummary();
}

function renderNavigator() {
  dom.questionGrid.innerHTML = "";

  state.questions.forEach((question, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "qnav";
    button.textContent = String(index + 1);

    const userAnswer = state.answers[question.id] || [];
    const isAnswered = userAnswer.length > 0;
    const isReviewed = Boolean(state.reviewed[question.id]);

    if (isAnswerReviewMode()) {
      const resultStatus = state.completedAttempt?.results?.[question.id]
        || getQuestionResultStatus(question, userAnswer);
      button.classList.add(`result-${resultStatus}`);
    } else if (isReviewLikeMode() && isReviewed) {
      button.classList.add("reviewed");
    } else if (isAnswered) {
      button.classList.add("answered");
    }

    if (index === state.currentQuestionIndex) {
      button.classList.add("current");
      button.setAttribute("aria-current", "true");
    }

    let statusLabel = "unanswered";
    if (isAnswerReviewMode()) {
      statusLabel = state.completedAttempt?.results?.[question.id]
        || getQuestionResultStatus(question, userAnswer);
    } else if (isReviewLikeMode() && isReviewed) {
      statusLabel = "reviewed";
    } else if (isAnswered) {
      statusLabel = "answered";
    }
    if (index === state.currentQuestionIndex) statusLabel += ", current";

    button.setAttribute("aria-label", `Question ${index + 1}, ${statusLabel}`);
    button.addEventListener("click", () => goToQuestion(index));
    dom.questionGrid.appendChild(button);
  });
}

function renderQuestion() {
  const question = state.questions[state.currentQuestionIndex];
  const userAnswer = state.answers[question.id] || [];
  const isReviewed = Boolean(state.reviewed[question.id]);

  dom.questionCount.textContent = `Question ${state.currentQuestionIndex + 1} of ${state.attemptSize}`;
  dom.questionType.textContent = question.multi
    ? "Choose all that apply"
    : "Choose the best answer";
  dom.questionText.textContent = question.prompt;

  if (isAnswerReviewMode()) {
    renderAnswerReviewQuestion(question, userAnswer);
    updateHelperText();
    updateExamFooter();
    updateProgress();
    renderNavigator();
    return;
  }

  dom.options.innerHTML = "";
  question.options.forEach((optionText, optionIndex) => {
    const label = document.createElement("label");
    label.className = "option";

    const input = document.createElement("input");
    input.type = question.multi ? "checkbox" : "radio";
    input.name = `question-${question.id}`;
    input.value = String(optionIndex);
    input.checked = userAnswer.includes(optionIndex);
    input.disabled = isReviewLikeMode() && isReviewed;
    input.setAttribute(
      "aria-label",
      `Option ${CONFIG.letters[optionIndex]}: ${optionText}`
    );

    if (isReviewLikeMode() && isReviewed) {
      label.classList.add("locked");
      if (question.correct.includes(optionIndex)) {
        label.classList.add("correct-option");
      } else if (input.checked) {
        label.classList.add("wrong-option");
      }
    }

    const letter = document.createElement("span");
    letter.className = "option-letter";
    letter.textContent = `${CONFIG.letters[optionIndex]}.`;

    const text = document.createElement("span");
    text.textContent = optionText;

    input.addEventListener("change", () => handleAnswerChange(question, optionIndex, input.checked));

    label.append(input, letter, text);
    dom.options.appendChild(label);
  });

  if (isReviewLikeMode()) {
    updateCheckButtonState();
    renderReviewFeedback(question);
  } else {
    dom.reviewFeedback.className = "review-feedback";
    dom.reviewFeedback.innerHTML = "";
  }

  updateHelperText();
  updateExamFooter();
  updateProgress();
  renderNavigator();
}

function renderAnswerReviewQuestion(question, userAnswer) {
  const resultStatus = state.completedAttempt?.results?.[question.id]
    || getQuestionResultStatus(question, userAnswer);

  dom.options.innerHTML = "";
  question.options.forEach((optionText, optionIndex) => {
    const label = document.createElement("label");
    label.className = "option locked";

    const input = document.createElement("input");
    input.type = question.multi ? "checkbox" : "radio";
    input.name = `question-${question.id}`;
    input.value = String(optionIndex);
    input.checked = userAnswer.includes(optionIndex);
    input.disabled = true;
    input.setAttribute(
      "aria-label",
      `Option ${CONFIG.letters[optionIndex]}: ${optionText}`
    );

    if (question.correct.includes(optionIndex)) {
      label.classList.add("correct-option");
    } else if (input.checked) {
      label.classList.add("wrong-option");
    }

    const letter = document.createElement("span");
    letter.className = "option-letter";
    letter.textContent = `${CONFIG.letters[optionIndex]}.`;

    const text = document.createElement("span");
    text.textContent = optionText;

    label.append(input, letter, text);
    dom.options.appendChild(label);
  });

  const yoursText = formatAnswerLines(question, userAnswer.length ? userAnswer : []);
  const correctText = formatAnswerLines(question, question.correct);

  dom.reviewFeedback.className = "review-feedback answer-review-visible";
  dom.reviewFeedback.innerHTML = `
    <div class="answer-review-status ${resultStatus}">${getAnswerReviewStatusLabel(resultStatus)}</div>
    <div class="answer-review-summary">
      ${userAnswer.length
    ? `<div class="answer-label yours">Your answer</div><div>${yoursText}</div>`
    : `<p><strong>Your answer:</strong> Unanswered</p>`}
      <div class="answer-label correct">Correct answer</div>
      <div>${correctText}</div>
      <p><strong>Explanation:</strong> ${escapeHtml(question.explanation || "")}</p>
    </div>`;
}

function formatAnswerLines(question, indices) {
  return indices
    .map((index) => `${CONFIG.letters[index]}. ${escapeHtml(question.options[index])}`)
    .join("<br>");
}

function renderReviewFeedback(question) {
  if (!state.reviewed[question.id]) {
    dom.reviewFeedback.className = "review-feedback";
    dom.reviewFeedback.innerHTML = "";
    return;
  }

  const isCorrect = sameAnswer(state.answers[question.id], question.correct);
  const correctText = formatAnswerLines(question, question.correct);

  dom.reviewFeedback.className = `review-feedback ${isCorrect ? "correct" : "incorrect"}`;
  dom.reviewFeedback.innerHTML = `
    <h3>${isCorrect ? "Correct ✓" : "Not quite"}</h3>
    <p class="review-answer">Correct answer:</p>
    <p>${correctText}</p>
    <p><strong>Why:</strong> ${escapeHtml(question.explanation || "")}</p>`;
}

// Answer Handling
function updateCheckButtonState() {
  if (!isReviewLikeMode()) return;

  const question = state.questions[state.currentQuestionIndex];
  if (!question) {
    dom.checkBtn.disabled = true;
    return;
  }

  const hasSelection = (state.answers[question.id] || []).length > 0;
  const isReviewed = Boolean(state.reviewed[question.id]);
  dom.checkBtn.disabled = !hasSelection || isReviewed;
}

function handleAnswerChange(question, optionIndex, isChecked) {
  if (isAnswerReviewMode()) return;
  if (isReviewLikeMode() && state.reviewed[question.id]) return;

  let selected = state.answers[question.id] || [];

  if (question.multi) {
    selected = isChecked
      ? [...new Set([...selected, optionIndex])]
      : selected.filter((value) => value !== optionIndex);
  } else {
    selected = [optionIndex];
  }

  state.answers[question.id] = selected;
  updateProgress();
  renderNavigator();
  updateCheckButtonState();
}

// Review Mode
function checkCurrentAnswer() {
  const question = state.questions[state.currentQuestionIndex];
  if (!(state.answers[question.id] || []).length || state.reviewed[question.id]) return;

  state.reviewed[question.id] = true;
  renderQuestion();
}

// Timer
function getRemainingSeconds() {
  if (!state.examStartedAt) {
    return CONFIG.examDurationSeconds;
  }

  const elapsedSeconds = Math.floor((Date.now() - state.examStartedAt) / 1000);
  return Math.max(0, Math.min(CONFIG.examDurationSeconds, CONFIG.examDurationSeconds - elapsedSeconds));
}

function getElapsedMs(timedOut = false) {
  const maxMs = CONFIG.examDurationSeconds * 1000;

  if (timedOut) {
    return maxMs;
  }

  if (!state.examStartedAt) {
    return 0;
  }

  const endTime = state.examEndedAt ?? Date.now();
  return Math.min(endTime - state.examStartedAt, maxMs);
}

function renderTimerDisplay(remainingSeconds) {
  state.secondsRemaining = remainingSeconds;
  dom.timer.textContent = formatCountdown(remainingSeconds);
}

function updateTimer() {
  if (state.mode !== "timed" || !state.timerRunning || state.examSubmitting) {
    return;
  }

  const remaining = getRemainingSeconds();
  renderTimerDisplay(remaining);

  if (remaining <= 0) {
    finishTimedExam({ timedOut: true });
  }
}

function startTimer() {
  if (state.mode !== "timed") return;

  clearTimerInterval();
  state.timerRunning = true;
  updateTimer();
  state.timerIntervalId = setInterval(updateTimer, 1000);
}

function finishTimedExam({ timedOut = false } = {}) {
  if (state.mode !== "timed" || state.examSubmitting) return;
  submitTimedExam(timedOut);
}

// Results
function getSubmitConfirmationMessage() {
  const remaining = unansweredCount();
  if (remaining === 0) {
    return "Submit your exam?";
  }
  return `You still have ${remaining} unanswered question${remaining === 1 ? "" : "s"}. Are you sure you want to submit your exam?`;
}

function buildResultStats({ correctCount, incorrectCount, unanswered, elapsedMs, passed }) {
  return `
    <dl class="result-stats">
      <div class="result-stat">
        <dt>Score</dt>
        <dd>${correctCount} / ${state.attemptSize} correct</dd>
      </div>
      <div class="result-stat">
        <dt>Time</dt>
        <dd>${formatElapsedDuration(elapsedMs)}</dd>
      </div>
      <div class="result-stat">
        <dt>Incorrect</dt>
        <dd>${incorrectCount}</dd>
      </div>
      <div class="result-stat">
        <dt>Unanswered</dt>
        <dd>${unanswered}</dd>
      </div>
    </dl>
    <p>${passed
      ? "You cleared the 85% passing target."
      : "You did not reach the 85% passing target. Review the questions you missed below."}</p>`;
}

function buildResultActions(missedCount) {
  return `
    <div class="result-actions">
      <div class="result-actions-primary">
        <button id="reviewAllBtn" class="btn btn-primary" type="button">Review all answers</button>
        ${missedCount > 0
    ? `<button id="retryMissedBtn" class="btn btn-success" type="button">Retry missed questions</button>`
    : ""}
      </div>
      <div class="result-actions-secondary">
        <button id="retryExamBtn" class="btn" type="button">Take another practice exam</button>
        <button id="backHomeBtn" class="btn" type="button">Back to study modes</button>
      </div>
    </div>`;
}

function bindResultActions() {
  const backHomeBtn = document.getElementById("backHomeBtn");
  const retryExamBtn = document.getElementById("retryExamBtn");
  const retryMissedBtn = document.getElementById("retryMissedBtn");
  const reviewAllBtn = document.getElementById("reviewAllBtn");

  if (backHomeBtn) backHomeBtn.addEventListener("click", backHome);
  if (retryExamBtn) retryExamBtn.addEventListener("click", () => openDisclaimer());
  if (retryMissedBtn) {
    retryMissedBtn.addEventListener("click", () => {
      startMissedReview(state.lastMissedQuestions);
    });
  }
  if (reviewAllBtn) reviewAllBtn.addEventListener("click", startAnswerReview);
}

function renderResultsScreen(resultData) {
  const {
    correctCount,
    incorrectCount,
    unanswered,
    percent,
    passed,
    elapsedMs,
    missed,
    categoryPerformance,
    examTotal,
  } = resultData;

  dom.results.style.display = "block";

  let html = `
    <div class="result-summary">
      <p class="score ${passed ? "pass" : "fail"}">${formatPercent(percent)}%</p>
      <p class="result-verdict ${passed ? "pass" : "fail"}">${passed ? "Passed" : "Did not pass"}</p>
      ${buildResultStats({ correctCount, incorrectCount, unanswered, elapsedMs, passed })}
      ${buildCategoryPerformanceHtml(categoryPerformance, examTotal)}
      ${buildResultActions(missed.length)}
    </div>`;

  if (missed.length) {
    html += `<div class="missed-list">`;
    missed.forEach((item) => {
      const { question, index, userAnswer } = item;
      const yours = userAnswer.length
        ? formatAnswerLines(question, userAnswer)
        : "Unanswered";
      const correct = formatAnswerLines(question, question.correct);

      html += `
        <article class="miss">
          <h3>${index + 1}. ${escapeHtml(question.prompt)}</h3>
          <div class="answer-label yours">Your answer</div>
          <div>${yours}</div>
          <div class="answer-label correct">Correct answer</div>
          <div>${correct}</div>
          <div class="explanation"><strong>Why:</strong> ${escapeHtml(question.explanation || "")}</div>
        </article>`;
    });
    html += `</div>`;
  }

  dom.results.innerHTML = html;
  bindResultActions();
}

function submitTimedExam(timedOut = false) {
  if (state.mode !== "timed") return;

  if (!timedOut) {
    if (!confirm(getSubmitConfirmationMessage())) return;
  }

  if (state.examSubmitting) return;
  state.examSubmitting = true;

  state.examEndedAt = Date.now();
  stopTimer();

  let correctCount = 0;
  let incorrectCount = 0;
  let unanswered = 0;
  const missed = [];

  state.questions.forEach((question, index) => {
    const userAnswer = state.answers[question.id] || [];

    if (userAnswer.length === 0) {
      unanswered += 1;
      missed.push({ question, index, userAnswer });
      return;
    }

    if (sameAnswer(userAnswer, question.correct)) {
      correctCount += 1;
      return;
    }

    incorrectCount += 1;
    missed.push({ question, index, userAnswer });
  });

  const percent = Math.round((correctCount / state.questions.length) * 1000) / 10;
  const passed = percent >= CONFIG.passingScore;
  const elapsedMs = getElapsedMs(timedOut);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  state.lastMissedQuestions = missed.map((item) => ({ ...item.question }));

  const categoryPerformance = calculateCategoryPerformance(state.questions, state.answers);

  saveCompletedAttempt({
    correctCount,
    incorrectCount,
    unanswered,
    total: state.questions.length,
    percent,
    passed,
    elapsedSeconds,
  });

  recordTimedExamStats({
    correctCount,
    total: state.questions.length,
    percent,
    passed,
    elapsedSeconds,
  });

  state.lastExamResults = {
    correctCount,
    incorrectCount,
    unanswered,
    percent,
    passed,
    elapsedMs,
    missed,
    categoryPerformance,
    examTotal: state.questions.length,
  };

  dom.examView.classList.add("hidden");
  dom.examView.setAttribute("aria-hidden", "true");
  renderResultsScreen(state.lastExamResults);
  scrollToTop();
}

// Navigation
function goToQuestion(index) {
  state.currentQuestionIndex = index;
  renderQuestion();

  if (isMobileNavigator()) {
    setNavigatorExpanded(false);
  }

  scrollToQuestion();
}

function goToPreviousQuestion() {
  if (state.currentQuestionIndex > 0) {
    goToQuestion(state.currentQuestionIndex - 1);
  }
}

function goToNextQuestion() {
  if (isAnswerReviewMode() && isLastQuestion()) {
    backToResults();
    return;
  }

  if (state.currentQuestionIndex < state.questions.length - 1) {
    goToQuestion(state.currentQuestionIndex + 1);
  }
}

function handleExamBack() {
  if (isAnswerReviewMode()) {
    backToResults();
    return;
  }

  confirmBackToModes();
}

function confirmBackToModes() {
  const progressCount = isReviewLikeMode() ? reviewedCount() : answeredCount();
  const label = isReviewLikeMode() ? "reviewed" : "answered";
  const message = progressCount > 0
    ? `Go back to the mode selection? Your current progress (${progressCount} question(s) ${label}) will be lost.`
    : "Go back to the mode selection? Your current attempt will be discarded.";

  if (confirm(message)) backHome();
}

function backHome() {
  stopTimer();
  state.mode = null;
  state.questions = [];
  state.answers = {};
  state.reviewed = {};
  state.examStartedAt = null;
  state.examEndedAt = null;
  state.examSubmitting = false;

  dom.submitBtn.classList.add("hidden");
  dom.nextBtn.classList.remove("hidden");
  dom.checkBtn.classList.add("hidden");

  dom.results.style.display = "none";
  dom.results.innerHTML = "";
  dom.examView.classList.add("hidden");
  dom.examView.setAttribute("aria-hidden", "true");
  dom.startScreen.classList.remove("hidden");
  dom.nextBtn.textContent = "Next →";
  renderPracticeStats();
  scrollToTop();
}

function toggleNavigator() {
  const expanded = dom.navigator.classList.contains("navigator-collapsed");
  setNavigatorExpanded(expanded);
}

// Event Listeners
function bindEvents() {
  dom.themeToggleStart.addEventListener("click", toggleTheme);
  dom.themeToggleExam.addEventListener("click", toggleTheme);
  dom.backToModesBtn.addEventListener("click", handleExamBack);
  dom.startTimedBtn.addEventListener("click", openDisclaimer);
  dom.startReviewBtn.addEventListener("click", () => startMode("review"));
  dom.disclaimerCancelBtn.addEventListener("click", closeDisclaimer);
  dom.disclaimerStartBtn.addEventListener("click", () => {
    closeDisclaimer();
    startMode("timed");
  });
  dom.disclaimerDialog.addEventListener("click", (event) => {
    if (event.target.dataset.dismiss === "disclaimer") {
      closeDisclaimer();
    }
  });
  document.addEventListener("keydown", handleDisclaimerKeydown);
  dom.navigatorToggle.addEventListener("click", toggleNavigator);
  dom.prevBtn.addEventListener("click", goToPreviousQuestion);
  dom.nextBtn.addEventListener("click", goToNextQuestion);
  dom.checkBtn.addEventListener("click", checkCurrentAnswer);
  dom.submitBtn.addEventListener("click", () => finishTimedExam({ timedOut: false }));
  window.addEventListener("resize", () => {
    if (!state.mode) return;
    if (!isMobileNavigator()) {
      dom.navigator.classList.remove("navigator-collapsed");
      dom.navigatorToggle.setAttribute("aria-expanded", "true");
      dom.navigatorToggle.textContent = "Hide questions";
    }
  });
}

// Initialization
async function init() {
  initTheme();
  bindEvents();
  setButtonsDisabled(true);
  renderPracticeStats();
  await loadQuestionBank();
}

init();
