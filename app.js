// ===== PrepPilot - app.js =====
// Handles navigation, localStorage, topics, revision, progress, and AI features.

const STORAGE_KEY = "preppilot_data";
const REVISION_STEPS = [1, 2, 4, 8];
const API_BASE_URL = "http://127.0.0.1:8000";

let quizState = {
  questions: [],
  currentIndex: 0,
  answered: false
};

// Tracks whether a plan/quiz was generated during THIS page session.
// Without this, an old plan/quiz saved in localStorage from a previous
// visit would silently reappear any time renderApp() runs (e.g. after
// saving the profile), which looks like "it generated on its own."
let sessionState = {
  planGenerated: false,
  quizGenerated: false
};

document.addEventListener("DOMContentLoaded", () => {
  initStorage();
  initNavigation();
  initProfileForm();
  initTopics();
  initPlanner();
  initQuiz();
  renderApp();
});

/* ---------- Storage ---------- */

function defaultData() {
  return {
    tasks: [],
    topics: [],
    quizzes: [],
    plans: [],
    progress: {},
    profile: {
      name: "",
      subjects: [],
      weakSubjects: [],
      weakSubject: "",
      examDate: "",
      studyHoursPerDay: null
    },
    settings: {
  theme: "warm"
}
  };
}

function initStorage() {
  const current = getData();
  saveData(migrateData(current || defaultData()));
}

function getData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return defaultData();
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(migrateData(data)));
}

function migrateData(data) {
  const base = defaultData();
  const next = {
    ...base,
    ...data,
    profile: { ...base.profile, ...(data.profile || {}) },
    settings: { ...base.settings, ...(data.settings || {}) }
  };

  if (!Array.isArray(next.profile.subjects)) {
    next.profile.subjects = splitList(next.profile.subjects);
  }

  if (!Array.isArray(next.profile.weakSubjects)) {
    next.profile.weakSubjects = splitList(next.profile.weakSubject || next.profile.weakSubjects);
  }

  next.profile.weakSubject = next.profile.weakSubjects.join(", ");

  next.topics = Array.isArray(next.topics) ? next.topics.map((topic) => ({
    id: topic.id || createId(),
    name: topic.name || "Untitled topic",
    subject: topic.subject || next.profile.subjects[0] || "",
    completed: Boolean(topic.completed),
    completedAt: topic.completedAt || null,
    createdAt: topic.createdAt || new Date().toISOString(),
    difficulty: topic.difficulty || "medium",
    revision: topic.revision || null
  })) : [];

  if (!Array.isArray(next.plans)) next.plans = [];
  if (!Array.isArray(next.quizzes)) next.quizzes = [];

  return next;
}

function updateData(mutator) {
  const data = getData() || defaultData();
  mutator(data);
  saveData(data);
  renderApp();
}

/* ---------- Navigation ---------- */

function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const targetId = item.getAttribute("data-page");

      navItems.forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");

      pages.forEach((page) => {
        page.classList.toggle("active", page.id === targetId);
      });

      // Leaving the Quiz page resets its visible state, so a previously
      // generated quiz never silently reappears on a later visit.
      if (targetId !== "quiz") {
        sessionState.quizGenerated = false;
        setHidden("quiz-card", true);
      }

      localStorage.setItem("preppilot_last_page", targetId);
    });
  });

  const lastPage = localStorage.getItem("preppilot_last_page");
  if (lastPage) {
    const navItem = document.querySelector(`.nav-item[data-page="${lastPage}"]`);
    if (navItem) navItem.click();
  }
}

/* ---------- Profile form ---------- */

function initProfileForm() {

const form = document.getElementById("profile-form");
if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    updateData((data) => {
      const subjects = splitList(getValue("student-subjects"));
      const weakSubjects = splitList(getValue("weak-subject"));

      data.profile = {
        ...data.profile,
        name: getValue("student-name"),
        subjects,
        examDate: getValue("exam-date"),
        studyHoursPerDay: getValue("study-hours") ? Number(getValue("study-hours")) : null,
        weakSubjects,
        weakSubject: weakSubjects.join(", ")
      };

      data.settings = {
  ...data.settings
};

      data.topics = data.topics || [];
    });

    showToast("Profile saved ✦");
  });

  const clearButton = document.getElementById("clear-data-btn");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      const confirmed = confirm(
        "This will permanently delete your profile, topics, plans, quizzes, and API key from this browser. This cannot be undone. Continue?"
      );
      if (!confirmed) return;

      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("studyspark_last_page");
      sessionState.planGenerated = false;
      sessionState.quizGenerated = false;
      quizState = { questions: [], currentIndex: 0, answered: false };

      initStorage();
      renderApp();
      showToast("All data cleared");
    });
  }
}

function renderProfileForm(data) {
  setValue("student-name", data.profile.name || "");
  setValue("student-subjects", (data.profile.subjects || []).join(", "));
  setValue("exam-date", data.profile.examDate || "");
  setValue("study-hours", data.profile.studyHoursPerDay ?? "");
  setValue("weak-subject", (data.profile.weakSubjects || []).join(", "));
  
}

/* ---------- Home ---------- */

function renderHome(data) {
  const name = data.profile.name ? `, ${data.profile.name}` : "";
  setText("home-greeting", `Welcome back${name}`);

  const days = getDaysUntil(data.profile.examDate);
  const countdownText = days === null
    ? "Set your exam date"
    : days < 0
      ? "Exam date passed"
      : `${days} day${days === 1 ? "" : "s"}`;
  setText("exam-countdown", countdownText);

  const countdownEl = document.getElementById("exam-countdown");
  if (countdownEl) {
    countdownEl.classList.toggle("countdown-small", days === null || days < 0);
  }

  setText("today-focus", getTodayFocus(data));
  renderRevisionList("home-revision-list", getDueTopics(data), true);
}

function getTodayFocus(data) {
  const dueTopics = getDueTopics(data);
  if (dueTopics.length) {
    return `Revise ${dueTopics[0].name} in ${dueTopics[0].subject}. It is due today.`;
  }

  const weakSubjects = data.profile.weakSubjects || [];
  const weakTopic = data.topics.find((topic) => !topic.completed && weakSubjects.includes(topic.subject));
  if (weakTopic) {
    return `Spend extra time on ${weakTopic.name} because ${weakTopic.subject} is marked as weak.`;
  }

  const nextTopic = data.topics.find((topic) => !topic.completed);
  if (nextTopic) {
    return `Make steady progress on ${nextTopic.name} in ${nextTopic.subject}.`;
  }

  if (data.profile.subjects.length) {
    return `Pick one focused session from ${data.profile.subjects[0]} and keep the momentum going.`;
  }

  return "Save your subjects in Settings to get a useful focus suggestion.";
}

/* ---------- Topics + Revision ---------- */

function initTopics() {
  const form = document.getElementById("topic-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = getValue("topic-name");
    const subject = getValue("topic-subject");
    console.log({
  name,
  subject,
  profileSubjects: getData().profile.subjects
});
    if (!name || !subject) return;

    updateData((data) => {
      data.topics.push({
        id: createId(),
        name,
        subject,
        difficulty: getValue("topic-difficulty") || "medium",
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString(),
        revision: null
      });
    });

    form.reset();
    showToast("Topic saved ✦");
  });
}

function renderTopics(data) {
  renderSubjectDropdown("topic-subject", data.profile.subjects, "Add subjects in Settings first");
  renderTopicDropdown("quiz-topic", data.topics);

  const incomplete = data.topics.filter((topic) => !topic.completed);
  const completed = data.topics.filter((topic) => topic.completed);

  renderTopicList("incomplete-topics", incomplete);
  renderTopicList("completed-topics", completed);
}

function renderTopicList(containerId, topics) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!topics.length) {
    container.innerHTML = `<div class="empty-state">No topics here yet.</div>`;
    return;
  }

  container.innerHTML = topics.map((topic) => topicTemplate(topic)).join("");
  container.querySelectorAll("[data-topic-toggle]").forEach((input) => {
    input.addEventListener("change", () => toggleTopic(input.dataset.topicToggle));
  });
  container.querySelectorAll("[data-topic-rename]").forEach((button) => {
    button.addEventListener("click", () => renameTopic(button.dataset.topicRename));
  });
  container.querySelectorAll("[data-topic-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteTopic(button.dataset.topicDelete));
  });
  container.querySelectorAll("[data-mark-revised]").forEach((button) => {
    button.addEventListener("click", () => markRevised(button.dataset.markRevised));
  });
}

function topicTemplate(topic) {
  const due = isRevisionDue(topic);
  return `
    <div class="topic-item">
      <input class="topic-check" type="checkbox" data-topic-toggle="${topic.id}" ${topic.completed ? "checked" : ""} aria-label="Mark ${escapeHtml(topic.name)} complete">
      <div>
        <p class="topic-title">
          ${escapeHtml(topic.name)}
          <span class="difficulty-tag ${escapeHtml(topic.difficulty || "medium")}">${escapeHtml(capitalize(topic.difficulty || "medium"))}</span>
          ${due ? `<span class="tag">Revise Now</span>` : ""}
        </p>
        <p class="topic-meta">${escapeHtml(topic.subject)}${topic.revision ? ` - Next revision: ${formatDate(topic.revision.nextDue)}` : ""}</p>
        ${due ? `<button class="btn-small" type="button" data-mark-revised="${topic.id}">Mark Revised</button>` : ""}
      </div>
      <div class="topic-actions">
        <button class="btn-small" type="button" data-topic-rename="${topic.id}">Rename</button>
        <button class="btn-danger" type="button" data-topic-delete="${topic.id}">Delete</button>
      </div>
    </div>
  `;
}

function toggleTopic(id) {
  updateData((data) => {
    const topic = data.topics.find((item) => item.id === id);
    if (!topic) return;

    const wasCompleted = topic.completed;
    topic.completed = !topic.completed;

    if (topic.completed && !wasCompleted) {
      topic.completedAt = new Date().toISOString();
      if (!topic.revision) topic.revision = createRevision(0);
    }

    if (!topic.completed) {
      topic.completedAt = null;
    }
  });

  showToast("Topic updated ✦");
}

function renameTopic(id) {
  const data = getData();
  const topic = data.topics.find((item) => item.id === id);
  if (!topic) return;

  const nextName = prompt("Rename topic", topic.name);
  if (!nextName || !nextName.trim()) return;

  updateData((current) => {
    const target = current.topics.find((item) => item.id === id);
    if (target) target.name = nextName.trim();
  });

  showToast("Topic renamed ✦");
}

function deleteTopic(id) {
  if (!confirm("Delete this topic?")) return;

  updateData((data) => {
    data.topics = data.topics.filter((topic) => topic.id !== id);
  });

  showToast("Topic deleted");
}

function createRevision(stepIndex) {
  return {
    stepIndex,
    nextDue: addDays(new Date(), REVISION_STEPS[stepIndex]).toISOString(),
    lastRevisedAt: null
  };
}

function markRevised(id) {
  updateData((data) => {
    const topic = data.topics.find((item) => item.id === id);
    if (!topic || !topic.revision) return;

    const nextStep = Math.min(topic.revision.stepIndex + 1, REVISION_STEPS.length - 1);
    topic.revision = {
      stepIndex: nextStep,
      nextDue: addDays(new Date(), REVISION_STEPS[nextStep]).toISOString(),
      lastRevisedAt: new Date().toISOString()
    };
  });

  showToast("Revision scheduled ✦");
}

function getDueTopics(data) {
  return data.topics.filter(isRevisionDue);
}

function isRevisionDue(topic) {
  if (!topic.completed || !topic.revision || !topic.revision.nextDue) return false;
  return startOfDay(new Date(topic.revision.nextDue)) <= startOfDay(new Date());
}

function renderRevisionList(containerId, topics, compact) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!topics.length) {
    container.innerHTML = `<div class="empty-state">Nothing due today.</div>`;
    return;
  }

  container.innerHTML = topics.map((topic) => `
    <div class="revision-item">
      <strong>${escapeHtml(topic.name)}</strong>
      <p>${escapeHtml(topic.subject)} · due ${formatDate(topic.revision.nextDue)}</p>
      ${compact ? "" : `<button class="btn-small" type="button" data-mark-revised="${topic.id}">Mark Revised</button>`}
    </div>
  `).join("");

  container.querySelectorAll("[data-mark-revised]").forEach((button) => {
    button.addEventListener("click", () => markRevised(button.dataset.markRevised));
  });
}

/* ---------- Progress ---------- */

function renderProgress(data) {
  const total = data.topics.length;
  const completed = data.topics.filter((topic) => topic.completed).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  setText("overall-progress-number", `${percent}%`);
  setWidth("overall-progress-bar", percent);

  const container = document.getElementById("subject-progress-list");
  if (!container) return;

  const subjects = data.profile.subjects.length
    ? data.profile.subjects
    : [...new Set(data.topics.map((topic) => topic.subject).filter(Boolean))];

  if (!subjects.length) {
    container.innerHTML = `<div class="empty-state">Add subjects and topics to see progress.</div>`;
    return;
  }

  container.innerHTML = subjects.map((subject) => {
    const subjectTopics = data.topics.filter((topic) => topic.subject === subject);
    const subjectCompleted = subjectTopics.filter((topic) => topic.completed).length;
    const subjectPercent = subjectTopics.length ? Math.round((subjectCompleted / subjectTopics.length) * 100) : 0;

    return `
      <div class="subject-progress-item">
        <p><strong>${escapeHtml(subject)}</strong> · ${subjectCompleted}/${subjectTopics.length} topics</p>
        <div class="progress-bar"><span style="width: ${subjectPercent}%"></span></div>
      </div>
    `;
  }).join("");
}

/* ---------- Planner AI ---------- */

function initPlanner() {
  const button = document.getElementById("generate-plan-btn");
  if (!button) return;

  button.addEventListener("click", generatePlan);
}

async function generatePlan() {
  const data = getData();
  const validation = validateAiReady(data, true);
  if (validation) {
    showError("plan-error", validation);
    return;
  }

  setHidden("plan-error", true);
  setHidden("plan-empty", true);
  setHidden("planner-loading", false);

  try {
    const response = await fetch(`${API_BASE_URL}/generate-plan`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    name: data.profile.name,
    subjects: data.profile.subjects.join(", "),
    weak_subjects: data.profile.weakSubjects.join(", "),
    hours_per_day: data.profile.studyHoursPerDay,
    exam_date: data.profile.examDate
  })
});

if (!response.ok) {
  throw new Error("Backend request failed");
}

const plan = await response.json();
    if (!plan.days || !Array.isArray(plan.days)) throw new Error("The LLM response did not include days.");

    updateData((current) => {
      current.plans.unshift({
        id: createId(),
        createdAt: new Date().toISOString(),
        days: plan.days
      });
    });

    sessionState.planGenerated = true;
    renderPlanner(getData());
    showToast("Plan generated ✦");
  } catch (error) {
    showError("plan-error", friendlyAiError("plan", error));
  } finally {
    setHidden("planner-loading", true);
  }
}

function renderPlanner(data) {
  const output = document.getElementById("plan-output");
  if (!output) return;

  const latestPlan = sessionState.planGenerated ? data.plans[0] : null;
  setHidden("plan-empty", Boolean(latestPlan));

  if (!latestPlan) {
    output.innerHTML = "";
    return;
  }

  output.innerHTML = latestPlan.days.map((day) => `
    <div class="card plan-day">
      <h3>${escapeHtml(day.day || "Study Day")}</h3>
      <p>${escapeHtml(day.focus || "Focused study")}</p>
      <ul class="session-list">
        ${(day.sessions || []).map((session) => `
          <li><strong>${escapeHtml(session.subject || "Study")}</strong> - ${escapeHtml(session.activity || "Practice")} <span class="muted">(${escapeHtml(session.duration || "Flexible")})</span></li>
        `).join("")}
      </ul>
    </div>
  `).join("");
}

/* ---------- Quiz AI ---------- */

function initQuiz() {
  const generateButton = document.getElementById("generate-quiz-btn");
  const nextButton = document.getElementById("next-question-btn");

  if (generateButton) generateButton.addEventListener("click", generateQuiz);
  if (nextButton) nextButton.addEventListener("click", nextQuestion);
}

async function generateQuiz() {
  const data = getData();
  const topicId = getValue("quiz-topic");
  const topic = data.topics.find((item) => item.id === topicId);
  const validation = validateAiReady(data, false);

  if (validation) {
    showError("quiz-error", validation);
    return;
  }

  if (!topic) {
    showError("quiz-error", "Add and select a topic first.");
    return;
  }

  setHidden("quiz-card", true);
  setHidden("quiz-error", true);
  setHidden("quiz-loading", false);

  try {
    const response = await fetch(`${API_BASE_URL}/generate-quiz`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    topic: `${topic.name} (${topic.subject})`,
  }),
});

if (!response.ok) {
  throw new Error("Failed to generate quiz.");
}

const quiz = await response.json();
const questions = normalizeQuestions(quiz.questions);

    quizState = { questions, currentIndex: 0, answered: false };
    sessionState.quizGenerated = true;

    updateData((current) => {
      current.quizzes.unshift({
        id: createId(),
        topicId,
        topicName: topic.name,
        createdAt: new Date().toISOString(),
        questions
      });
    });

    renderCurrentQuestion();
    setHidden("quiz-card", false);
    showToast("Quiz generated ✦");
  } catch (error) {
    showError("quiz-error", friendlyAiError("quiz", error));
  } finally {
    setHidden("quiz-loading", true);
  }
}

function normalizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];

  return questions.map((question) => ({
    question: String(question.question || "").trim(),
    options: Array.isArray(question.options) ? question.options.slice(0, 4).map(String) : [],
    correctAnswer: String(question.correctAnswer || question.answer || "").trim(),
    explanation: String(question.explanation || "").trim()
  })).filter((question) => question.question && question.options.length === 4 && question.correctAnswer && question.explanation);
}

function renderCurrentQuestion() {
  const question = quizState.questions[quizState.currentIndex];
  if (!question) return;

  quizState.answered = false;
  setText("quiz-counter", `Question ${quizState.currentIndex + 1} of ${quizState.questions.length}`);
  setText("quiz-question", question.question);
  setHidden("quiz-feedback", true);
  setHidden("next-question-btn", true);

  const options = document.getElementById("quiz-options");
  options.innerHTML = question.options.map((option) => `
    <button type="button" class="quiz-option" data-option="${escapeHtml(option)}">${escapeHtml(option)}</button>
  `).join("");

  options.querySelectorAll(".quiz-option").forEach((button) => {
    button.addEventListener("click", () => answerQuestion(button.dataset.option));
  });
}

function answerQuestion(selected) {
  if (quizState.answered) return;

  const question = quizState.questions[quizState.currentIndex];
  const correctAnswer = resolveCorrectAnswer(question);
  const buttons = document.querySelectorAll(".quiz-option");
  quizState.answered = true;

  buttons.forEach((button) => {
    button.disabled = true;
    const value = button.dataset.option;
    if (answersMatch(value, correctAnswer)) button.classList.add("correct");
    if (answersMatch(value, selected) && !answersMatch(value, correctAnswer)) button.classList.add("incorrect");
  });

  const feedback = document.getElementById("quiz-feedback");
  feedback.innerHTML = `<strong>Correct answer:</strong> ${escapeHtml(correctAnswer)}<br>${escapeHtml(question.explanation)}`;
  setHidden("quiz-feedback", false);
  setHidden("next-question-btn", false);
}

function nextQuestion() {
  quizState.currentIndex += 1;

  if (quizState.currentIndex >= quizState.questions.length) {
    setText("quiz-counter", "Quiz complete");
    setText(
  "quiz-question",
  `Nice work. You finished all ${quizState.questions.length} questions.`
);
    document.getElementById("quiz-options").innerHTML = "";
    setHidden("quiz-feedback", true);
    setHidden("next-question-btn", true);
    return;
  }

  renderCurrentQuestion();
}

function answersMatch(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function resolveCorrectAnswer(question) {
  const answer = question.correctAnswer.trim();
  const letterIndex = ["a", "b", "c", "d"].indexOf(answer.toLowerCase());
  if (letterIndex >= 0 && question.options[letterIndex]) return question.options[letterIndex];
  return answer;
}

/* ---------- LLM providers ---------- */


function validateAiReady(data, requireProfile) {
  if (!requireProfile) return "";

  if (!data.profile.name.trim()) {
    return "Enter your name first.";
  }

  if (!data.profile.subjects.length) {
    return "Add at least one subject.";
  }

  if (!data.profile.studyHoursPerDay) {
    return "Enter your daily study hours.";
  }

  if (!data.profile.examDate) {
    return "Select your exam date.";
  }

  return "";
}

function friendlyAiError(type, error) {
  const action = type === "quiz" ? "quiz" : "study plan";

  const detail = String(error?.message || "");

  if (/failed to fetch|network/i.test(detail)) {
    return `Could not generate the ${action}. Unable to reach the backend. Make sure the FastAPI server is running.`;
  }

  if (/500/i.test(detail)) {
    return `The backend encountered an error while generating the ${action}.`;
  }

  return `Could not generate the ${action}. Please try again.`;
}

/* ---------- Render ---------- */

function renderApp() {
  const data = getData() || defaultData();

  renderProfileForm(data);
  renderHome(data);
  renderTopics(data);
  renderProgress(data);
  renderPlanner(data);
}

function renderSubjectDropdown(id, subjects, emptyLabel) {
  const select = document.getElementById(id);
  if (!select) return;

  if (!subjects.length) {
    select.innerHTML = `<option value="">${emptyLabel}</option>`;
    select.disabled = true;
    return;
  }

  select.disabled = false;
  const current = select.value;
  select.innerHTML = subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join("");
  if (subjects.includes(current)) select.value = current;
}

function renderTopicDropdown(id, topics) {
  const select = document.getElementById(id);
  if (!select) return;

  if (!topics.length) {
    select.innerHTML = `<option value="">Add topics first</option>`;
    select.disabled = true;
    return;
  }

  const current = select.value;
  select.disabled = false;
  select.innerHTML = topics.map((topic) => `<option value="${topic.id}">${escapeHtml(topic.name)} (${escapeHtml(topic.subject)})</option>`).join("");
  if (topics.some((topic) => topic.id === current)) select.value = current;
}

/* ---------- Utilities ---------- */

let toastTimeout = null;

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function showError(id, message) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function getValue(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function setHidden(id, hidden) {
  const element = document.getElementById(id);
  if (element) element.hidden = hidden;
}

function setWidth(id, percent) {
  const element = document.getElementById(id);
  if (element) element.style.width = `${percent}%`;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getDaysUntil(dateValue) {
  if (!dateValue) return null;
  return Math.ceil((startOfDay(new Date(`${dateValue}T00:00:00`)) - startOfDay(new Date())) / 86400000);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}
