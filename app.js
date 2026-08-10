import {
  state,
  resetSessionState,
  resetQuizState,
  resetUiState
} from "./core/state.js";
import { normalizeQuestion, buildFallbackQuestionId } from "./core/question-normalizer.js";
import { prepareQuizStart, startRetryWrongRound } from "./core/quiz-controller.js";
import { pickQuestions } from "./core/question-picker.js";
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
  showHomeScreen,
  showQuizScreen,
  showResultScreen,
  showStartScreen,
  showHistoryScreen
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
import { renderHomeForStudent, toggleHomeDetail } from "./features/home/home-renderer.js";
import { buildHomePracticeQuiz } from "./features/home/home-practice-controller.js";
import { renderHistoryForStudent } from "./features/history/history-renderer.js";

const homeScreen = document.getElementById("home-screen");
const startScreen = document.getElementById("start-screen");
const quizScreen = document.getElementById("quiz-screen");
const resultScreen = document.getElementById("result-screen");
const historyScreen = document.getElementById("history-screen");
const allScreens = [homeScreen, startScreen, quizScreen, resultScreen, historyScreen];

// Phase2 Task20-A: ホーム画面の生徒選択欄。既存start-screenの生徒選択（下記
// studentNameInput等）とはDOM要素が別だが、選択処理はservices/student-service.jsの
// 既存関数（selectStudent等）をそのまま再利用し、別実装として複製しない。
const homeStudentNameInput = document.getElementById("home-student-name-input");
const homeStudentIdInput = document.getElementById("home-student-id");
const homeStudentSuggestions = document.getElementById("home-student-suggestions");
const homeSelectedStudentLabel = document.getElementById("home-selected-student-label");
const homeInfo = document.getElementById("home-info");
const homeEmptyMessage = document.getElementById("home-empty-message");
const homeError = document.getElementById("home-error");
const homeTotalStudyDays = document.getElementById("home-total-study-days");
const homeCurrentStreak = document.getElementById("home-current-streak");
const homeLatestStudy = document.getElementById("home-latest-study");
const homeWeakCount = document.getElementById("home-weak-count");
const homeDetailToggleWrap = document.getElementById("home-detail-toggle-wrap");
const homeDetailToggle = document.getElementById("home-detail-toggle");
const homeDetail = document.getElementById("home-detail");
const homeFieldList = document.getElementById("home-field-list");
const homeDormantList = document.getElementById("home-dormant-list");
const homeStartButton = document.getElementById("home-start-button");
const homeHistoryButton = document.getElementById("home-history-button");

const homeElements = {
  infoContainer: homeInfo,
  emptyMessage: homeEmptyMessage,
  errorMessage: homeError,
  totalStudyDays: homeTotalStudyDays,
  currentStreak: homeCurrentStreak,
  latestStudy: homeLatestStudy,
  weakCount: homeWeakCount,
  detailToggleWrap: homeDetailToggleWrap,
  detail: homeDetail,
  fieldList: homeFieldList,
  dormantList: homeDormantList,
  startButton: homeStartButton
};

// Phase2 Task23-1: 学習履歴詳細画面（history-screen）のDOM要素。
// history-renderer.jsはHistoryServiceのみを見て描画し、Repository/Storage/
// WeaknessService/HomeServiceへは一切アクセスしない（features/history/history-renderer.js参照）。
const historyEmptyMessage = document.getElementById("history-empty-message");
const historyError = document.getElementById("history-error");
const historyInfo = document.getElementById("history-info");
const historyTotalAnswered = document.getElementById("history-total-answered");
const historyCorrectRate = document.getElementById("history-correct-rate");
const historyTotalStudyDays = document.getElementById("history-total-study-days");
const historyCurrentStreak = document.getElementById("history-current-streak");
const historySubjectList = document.getElementById("history-subject-list");
const historyRecentList = document.getElementById("history-recent-list");
const historyBackButton = document.getElementById("history-back-button");

const historyElements = {
  infoContainer: historyInfo,
  emptyMessage: historyEmptyMessage,
  errorMessage: historyError,
  totalAnswered: historyTotalAnswered,
  correctRate: historyCorrectRate,
  totalStudyDays: historyTotalStudyDays,
  currentStreak: historyCurrentStreak,
  subjectList: historySubjectList,
  recentList: historyRecentList
};

// Phase2 Task21-3: 「苦手を復習」「復習する」ボタン押下時に呼ばれるコールバック。
// home-renderer.js はこれらの中身（Bridge呼び出し・クイズ開始）を一切知らない。
const homePracticeCallbacks = {
  onPracticeWeakField: startWeaknessReview,
  onPracticeDormantField: startDormantReview
};

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

homeStartButton.addEventListener("click", goToStartScreenFromHome);
homeDetailToggle.addEventListener("click", () => toggleHomeDetail(homeElements));
homeHistoryButton.addEventListener("click", goToHistoryScreen);
historyBackButton.addEventListener("click", () => showHomeScreen(homeScreen, allScreens));

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
    setupHomeStudentAutocomplete();
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

    await beginAttemptAndShowQuiz();
  } catch (error) {
    console.error("startQuiz error:", error);
    startError.textContent = "開始に失敗しました。GAS URLやCSVを確認してください。";
  } finally {
    startButton.disabled = false;
    startButton.textContent = "開始";
  }
}

// Phase2 Task14-1相当の裏側処理（QuestionSet/Attempt生成）とクイズ画面表示をまとめた
// 共通処理。state.quiz.quizQuestions・state.session.subject等が既に正しく設定済みで
// あることを前提とする（通常のstartQuiz()、Task21-3の苦手復習・復習推奨開始の両方から
// 呼ばれる。既存の出題フロー・裏側の記録処理自体は一切変更しない）。
async function beginAttemptAndShowQuiz() {
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
}

// Phase2 Task21-3/Task22-2: ホーム画面の「苦手を復習」「復習する」から、既存start-screenの
// 科目/単元/分野/出題形式選択を経由せず直接quiz-screenへ入るための共通処理。
// どのBridge（苦手/復習推奨）を使うか・questionId突き合わせ自体は
// features/home/home-practice-controller.js（buildHomePracticeQuiz）に委譲し、
// ここでは「controllerを呼ぶ→0件なら中断→stateへ反映→既存クイズ開始処理を呼ぶ」という
// 画面固有の配線のみを行う（0件の場合はクイズを開始しない、というご指示のとおり）。
async function startPracticeSession(fieldId, practiceType) {
  if (!state.session.studentId || !fieldId) return;

  homeError.textContent = "";

  const availableQuestions = await filterManager.getNormalizedQuestionsForSubject(fieldId);
  const practiceResult = buildHomePracticeQuiz({
    studentId: state.session.studentId,
    fieldId,
    practiceType,
    availableQuestions
  });

  if (practiceResult.questions.length === 0) {
    homeError.textContent = "現在解ける問題がありません。時間をおいて再度お試しください。";
    return;
  }

  state.session.subject = fieldId;
  state.session.unitFilter = "all";
  state.session.modeFilter = "all";
  state.session.subunitFilter = "all";
  state.session.requestedQuestionCount = practiceResult.questions.length;

  resetQuizState(state);
  resetUiState(state);

  state.quiz.allQuestions = practiceResult.questions;
  state.quiz.quizQuestions = pickQuestions(practiceResult.questions, practiceResult.questions.length);

  await beginAttemptAndShowQuiz();
}

function startWeaknessReview(fieldId) {
  return startPracticeSession(fieldId, "weak");
}

function startDormantReview(fieldId) {
  return startPracticeSession(fieldId, "dormant");
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

  // Phase2 Task21-3: 苦手復習・復習推奨はhome-screenからstart-screenを経由せず直接
  // quiz-screenへ入るため、そこから結果画面を経て「開始画面へ戻る」を押した場合、
  // start-screen側の生徒入力欄が一度も同期されていない状態になり得る。既存の
  // syncStartScreenStudentDisplay()（Task20-C）を呼ぶだけで、選択処理自体は作り直さない。
  // 通常のstart-screen経由フローでは既に同じ値が入っているため、この呼び出しは
  // 実質的に無害（べき等）。
  syncStartScreenStudentDisplay();
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

// Phase2 Task20-A/B: ホーム画面の生徒選択・情報表示。
// 生徒検索・選択のロジック自体はservices/student-service.jsの既存関数
// （filterStudents/renderStudentSuggestions/selectStudent、上記setupStudentAutocomplete等と同じもの）
// をそのまま再利用し、別実装として複製しない。DOM要素だけがhome-screen用に異なる。
function setupHomeStudentAutocomplete() {
  homeStudentNameInput.addEventListener("input", handleHomeStudentInput);

  homeStudentNameInput.addEventListener("focus", () => {
    renderStudentSuggestions(
      homeStudentSuggestions,
      state.session.activeStudents.slice(0, 20),
      handleHomeStudentSelect
    );
  });

  document.addEventListener("click", (event) => {
    if (!homeStudentSuggestions.contains(event.target) && event.target !== homeStudentNameInput) {
      homeStudentSuggestions.classList.add("hidden");
    }
  });
}

function handleHomeStudentInput() {
  const keyword = String(homeStudentNameInput.value || "").trim().toLowerCase();

  homeStudentIdInput.value = "";
  homeSelectedStudentLabel.textContent = "";
  homeSelectedStudentLabel.classList.add("hidden");

  state.session.studentId = "";
  state.session.studentName = "";
  renderHomeForStudent("", homeElements, homePracticeCallbacks);

  const filtered = filterStudents(state.session.activeStudents, keyword);

  renderStudentSuggestions(
    homeStudentSuggestions,
    filtered.slice(0, 20),
    handleHomeStudentSelect
  );
}

function handleHomeStudentSelect(student) {
  selectStudent({
    student,
    state,
    studentNameInput: homeStudentNameInput,
    studentIdInput: homeStudentIdInput,
    selectedStudentLabel: homeSelectedStudentLabel,
    studentSuggestions: homeStudentSuggestions
  });

  renderHomeForStudent(state.session.studentId, homeElements, homePracticeCallbacks);
}

// Phase2 Task20-C: ホーム画面で選択済みのstudentId（state.session.studentId）は新しく
// 作らず、既存start-screen側の表示（studentNameInput/studentIdInput/selectedStudentLabel）
// だけを最小限同期する。student-service.jsの選択処理自体（selectStudent等）は呼び直さない。
function syncStartScreenStudentDisplay() {
  studentNameInput.value = state.session.studentName || "";
  studentIdInput.value = state.session.studentId || "";

  if (state.session.studentId) {
    selectedStudentLabel.textContent = `選択中：${state.session.studentId} ${state.session.studentName}`;
    selectedStudentLabel.classList.remove("hidden");
  }
}

function goToStartScreenFromHome() {
  if (!state.session.studentId) return;

  syncStartScreenStudentDisplay();
  showStartScreen(startScreen, allScreens);
}

// Phase2 Task23-4: ホーム画面の「学習履歴を見る」から、history-screenへ遷移する。
// state.session.studentId をそのまま使う（新しいstudentId用のstate・localStorage・
// sessionStorageは作らない）。描画自体はhistory-renderer.jsに委ねる（app.jsは
// 呼び出すだけで、履歴集計・DOM生成は一切行わない）。
function goToHistoryScreen() {
  if (!state.session.studentId) return;

  renderHistoryForStudent(state.session.studentId, historyElements);
  showHistoryScreen(historyScreen, allScreens);
}
