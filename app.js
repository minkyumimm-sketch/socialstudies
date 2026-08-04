import {
  state,
  resetSessionState,
  resetQuizState,
  resetUiState
} from "./core/state.js";
import { normalizeQuestion, buildFallbackQuestionId } from "./core/question-normalizer.js";
import { prepareQuizStart, startRetryWrongRound } from "./core/quiz-controller.js";
import {
  buildResultMessage,
  buildSavedSubjectName,
  renderFinalResult,
  buildQuizMetaText
} from "./core/result-controller.js";
import { restartQuiz, resetStartScreenMessages } from "./core/session-controller.js";
import { applyAnswerResult } from "./core/answer-controller.js";
import { renderCurrentQuestion } from "./core/question-screen-controller.js";
import {
  showQuizScreen,
  showResultScreen,
  showStartScreen
} from "./core/screen-controller.js";
import { renderTextQuestion } from "./renderers/text-renderer.js";
import { renderChoiceQuestion, lockChoiceButtons } from "./renderers/choice-renderer.js";
import { renderEraQuestion } from "./renderers/era-renderer.js";
import { renderSortQuestion, drawSortList } from "./renderers/sort-renderer.js";
import {
  renderMapClickQuestion,
  lockMapClickVisuals,
  resetMapClickArea,
  getSelectedMapAnswer,
  getMapAreaLabelById
} from "./renderers/map-click-renderer.js";
import { judgeAnswer, getCorrectAnswer } from "./judges/answer-judge.js";
import { createFilterManager } from "./filters/filter-manager.js";
import {
  loadActiveStudents,
  saveAnswerRecord,
  renderStudentSuggestions,
  selectStudent,
  filterStudents
} from "./services/student-service.js";
import { ERA_CHOICES } from "./config/era-choices.js";
import { startAttemptForQuiz } from "./features/history/quiz-start-integration.js";
import { recordAnswerForAttempt } from "./features/history/answer-record-integration.js";
import { completeAttempt } from "./features/history/attempt-complete-integration.js";

const startScreen = document.getElementById("start-screen");
const quizScreen = document.getElementById("quiz-screen");
const resultScreen = document.getElementById("result-screen");
const allScreens = [startScreen, quizScreen, resultScreen];

const studentNameInput = document.getElementById("student-name-input");
const studentIdInput = document.getElementById("student-id");
const studentSuggestions = document.getElementById("student-suggestions");
const selectedStudentLabel = document.getElementById("selected-student-label");

const subjectSelect = document.getElementById("subject-select");
const unitFilterSelect = document.getElementById("unit-filter-select");
const modeFilterSelect = document.getElementById("mode-filter-select");
const subunitFilterSelect = document.getElementById("subunit-filter-select");
const questionCountSelect = document.getElementById("question-count");
const retryWrongOnlyCheckbox = document.getElementById("retry-wrong-only");
const startButton = document.getElementById("start-button");
const startError = document.getElementById("start-error");

const quizStudent = document.getElementById("quiz-student");
const quizSubject = document.getElementById("quiz-subject");
const quizProgress = document.getElementById("quiz-progress");
const quizScore = document.getElementById("quiz-score");
const quizUnit = document.getElementById("quiz-unit");
const choicesContainer = document.getElementById("choices-container");
const answerInput = document.getElementById("answer-input");
const submitButton = document.getElementById("submit-button");
const answerResult = document.getElementById("answer-result");
const nextButton = document.getElementById("next-button");
const backToStartButton = document.getElementById("back-to-start-button");

const finalStudent = document.getElementById("final-student");
const finalSubject = document.getElementById("final-subject");
const finalScore = document.getElementById("final-score");
const retryButton = document.getElementById("retry-button");
const backButton = document.getElementById("back-button");
const wrongRetryButton = document.getElementById("wrong-retry-button");

const questionElements = {
  get questionText() {
    return document.getElementById("question-text");
  },
  get choicesContainer() {
    return document.getElementById("choices-container");
  },
  get answerInput() {
    return document.getElementById("answer-input");
  },
  get submitButton() {
    return document.getElementById("submit-button");
  },
  get answerResult() {
    return document.getElementById("answer-result");
  },
  get mapClickContainer() {
    return document.getElementById("map-click-container");
  },
  get mapClickStatus() {
    return document.getElementById("map-click-status");
  }
};

const filterManager = createFilterManager({
  state,
  subjectSelect,
  unitFilterSelect,
  modeFilterSelect,
  subunitFilterSelect,
  normalizeQuestion,
  normalizeValue
});

startButton.addEventListener("click", startQuiz);
submitButton.addEventListener("click", handleSubmitButton);
nextButton.addEventListener("click", goToNextQuestion);
retryButton.addEventListener("click", retryQuiz);
backButton.addEventListener("click", backToStart);
wrongRetryButton.addEventListener("click", retryWrongOnlyFromResult);
backToStartButton.addEventListener("click", backToStart);

subjectSelect.addEventListener("change", async () => {
  await filterManager.syncFiltersForSubjectChange();
});

unitFilterSelect.addEventListener("change", async () => {
  await filterManager.syncSubunitOptionsOnly();
});

modeFilterSelect.addEventListener("change", async () => {
  await filterManager.syncSubunitOptionsOnly();
});

answerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !state.ui.answered) {
    handleSubmitButton();
  }
});

initApp();

function initLocalState() {
  resetSessionState(state);
  resetQuizState(state);
  resetUiState(state);
  ensureMapSelectionState();
}

function ensureMapSelectionState() {
  if (!Array.isArray(state.ui.selectedMapAreaIds)) {
    state.ui.selectedMapAreaIds = [];
  }
}

async function initApp() {
  initLocalState();

  try {
    await Promise.all([
      loadActiveStudents(state),
      filterManager.syncFiltersForSubjectChange()
    ]);
    setupStudentAutocomplete();
  } catch (error) {
    console.error("initApp error:", error);
    startError.textContent = "生徒一覧または問題設定の取得に失敗しました。GAS公開設定やCSVを確認してください。";
  }
}

// Phase2 Task14-2: Task14-1で発行されたAttemptのIDを、回答確定時のAnswerRecord保存で使うために保持する。
let currentDomainAttemptId = "";

async function startQuiz() {
  const studentName = String(studentNameInput.value || "").trim();
  const studentId = String(studentIdInput.value || "").trim();
  const subject = String(subjectSelect.value || "").trim();
  const unitFilter = String(unitFilterSelect.value || "all").trim();
  const modeFilter = String(modeFilterSelect.value || "all").trim();
  const subunitFilter = String(subunitFilterSelect.value || "all").trim();
  const requestedQuestionCount = Number(questionCountSelect.value || 10);

  startError.textContent = "";

  try {
    startButton.disabled = true;
    startButton.textContent = "読込中...";

    const result = await prepareQuizStart({
      state,
      filterManager,
      normalizeValue,
      studentName,
      studentId,
      subject,
      unitFilter,
      modeFilter,
      subunitFilter,
      requestedQuestionCount,
      retryWrongEnabled: retryWrongOnlyCheckbox.checked
    });

    if (!result.ok) {
      startError.textContent = result.errorMessage || "開始に失敗しました。";
      return;
    }

    // Phase2 Task14-1: 裏側でQuestionSet/Attemptを生成・保存する（既存の出題フローには影響しない）
    try {
      const domainAttemptResult = await startAttemptForQuiz({
        quizQuestions: state.quiz.quizQuestions,
        subject: state.session.subject,
        studentId: state.session.studentId
      });
      currentDomainAttemptId = domainAttemptResult ? domainAttemptResult.attempt.attemptId : "";
    } catch (domainError) {
      console.error("startAttemptForQuiz error（既存の出題フローには影響しません）:", domainError);
      currentDomainAttemptId = "";
    }

    await renderQuestion();
    showQuizScreen(quizScreen, allScreens);
  } catch (error) {
    console.error("startQuiz error:", error);
    startError.textContent = "開始に失敗しました。GAS URLやCSVを確認してください。";
  } finally {
    startButton.disabled = false;
    startButton.textContent = "開始";
  }
}

function getQuestionId(question) {
  const rawId = String(question?.questionId ?? question?.id ?? "").trim();
  if (rawId) return rawId;
  return buildFallbackQuestionId(question || {}, state.session.subject || "");
}

async function renderQuestion() {
  await renderCurrentQuestion({
    state,
    questionElements,
    nextButton,
    answerResult,
    quizStudent,
    quizSubject,
    quizProgress,
    quizScore,
    quizUnit,
    buildQuizMetaText,
    resetQuestionArea,
    renderMapClickQuestion,
    renderEraQuestion,
    renderSortQuestion,
    renderChoiceQuestion,
    renderTextQuestion,
    ERA_CHOICES,
    handleAnswer,
    swapSortItems
  });
}

function resetQuestionArea() {
  ensureMapSelectionState();

  state.ui.selectedChoice = "";
  state.ui.selectedMapArea = "";
  state.ui.selectedMapAreaId = "";
  state.ui.selectedMapAreaIds = [];

  choicesContainer.innerHTML = "";
  choicesContainer.className = "choices";

  answerInput.value = "";
  answerInput.style.display = "none";

  submitButton.style.display = "none";
  submitButton.disabled = false;

  answerResult.classList.remove("correct", "incorrect");
  answerResult.style.color = "";

  resetMapClickArea(questionElements);
}

function swapSortItems(fromIndex, toIndex) {
  const copied = [...state.ui.currentSortOrder];
  [copied[fromIndex], copied[toIndex]] = [copied[toIndex], copied[fromIndex]];
  state.ui.currentSortOrder = copied;

  drawSortList(choicesContainer, state, (newFrom, newTo) => {
    if (state.ui.answered) return;
    swapSortItems(newFrom, newTo);
  });
}

function handleSubmitButton() {
  if (state.ui.answered) return;

  const currentMode = state.quiz.currentQuestion?.mode;

  if (currentMode === "map_click") {
    handleAnswer(getSelectedMapAnswer(state));
    return;
  }

  if (currentMode === "sort") {
    handleAnswer([...state.ui.currentSortOrder]);
    return;
  }

  handleAnswer(answerInput.value.trim());
}

function toJudgeableMapClickAnswer(selectedChoice) {
  if (!Array.isArray(selectedChoice)) {
    return selectedChoice;
  }

  return [...selectedChoice]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

function handleAnswer(selectedChoice) {
  if (state.ui.answered) return;

  if (
    selectedChoice === undefined ||
    selectedChoice === null ||
    (typeof selectedChoice === "string" && !selectedChoice) ||
    (Array.isArray(selectedChoice) && selectedChoice.length === 0)
  ) {
    return;
  }

  state.ui.answered = true;

  const question = state.quiz.currentQuestion;

  const judgeTarget =
    question?.mode === "map_click"
      ? toJudgeableMapClickAnswer(selectedChoice)
      : selectedChoice;

  const correctAnswer = getCorrectAnswer(question);
  const isCorrect = judgeAnswer(question, judgeTarget, normalizeValue);

  const displaySelectedChoice =
    question?.mode === "map_click"
      ? formatMapClickChoiceForDisplay(selectedChoice, getMapAreaLabelById)
      : judgeTarget;

  const { savePayload } = applyAnswerResult({
    state,
    question,
    selectedChoice: displaySelectedChoice,
    correctAnswer,
    isCorrect,
    getQuestionId,
    buildResultMessage,
    getMapAreaLabelById,
    buildSavedSubjectName,
    normalizeValue,
    choicesContainer,
    questionElements,
    quizScore,
    nextButton,
    answerResult,
    lockChoiceButtons,
    drawSortList,
    swapSortItems,
    lockMapClickVisuals,
    rawSelectedChoice: selectedChoice
  });

  saveAnswerRecord(savePayload);

  // Phase2 Task14-2: 裏側でAnswerRecordを生成・保存する（既存の正誤判定・GAS保存には影響しない）
  try {
    recordAnswerForAttempt({
      attemptId: currentDomainAttemptId,
      studentId: savePayload.studentId,
      questionId: savePayload.questionId,
      fieldId: state.session.subject,
      unit: savePayload.unit,
      selectedChoice: savePayload.selectedChoice,
      correctAnswer: savePayload.correctAnswer,
      isCorrect: savePayload.isCorrect
    });
  } catch (domainError) {
    console.error("recordAnswerForAttempt error（既存の回答フローには影響しません）:", domainError);
  }
}

function formatMapClickChoiceForDisplay(selectedChoice, getMapAreaLabelById) {
  if (Array.isArray(selectedChoice)) {
    return selectedChoice
      .map((item) => getMapAreaLabelById(item) || String(item ?? ""))
      .join(" | ");
  }

  return String(selectedChoice ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => getMapAreaLabelById(item) || item)
    .join(" | ");
}

function normalizeValue(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/　/g, "")
    .trim()
    .toLowerCase();
}

function goToNextQuestion() {
  if (state.quiz.currentIndex < state.quiz.quizQuestions.length - 1) {
    state.quiz.currentIndex += 1;
    renderQuestion();
    return;
  }

  if (!state.quiz.retryMode && state.session.retryWrongEnabled && state.quiz.wrongQuestions.length > 0) {
    startRetryWrongRound(state);
    renderQuestion();
    return;
  }

  showFinalResult();
}

function showFinalResult() {
  renderFinalResult(state, {
    finalStudent,
    finalSubject,
    finalScore,
    wrongRetryButton
  });
  showResultScreen(resultScreen, allScreens);

  // Phase2 Task14-3: 裏側でAttemptを完了状態へ更新する（既存のリザルト表示には影響しない）
  try {
    completeAttempt(currentDomainAttemptId);
  } catch (domainError) {
    console.error("completeAttempt error（既存のリザルト表示フローには影響しません）:", domainError);
  }
}

function retryQuiz() {
  restartQuiz(state);
  renderQuestion();
  showQuizScreen(quizScreen, allScreens);
}

function retryWrongOnlyFromResult() {
  if (!state.quiz.wrongQuestions.length) return;
  startRetryWrongRound(state);
  showQuizScreen(quizScreen, allScreens);
  renderQuestion();
}

function backToStart() {
  resetStartScreenMessages({
    startError,
    answerResult
  });
  showStartScreen(startScreen, allScreens);
}

function setupStudentAutocomplete() {
  studentNameInput.addEventListener("input", handleStudentInput);

  studentNameInput.addEventListener("focus", () => {
    renderStudentSuggestions(
      studentSuggestions,
      state.session.activeStudents.slice(0, 20),
      handleStudentSelect
    );
  });

  document.addEventListener("click", (event) => {
    if (!studentSuggestions.contains(event.target) && event.target !== studentNameInput) {
      studentSuggestions.classList.add("hidden");
    }
  });
}

function handleStudentInput() {
  const keyword = String(studentNameInput.value || "").trim().toLowerCase();

  studentIdInput.value = "";
  selectedStudentLabel.textContent = "";
  selectedStudentLabel.classList.add("hidden");

  state.session.studentId = "";
  state.session.studentName = "";

  const filtered = filterStudents(state.session.activeStudents, keyword);

  renderStudentSuggestions(
    studentSuggestions,
    filtered.slice(0, 20),
    handleStudentSelect
  );
}

function handleStudentSelect(student) {
  selectStudent({
    student,
    state,
    studentNameInput,
    studentIdInput,
    selectedStudentLabel,
    studentSuggestions
  });
}