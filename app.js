import {
  state,
  resetSessionState,
  resetQuizState,
  resetUiState
} from "./core/state.js";
import { normalizeQuestion, buildFallbackQuestionId } from "./core/question-normalizer.js";
import {
  prepareQuizStart,
  startRetryWrongRound,
  prepareResumedQuiz,
  resolveFixedSessionFieldId,
  prepareFixedQuestionSession,
  prepareFixedWrongQuestionSession,
  prepareFixedSingleQuestionSession,
  isWrongRetryEligibleAttempt
} from "./core/quiz-controller.js";
import { pickQuestions } from "./core/question-picker.js";
import { filterQuestions } from "./core/question-filters.js";
import {
  buildResultMessage,
  buildDeferredAnswerUnknownResultMessage,
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
  showHistoryScreen,
  showHistoryDetailScreen,
  showWeaknessScreen,
  showWeaknessDetailScreen,
  showTeacherScreen,
  showTestSetStudentScreen
} from "./core/screen-controller.js";
import { renderTextQuestion } from "./renderers/text-renderer.js";
import {
  renderChoiceQuestion,
  renderChoiceQuestionStem,
  renderChoiceAnswerButtons,
  lockChoiceButtons
} from "./renderers/choice-renderer.js";
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
import { UNKNOWN_ANSWER_VALUE } from "./config/unknown-answer.js";
import { isFuriganaEnabled, setFuriganaEnabled } from "./features/furigana/furigana-state.js";
import { ensureFuriganaEngineReady } from "./features/furigana/furigana-service.js";
import { applyFuriganaText } from "./features/furigana/furigana-apply.js";
import { startAttemptForQuiz } from "./features/history/quiz-start-integration.js";
import { recordAnswerForAttempt } from "./features/history/answer-record-integration.js";
import { completeAttempt } from "./features/history/attempt-complete-integration.js";
import { restoreStudentLearningRecords } from "./features/history/learning-record-restore-integration.js";
import { syncAttemptProgressRetryStart } from "./features/history/learning-record-sync-integration.js";
import {
  extractQuestionIds,
  resolveUnitForSourceType,
  restoreAttemptProgressContext,
  updateProgressWrongQuestionIds
} from "./features/progress/progress-model.js";
import { getAttemptProgress, abandonAttemptProgress } from "./services/learning-record-service.js";
import { loadAttempt, loadAttemptsByStudent, saveAttempt } from "./features/history/attempt-service.js";
import { loadAnswerRecordsByAttempt } from "./features/history/answer-record-service.js";
import { getStudentHistory } from "./features/history/history-service.js";
import { loadTestSet } from "./services/test-set-service.js";
import { SUBJECT_CONFIG } from "./config/subjects.js";
import { renderHomeForStudent, toggleHomeDetail } from "./features/home/home-renderer.js";
import { buildHomePracticeQuiz } from "./features/home/home-practice-controller.js";
import { renderHistoryForStudent, RETRY_ELIGIBLE_SOURCE_TYPES } from "./features/history/history-renderer.js";
import { getHistoryDetailViewModel } from "./features/history/history-detail-service.js";
import {
  renderHistoryDetailScreen,
  showHistoryDetailError,
  renderHistoryDetailRetryActions
} from "./features/history/history-detail-renderer.js";
import { getWeaknessListViewModel } from "./features/weakness/weakness-list-service.js";
import { renderWeaknessListScreen, showWeaknessListError } from "./features/weakness/weakness-list-renderer.js";
import { buildWeaknessDetailViewModel } from "./features/weakness/weakness-detail-model.js";
import { renderWeaknessDetailScreen, showWeaknessDetailError } from "./features/weakness/weakness-detail-renderer.js";
import { initTeacherScreen } from "./features/teacher/teacher-controller.js";
import { initTeacherHistorySection } from "./features/teacher/teacher-history-controller.js";
import { initTestSetStudentScreen, showTestSetCompletion } from "./features/test-set-student/test-set-student-controller.js";
import { showTssError } from "./features/test-set-student/test-set-student-renderer.js";
import {
  startTestSetRun,
  isRunnerActive,
  getCurrentGroup,
  getRunnerTestSetId,
  getRunnerRunId,
  getCurrentReviewRound,
  recordCurrentGroupResult,
  hasNextGroup,
  advanceToNextGroup,
  finishRun,
  abortRun,
  restoreRunnerState,
  isReviewPhase,
  buildReviewGroupsFromCurrentResults,
  buildNextReviewGroupsFromCurrentResults,
  validateReviewGroups,
  startReviewPhase,
  startNextReviewRound,
  getCurrentReviewGroup,
  recordCurrentReviewResult,
  hasNextReviewGroup,
  advanceToNextReviewGroup,
  finishReviewRun,
  getReviewRestartSnapshot,
  restartReviewFromSnapshot,
  restoreReviewRunnerState
} from "./features/test-set-runner/test-set-runner.js";
import { getReviewQuestionCount } from "./features/test-set-runner/test-set-review-model.js";
import { prepareTestSetReviewResumePlan } from "./features/test-set-runner/test-set-review-resume.js";
import {
  startMemorizeRun,
  isMemorizeRunnerActive,
  getCurrentMemorizeRound,
  getMemorizeRunId,
  getMemorizeRunnerState,
  finishMemorizeRound,
  abortMemorizeRun,
  restoreMemorizeRun
} from "./features/memorize/memorize-runner.js";
import { resolveMemorizeQuestions } from "./features/memorize/memorize-session-controller.js";
import { deriveTodaysMemorizeReview } from "./features/memorize/memorize-review-run-controller.js";
import { renderMemorizeGate } from "./features/memorize/memorize-gate-renderer.js";
import { buildMemorizeMasteryDisplayText } from "./features/memorize/memorize-progress-view.js";
import {
  validateMemorizeResumeProgress,
  buildMemorizeResumeQuestionState
} from "./features/memorize/memorize-resume-controller.js";

const homeScreen = document.getElementById("home-screen");
const startScreen = document.getElementById("start-screen");
const quizScreen = document.getElementById("quiz-screen");
const resultScreen = document.getElementById("result-screen");
const historyScreen = document.getElementById("history-screen");
const historyDetailScreen = document.getElementById("history-detail-screen");
const weaknessScreen = document.getElementById("weakness-screen");
const weaknessDetailScreen = document.getElementById("weakness-detail-screen");
const teacherScreen = document.getElementById("teacher-screen");
const testSetStudentScreen = document.getElementById("test-set-student-screen");
const allScreens = [
  homeScreen,
  startScreen,
  quizScreen,
  resultScreen,
  historyScreen,
  historyDetailScreen,
  weaknessScreen,
  weaknessDetailScreen,
  teacherScreen,
  testSetStudentScreen
];

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
const homeLatestStudyCard = document.getElementById("home-latest-study-card");
const homeWeakCount = document.getElementById("home-weak-count");
const homeWeakCountCard = document.getElementById("home-weak-count-card");
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
  latestStudyCard: homeLatestStudyCard,
  weakCount: homeWeakCount,
  weakCountCard: homeWeakCountCard,
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

// Phase3D-3: 学習履歴「詳細」画面（history-detail-screen）のDOM要素。
// history-detail-renderer.jsはview modelのみを見て描画し、GAS通信・履歴取得・
// Attempt開始は一切行わない（history-renderer.jsと同じ「取得済みデータ→DOM描画」の位置づけ）。
const historyDetailDate = document.getElementById("history-detail-date");
const historyDetailSubject = document.getElementById("history-detail-subject");
const historyDetailCount = document.getElementById("history-detail-count");
const historyDetailSourceNote = document.getElementById("history-detail-source-note");
const historyDetailList = document.getElementById("history-detail-list");
const historyDetailError = document.getElementById("history-detail-error");
const historyDetailBackButton = document.getElementById("history-detail-back-button");
// Phase4C-2: detail画面内の再挑戦ボタン。
const historyDetailRetryWrongButton = document.getElementById("history-detail-retry-wrong-button");
const historyDetailRetryButton = document.getElementById("history-detail-retry-button");

const historyDetailElements = {
  dateLabel: historyDetailDate,
  subjectLabel: historyDetailSubject,
  countLabel: historyDetailCount,
  sourceNote: historyDetailSourceNote,
  list: historyDetailList,
  error: historyDetailError,
  retryWrongButton: historyDetailRetryWrongButton,
  retryButton: historyDetailRetryButton
};

// Phase4D-1+2: 苦手問題一覧画面（weakness-screen）のDOM要素。
// weakness-list-renderer.jsはview modelのみを見て描画し、GAS通信・苦手判定・
// Attempt開始は一切行わない（history-renderer.jsと同じ「取得済みデータ→DOM描画」の位置づけ）。
const weaknessEmptyMessage = document.getElementById("weakness-empty-message");
const weaknessError = document.getElementById("weakness-error");
const weaknessList = document.getElementById("weakness-list");
const weaknessBackButton = document.getElementById("weakness-back-button");

const weaknessElements = {
  emptyMessage: weaknessEmptyMessage,
  errorMessage: weaknessError,
  list: weaknessList
};

// Phase4D-1+2: 苦手問題「詳細」画面（weakness-detail-screen）のDOM要素。
const weaknessDetailError = document.getElementById("weakness-detail-error");
const weaknessDetailSubject = document.getElementById("weakness-detail-subject");
const weaknessDetailStat = document.getElementById("weakness-detail-stat");
const weaknessDetailBody = document.getElementById("weakness-detail-body");
const weaknessDetailBackButton = document.getElementById("weakness-detail-back-button");

const weaknessDetailElements = {
  error: weaknessDetailError,
  subjectLabel: weaknessDetailSubject,
  stat: weaknessDetailStat,
  body: weaknessDetailBody
};

// Task53: 講師用問題選定画面（teacher-screen）のDOM要素。
// teacher-controller.jsはこのelementsバッグを受け取るだけで、DOM取得は一切行わない
// （history-renderer.jsと同じ方針）。studentId関連の状態には一切触れない。
const homeTeacherModeButton = document.getElementById("home-teacher-mode-button");
const teacherBackButton = document.getElementById("teacher-back-button");

const teacherElements = {
  pinGate: document.getElementById("teacher-pin-gate"),
  pinInput: document.getElementById("teacher-pin-input"),
  pinSubmitButton: document.getElementById("teacher-pin-submit-button"),
  pinError: document.getElementById("teacher-pin-error"),
  form: document.getElementById("teacher-form"),
  schoolSelect: document.getElementById("teacher-school-select"),
  gradeSelect: document.getElementById("teacher-grade-select"),
  academicYearInput: document.getElementById("teacher-academic-year-input"),
  testsetListSection: document.getElementById("teacher-testset-list-section"),
  testsetListStatus: document.getElementById("teacher-testset-list-status"),
  testsetListContainer: document.getElementById("teacher-testset-list"),
  examRoundInput: document.getElementById("teacher-exam-round-input"),
  labelInput: document.getElementById("teacher-label-input"),
  fieldSelect: document.getElementById("teacher-field-select"),
  unitSelect: document.getElementById("teacher-unit-select"),
  subunitSelect: document.getElementById("teacher-subunit-select"),
  questionError: document.getElementById("teacher-question-error"),
  questionList: document.getElementById("teacher-question-list"),
  selectAllButton: document.getElementById("teacher-select-all-button"),
  deselectAllButton: document.getElementById("teacher-deselect-all-button"),
  selectionSummary: document.getElementById("teacher-selection-summary"),
  saveButton: document.getElementById("teacher-save-button"),
  saveResult: document.getElementById("teacher-save-result")
};

// 管理Phase M-2: 講師用「生徒別の間違い問題確認」セクションのDOM要素。
// teacher-history-controller.jsはこのelementsバッグを受け取るだけで、
// DOM取得は一切行わない（teacher-controller.jsと同じ方針）。
const teacherHistoryElements = {
  studentInput: document.getElementById("teacher-history-student-input"),
  studentIdInput: document.getElementById("teacher-history-student-id"),
  studentSuggestions: document.getElementById("teacher-history-student-suggestions"),
  selectedStudentLabel: document.getElementById("teacher-history-selected-student-label"),
  showButton: document.getElementById("teacher-history-show-button"),
  status: document.getElementById("teacher-history-status"),
  wrongList: document.getElementById("teacher-history-wrong-list")
};

// Task54: 生徒用「学校のテスト対策」選択画面（test-set-student-screen）のDOM要素。
// test-set-student-controller.jsはこのelementsバッグを受け取るだけで、DOM取得は
// 一切行わない（teacher-controller.jsと同じ方針）。studentId関連の状態には触れない。
const homeTestSetButton = document.getElementById("home-test-set-button");
const tssHomeBackButton = document.getElementById("tss-home-back-button");

// STEP5: TestSet専用のresume候補UI要素（sourceType==="testset"のcandidate表示専用、
// start-screenの#resume-progressとは別要素。既存tssElementsへは混ぜず、
// resume/discardのapp.js側ロジックだけが直接触るため独立して保持する）。
const tssResumeBlock = document.getElementById("tss-resume-progress");
const tssResumeText = document.getElementById("tss-resume-progress-text");
const tssResumeContinueButton = document.getElementById("tss-resume-continue-button");
const tssResumeDiscardButton = document.getElementById("tss-resume-discard-button");
const tssResumeError = document.getElementById("tss-resume-progress-error");

const tssElements = {
  selectStep: document.getElementById("tss-select-step"),
  listStep: document.getElementById("tss-list-step"),
  confirmStep: document.getElementById("tss-confirm-step"),
  schoolSelect: document.getElementById("tss-school-select"),
  gradeSelect: document.getElementById("tss-grade-select"),
  selectError: document.getElementById("tss-select-error"),
  searchButton: document.getElementById("tss-search-button"),
  listEmpty: document.getElementById("tss-list-empty"),
  testSetList: document.getElementById("tss-test-set-list"),
  confirmInfo: document.getElementById("tss-confirm-info"),
  confirmMessage: document.getElementById("tss-confirm-message"),
  startButton: document.getElementById("tss-start-button"),
  completeStep: document.getElementById("tss-complete-step"),
  completeInfo: document.getElementById("tss-complete-info"),
  // Phase4E-2: 完了画面の「もう一度復習する」「テスト対策へ戻る」。
  completeMessage: document.getElementById("tss-complete-message"),
  completeRestartButton: document.getElementById("tss-complete-restart-button"),
  completeBackButton: document.getElementById("tss-complete-back-button")
};

// Phase3D-4B-2: TestSet全group誤答復習（review phase）の開始案内。
// 復習Attemptは案内表示より前に既に開始済みであり、このoverlayは一度きりの
// 情報提示にすぎない（閉じてもAttempt/progressには一切影響しない）。
const reviewStartBanner = document.getElementById("review-start-banner");
const reviewStartBannerText = document.getElementById("review-start-banner-text");
const reviewStartBannerCloseButton = document.getElementById("review-start-banner-close-button");

// Phase2 Task21-3: 「苦手を復習」「復習する」ボタン押下時に呼ばれるコールバック。
// home-renderer.js はこれらの中身（Bridge呼び出し・クイズ開始）を一切知らない。
// Phase4C-1: onLatestStudyClickは「前回学習」カード押下時。home-renderer.jsは
// 既存学習履歴詳細（history-detail-screen）の描画ロジックを一切知らない。
// Phase4D-1+2: onWeakCountClickは「苦手問題」カード押下時。home-renderer.jsは
// 苦手一覧画面（weakness-screen）の描画ロジックを一切知らない。
const homePracticeCallbacks = {
  onPracticeWeakField: startWeaknessReview,
  onPracticeDormantField: startDormantReview,
  onLatestStudyClick: handleHomeLatestStudyClick,
  onWeakCountClick: goToWeaknessScreen,
  onStartTodaysReview: handleStartTodaysReview
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
const startMemorizeButton = document.getElementById("start-memorize-button");
const startHomeBackButton = document.getElementById("start-home-back-button");
const startError = document.getElementById("start-error");

// Phase3C本体: 開始画面の再開候補（中断→続きから再開）UI要素。
const resumeProgressBlock = document.getElementById("resume-progress");
const resumeProgressText = document.getElementById("resume-progress-text");
const resumeContinueButton = document.getElementById("resume-continue-button");
const resumeDiscardButton = document.getElementById("resume-discard-button");
const resumeProgressError = document.getElementById("resume-progress-error");

// STEP4: resume候補競合確認は、Home（苦手復習・復習推奨）・start-screen（開始）・
// TestSet（このテスト対策を始める）の複数画面から共通で使うため、特定の.screenの中に
// 置かず、画面遷移とは独立したグローバルモーダルとして持つ（1箇所に集約、複製しない）。
const globalConfirmModal = document.getElementById("global-confirm-modal");
const globalConfirmText = document.getElementById("global-confirm-text");
const globalConfirmError = document.getElementById("global-confirm-error");
const globalConfirmYesButton = document.getElementById("global-confirm-yes-button");
const globalConfirmCancelButton = document.getElementById("global-confirm-cancel-button");

const quizStudent = document.getElementById("quiz-student");
const quizSubject = document.getElementById("quiz-subject");
const quizProgress = document.getElementById("quiz-progress");
const quizScore = document.getElementById("quiz-score");
const quizUnit = document.getElementById("quiz-unit");
const furiganaToggleButton = document.getElementById("furigana-toggle-button");
const furiganaStatus = document.getElementById("furigana-status");
const choicesContainer = document.getElementById("choices-container");
const answerInput = document.getElementById("answer-input");
const submitButton = document.getElementById("submit-button");
const unknownAnswerButton = document.getElementById("unknown-answer-button");
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
  get questionImage() {
    return document.getElementById("question-image");
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
historyBackButton.addEventListener("click", returnToHome);
historyDetailBackButton.addEventListener("click", returnFromHistoryDetail);
weaknessBackButton.addEventListener("click", returnFromWeaknessScreen);
weaknessDetailBackButton.addEventListener("click", returnFromWeaknessDetail);

homeTeacherModeButton.addEventListener("click", goToTeacherScreen);
teacherBackButton.addEventListener("click", returnToHome);

homeTestSetButton.addEventListener("click", goToTestSetStudentScreen);
tssHomeBackButton.addEventListener("click", returnToHome);

reviewStartBannerCloseButton.addEventListener("click", hideReviewStartBanner);

startHomeBackButton.addEventListener("click", returnToHome);

startButton.addEventListener("click", startQuiz);
startMemorizeButton.addEventListener("click", startMemorizeQuiz);
resumeContinueButton.addEventListener("click", handleResumeContinueClick);
resumeDiscardButton.addEventListener("click", handleResumeDiscardClick);
tssResumeContinueButton.addEventListener("click", handleTestSetResumeContinueClick);
tssResumeDiscardButton.addEventListener("click", handleTestSetResumeDiscardClick);
globalConfirmYesButton.addEventListener("click", handleGlobalConfirmYesClick);
globalConfirmCancelButton.addEventListener("click", handleGlobalConfirmCancelClick);
submitButton.addEventListener("click", handleSubmitButton);
unknownAnswerButton.addEventListener("click", () => handleAnswer(UNKNOWN_ANSWER_VALUE));
nextButton.addEventListener("click", goToNextQuestion);
retryButton.addEventListener("click", retryQuiz);
backButton.addEventListener("click", backToStart);
wrongRetryButton.addEventListener("click", retryWrongOnlyFromResult);
backToStartButton.addEventListener("click", backToStart);
furiganaToggleButton.addEventListener("click", handleFuriganaToggle);

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

// Phase3C本体: 開始画面の再開候補（getAttemptProgressの結果、候補なしはnull）。
let resumeCandidate = null;
// 生徒切替race対策: この番号が発行時点の最新値と一致する場合のみ結果を反映する。
let resumeCandidateRequestId = 0;
// グローバル確認モーダルの「はい」「キャンセル」押下時に実行する処理（用途により差し替える）。
let globalConfirmYesAction = null;
let globalConfirmCancelAction = null;

// STEP3/STEP4: resume候補が存在する状態で新しいAttemptを開始するすべての経路
// （通常「開始」・Home「苦手を復習」「復習する」・TestSet「このテスト対策を始める」）が
// 通る共通ガード。候補が無ければ即座にonProceedを実行してその戻り値をそのまま返す。
// 候補がある場合は確認モーダルを表示し、
//   - キャンセル: onProceedを実行せず、cancelResult（省略時undefined）で解決する
//   - はい→abandon失敗: onProceedを実行せず、abandonFailResult（省略時undefined）で解決する
//     （新規開始しない。エラーはグローバルモーダル内に表示する）
//   - はい→abandon成功: 旧resume候補を隠し、onProceedを実行してその戻り値をそのまま返す
// TestSet実行中の次グループ開始（finishCurrentTestSetGroupAndAdvance→startTestSetGroupQuiz）は
// この関数を経由しない（「このテスト対策を始める」の最初の1回だけをガードする、STEP6）。
function confirmAndAbandonResumeBeforeNewAttempt(onProceed, { cancelResult, abandonFailResult } = {}) {
  if (!resumeCandidate) {
    return onProceed();
  }

  const candidateAttemptId = resumeCandidate.attemptId;

  return new Promise((resolve) => {
    openGlobalConfirm(
      "前回の続きは再開できなくなります。新しく始めますか？",
      async () => {
        try {
          await abandonAttemptProgress(candidateAttemptId);
        } catch (error) {
          console.error("abandonAttemptProgress error（新規開始を中止します）:", error);
          globalConfirmError.textContent = "前回の続きの削除に失敗しました。通信環境を確認して、もう一度お試しください。";
          resolve(abandonFailResult);
          return;
        }
        closeGlobalConfirm();
        hideResumeCandidate();
        resolve(await onProceed());
      },
      () => resolve(cancelResult)
    );
  });
}

async function startQuiz() {
  await confirmAndAbandonResumeBeforeNewAttempt(executeStartQuiz);
}

async function executeStartQuiz() {
  const studentName = String(studentNameInput.value || "").trim();
  const studentId = String(studentIdInput.value || "").trim();
  const subject = String(subjectSelect.value || "").trim();
  const unitFilter = String(unitFilterSelect.value || "all").trim();
  const modeFilter = String(modeFilterSelect.value || "all").trim();
  const subunitFilter = String(subunitFilterSelect.value || "all").trim();
  const requestedQuestionCount = Number(questionCountSelect.value || 20);

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

    await beginAttemptAndShowQuiz("normal", null, unitFilter);
  } catch (error) {
    console.error("startQuiz error:", error);
    startError.textContent = "開始に失敗しました。GAS URLやCSVを確認してください。";
  } finally {
    startButton.disabled = false;
    startButton.textContent = "開始";
  }
}

// 暗記モード-1 STEP M1-5: 正式な暗記モード新規開始導線。
//
// 既存start-screenの科目/単元/分野選択（subjectSelect/unitFilterSelect/subunitFilterSelect）を
// そのまま再利用する。出題形式選択（modeFilterSelect）・問題数選択（questionCountSelect）・
// 「間違えた問題を最後にもう一度出す」（retryWrongOnlyCheckbox）は暗記モードの概念に
// 対応しないため使用しない（Round対象は選択式問題の全件、出題順はrunner/selectorが正本）。
//
// 既存executeStartQuiz()と同じ検証文言・同じconfirmAndAbandonResumeBeforeNewAttempt()経由の
// resume候補競合ガードを踏襲する。core/quiz-controller.jsのprepareQuizStart()は
// pickQuestions()（シャッフル）を内部で呼ぶため、M1-3の「shuffleしない」方針上ここでは
// 使わず、同じ検証・同じfilterQuestions()（既存core/question-filters.js、無変更）を
// 直接呼ぶ薄い専用パスとする。
async function startMemorizeQuiz() {
  await confirmAndAbandonResumeBeforeNewAttempt(executeStartMemorizeQuiz);
}

async function executeStartMemorizeQuiz() {
  const studentName = String(studentNameInput.value || "").trim();
  const studentId = String(studentIdInput.value || "").trim();
  const subject = String(subjectSelect.value || "").trim();
  const unitFilter = String(unitFilterSelect.value || "all").trim();
  const subunitFilter = String(subunitFilterSelect.value || "all").trim();

  startError.textContent = "";

  if (!studentId || !studentName) {
    startError.textContent = "候補から生徒を選んでください。";
    return;
  }

  if (!subject || !SUBJECT_CONFIG[subject]) {
    startError.textContent = "科目を選んでください。";
    return;
  }

  try {
    startMemorizeButton.disabled = true;
    startMemorizeButton.textContent = "読込中...";

    const normalizedQuestions = await filterManager.getNormalizedQuestionsForSubject(subject);

    // 暗記モードVer.1はchoice形式のみ対応。既存mode-filter-selectの値に関わらず、
    // 対象決定の時点でchoiceだけに絞る（memorize-session-controller.jsの
    // fail-closed検証は維持しつつ、開始前に安全側へ倒す）。
    const filtered = filterQuestions(
      normalizedQuestions,
      { unitFilter, modeFilter: "choice", subunitFilter },
      normalizeValue
    );

    if (!filtered.length) {
      startError.textContent = "条件に合う問題がありません。";
      return;
    }

    state.session.studentName = studentName;
    state.session.studentId = studentId;

    const questionIds = filtered.map((question) => question.questionId);
    const result = await startMemorizeRunQuiz(subject, questionIds, unitFilter !== "all" ? unitFilter : "");

    if (!result.ok) {
      startError.textContent = result.errorMessage || "暗記モードを開始できませんでした。";
    }
  } catch (error) {
    console.error("startMemorizeQuiz error:", error);
    startError.textContent = "開始に失敗しました。GAS URLやCSVを確認してください。";
  } finally {
    startMemorizeButton.disabled = false;
    startMemorizeButton.textContent = "暗記モードで開始";
  }
}

// Phase2 Task14-1相当の裏側処理（QuestionSet/Attempt生成）とクイズ画面表示をまとめた
// 共通処理。state.quiz.quizQuestions・state.session.subject等が既に正しく設定済みで
// あることを前提とする（通常のstartQuiz()、Task21-3の苦手復習・復習推奨開始、Task55の
// TestSet実行の全てから呼ばれる。既存の出題フロー・裏側の記録処理自体は一切変更しない）。
//
// Phase5-6: sourceType/testSetIdは呼び出し元（既知の開始経路）が明示的に渡す。
// 「値が無ければnormal」という後方互換fallbackはしない（起点不明のまま送るより、
// 呼び出し元の実装漏れとして気づける方を優先する）。
// Phase3B-2: unitFilterも呼び出し元が渡す（state.session.unitFilterは呼び出し元によって
// "all"固定の場合と実際の選択値の場合があるため、ここではなく各呼び出し元の直前で
// 読む）。resolveUnitForSourceType()がsourceType==="normal"以外を空文字へ正規化する。
// Phase3C前提: retryWrongEnabledは、この時点で既にstate.session.retryWrongEnabledへ
// 呼び出し元（startQuiz/startPracticeSession/startTestSetGroupQuiz）が正しい実効値を
// 設定済みのため、ここで直接読むだけでよい（新しい引数を各呼び出し元へ増やさない）。
// Phase4E-0A: sourceTypeからrunId/reviewRoundを決める（resolveUnitForSourceType()と同じ
// 「呼び出し元へ新しい引数を増やさず、beginAttemptAndShowQuiz内部でsourceType起点に決定する」
// 設計方針）。testset/testset_reviewのみrunner側（test-set-runner.js）の現在値を使い、
// それ以外は常にnull（normal/weak_review/dormant_reviewではrunId/reviewRoundを一切送らない、
// Phase4E-0A正式契約どおり）。
function resolveRunIdentityForSourceType(sourceType) {
  if (sourceType === "testset") {
    return { runId: getRunnerRunId(), reviewRound: 0 };
  }
  if (sourceType === "testset_review") {
    return { runId: getRunnerRunId(), reviewRound: getCurrentReviewRound() };
  }
  // 暗記モード-1（M1-3）: memorize runner（features/memorize/memorize-runner.js）の
  // 現在値をそのまま使う。TestSet runnerとは完全に別のsingletonのため相互に影響しない。
  if (sourceType === "memorize") {
    return { runId: getMemorizeRunId(), reviewRound: getCurrentMemorizeRound() };
  }
  return { runId: null, reviewRound: null };
}

async function beginAttemptAndShowQuiz(sourceType, testSetId = null, unitFilter = "") {
  try {
    const { runId, reviewRound } = resolveRunIdentityForSourceType(sourceType);
    const domainAttemptResult = await startAttemptForQuiz({
      quizQuestions: state.quiz.quizQuestions,
      subject: state.session.subject,
      studentId: state.session.studentId,
      sourceType,
      testSetId,
      runId,
      reviewRound,
      unit: resolveUnitForSourceType(sourceType, unitFilter),
      retryWrongEnabled: state.session.retryWrongEnabled
    });
    currentDomainAttemptId = domainAttemptResult ? domainAttemptResult.attempt.attemptId : "";
  } catch (domainError) {
    console.error("startAttemptForQuiz error（既存の出題フローには影響しません）:", domainError);
    currentDomainAttemptId = "";
  }

  await renderQuestion();
  // TestSet実行中は「開始画面へ戻る」が通常学習のstart-screenへ迷い込ませてしまうため、
  // 文言を「テスト対策へ戻る」に変える（backToStart()側の遷移先切り替えと対）。
  backToStartButton.textContent = isRunnerActive() ? "テスト対策へ戻る" : "開始画面へ戻る";
  showQuizScreen(quizScreen, allScreens);
}

// Phase5-6: home-practice-controller.jsのpracticeType（"weak"/"dormant"、既存の内部呼称）と、
// Attemptのsource Type（"weak_review"/"dormant_review"、domain-model-v1.md 3.11.1節の正式値）は
// 文字列表現が異なるため、ここで変換する。他ファイルへ波及させない最小限のマッピング。
const PRACTICE_TYPE_TO_SOURCE_TYPE = {
  weak: "weak_review",
  dormant: "dormant_review"
};

// Phase2 Task21-3/Task22-2: ホーム画面の「苦手を復習」「復習する」から、既存start-screenの
// 科目/単元/分野/出題形式選択を経由せず直接quiz-screenへ入るための共通処理。
// どのBridge（苦手/復習推奨）を使うか・questionId突き合わせ自体は
// features/home/home-practice-controller.js（buildHomePracticeQuiz）に委譲し、
// ここでは「controllerを呼ぶ→0件なら中断→stateへ反映→既存クイズ開始処理を呼ぶ」という
// 画面固有の配線のみを行う（0件の場合はクイズを開始しない、というご指示のとおり）。
//
// Phase4D-3: errorTargetはhandleHistoryRetryClick()等と同じerrorTargetパターン
// （既定はhomeError＝Home画面側）。苦手一覧画面（weakness-screen）の「まとめて解く」から
// 呼ばれる場合はHomeが非表示中のため、呼び出し元がweaknessErrorへ差し替える。
async function startPracticeSession(fieldId, practiceType, { errorTarget = homeError } = {}) {
  if (!state.session.studentId || !fieldId) return;

  errorTarget.textContent = "";

  const availableQuestions = await filterManager.getNormalizedQuestionsForSubject(fieldId);
  const practiceResult = buildHomePracticeQuiz({
    studentId: state.session.studentId,
    fieldId,
    practiceType,
    availableQuestions
  });

  if (practiceResult.questions.length === 0) {
    errorTarget.textContent = "現在解ける問題がありません。時間をおいて再度お試しください。";
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

  await beginAttemptAndShowQuiz(PRACTICE_TYPE_TO_SOURCE_TYPE[practiceType] || null, null, state.session.unitFilter);
}

// STEP7: 苦手復習・復習推奨もresume候補競合の共通ガードを通す
// （practiceType自体はstartPracticeSession内部でsourceTypeへ変換されるため、
// ここでは呼び出し方を変えるだけで既存のマッピングロジックには触れない）。
//
// Phase4D-3: errorTargetはstartPracticeSession()と同じerrorTargetパターン
// （既定はhomeError、Home「苦手を復習」「復習する」の既存呼び出し箇所は無変更のまま）。
function startWeaknessReview(fieldId, { errorTarget = homeError } = {}) {
  return confirmAndAbandonResumeBeforeNewAttempt(() => startPracticeSession(fieldId, "weak", { errorTarget }));
}

function startDormantReview(fieldId, { errorTarget = homeError } = {}) {
  return confirmAndAbandonResumeBeforeNewAttempt(() => startPracticeSession(fieldId, "dormant", { errorTarget }));
}

// 暗記モード-3 STEP M3-6: Home画面「{科目}の今日の復習をする」ボタン押下時のコールバック。
// startWeaknessReview/startDormantReviewとは異なり、confirmAndAbandonResumeBeforeNewAttempt()
// をここで別途ラップしない——startTodaysMemorizeReview(fieldId)（M3-5、無変更）が内部で
// 既にこのgateを持つため（due 0件ならgate自体を通らず、due>0かつunfinished Runがある場合のみ
// 確認ダイアログが出る、というM3-5確定契約をそのまま利用する）。
// questionIdsはここでもhome-renderer.jsでも一切扱わない。fieldIdのみを渡し、
// startTodaysMemorizeReview()内部でfresh historyから再deriveさせる（M3-5のstale ID対策を
// 壊さないため）。
async function handleStartTodaysReview(fieldId) {
  homeError.textContent = "";

  const result = await startTodaysMemorizeReview(fieldId);

  if (!result.ok) {
    homeError.textContent = result.errorMessage || "今日の復習を開始できませんでした。";
    return;
  }

  if (result.status === "empty") {
    // Home描画時点のdue件数はsnapshotに過ぎないため、クリック時には0件になっている
    // 場合がある（正常）。Runは開始しない。
    homeError.textContent = "対象の問題が見つかりませんでした。";
    return;
  }

  // status === "started": 既存startMemorizeRunQuiz()がshowQuizScreen()で画面遷移済み。
  // status === "cancelled"（unfinished Run確認でキャンセル）: 既存weak/dormantのcancelと
  // 同じく、何も表示せずHome画面に留まる。
}

function getQuestionId(question) {
  const rawId = String(question?.questionId ?? question?.id ?? "").trim();
  if (rawId) return rawId;
  return buildFallbackQuestionId(question || {}, state.session.subject || "");
}

// Task F-1/F-2: ふりがなON/OFF切替。
// トグル自体はrenderQuestion()を呼び直さない（state.ui.answered等がリセットされ、
// 既に解答済みの問題が誤って未解答状態へ戻ってしまうため）。代わりに、現在画面に
// 出ている問題文・choiceボタン・sort項目のテキストだけを、既存の解答済み状態
// （ロック・正誤色・selectedChoice等）を一切変えずに再描画する。
async function handleFuriganaToggle() {
  const nextEnabled = !isFuriganaEnabled();
  setFuriganaEnabled(nextEnabled);
  furiganaToggleButton.textContent = nextEnabled ? "ふりがな ON" : "ふりがな OFF";
  furiganaToggleButton.setAttribute("aria-pressed", String(nextEnabled));

  if (!nextEnabled) {
    furiganaStatus.textContent = "";
    refreshFuriganaDisplay();
    return;
  }

  furiganaStatus.textContent = "ふりがなを準備中…";
  const ready = await ensureFuriganaEngineReady();

  // 準備中にもう一度OFFへ切り替えられていたら、ここでONへ戻さない。
  if (!isFuriganaEnabled()) {
    furiganaStatus.textContent = "";
    return;
  }

  if (!ready) {
    furiganaStatus.textContent = "ふりがなの準備に失敗しました。通常表示のまま続けられます。";
    setFuriganaEnabled(false);
    furiganaToggleButton.textContent = "ふりがな OFF";
    furiganaToggleButton.setAttribute("aria-pressed", "false");
    return;
  }

  furiganaStatus.textContent = "";
  refreshFuriganaDisplay();
}

// 現在表示中の問題文・choice/eraボタン・sort項目のテキストだけを、
// ふりがな設定に合わせて再描画する（クイズの進行状態・解答結果には触れない）。
function refreshFuriganaDisplay() {
  const question = state.quiz.currentQuestion;
  if (!question) return;

  applyFuriganaText(questionElements.questionText, question.question || questionElements.questionText.textContent);

  if (question.mode === "choice" || question.mode === "era") {
    choicesContainer.querySelectorAll(".choice-button").forEach((button) => {
      const value = button.dataset.choiceValue;
      if (value !== undefined) applyFuriganaText(button, value);
    });
  }

  if (question.mode === "sort") {
    drawSortList(choicesContainer, state, (fromIndex, toIndex) => {
      if (state.ui.answered) return;
      swapSortItems(fromIndex, toIndex);
    });
  }
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
    renderChoiceQuestionStem,
    renderChoiceAnswerButtons,
    renderTextQuestion,
    renderMemorizeGate,
    ERA_CHOICES,
    handleAnswer,
    swapSortItems,
    hideSubunit: isRunnerActive(),
    // 暗記モード-1（M1-3）: memorize run実行中のみ想起ゲートを出す。それ以外
    // （通常学習・TestSet・weak/dormant_review等）はfalseのまま＝M1-2までと完全に同じ挙動。
    deferAnswerUi: isMemorizeRunnerActive(),
    unknownAnswerButton
  });

  // 暗記モード-2 STEP M2-3: renderCurrentQuestion()が全mode共通で書き込んだ
  // quizScore「正解数：N」を、暗記モード実行中だけ「習得：X / Y」へ上書きする
  // （Round境界でstate.quiz.scoreが0へresetされても、Run全体のmastered数を維持して見せるため）。
  updateMemorizeMasteryDisplay();
}

// 暗記モード-2 STEP M2-3: quiz-scoreへ「習得：X / Y」を表示する（Run全体でmasteredに
// なったquestion数 / Run開始時のinitial question総数）。isMemorizeRunnerActive()が
// falseの間は何もしない（renderCurrentQuestion()/applyAnswerResult()が書いた
// 「正解数：N」をそのまま残す）。M2 state自体は保存せず、既存Attempt/AnswerRecordから
// 毎回deriveする（features/memorize/memorize-progress-view.jsのbuildMemorizeMasteryDisplayText()、
// 内部でfeatures/memorize/memorize-question-state.jsのderiveMemorizeQuestionStates()を呼ぶ）。
// derive失敗時はfail-soft（quizScoreを上書きしない、学習・回答・Round進行には一切影響しない）。
function updateMemorizeMasteryDisplay() {
  if (!isMemorizeRunnerActive()) return;

  const studentId = state.session.studentId;
  const runnerState = getMemorizeRunnerState();
  const runId = runnerState.runId;

  const attempts = loadAttemptsByStudent(studentId).filter(
    (attempt) => attempt.sourceType === "memorize" && attempt.runId === runId
  );
  const answerRecords = attempts.flatMap((attempt) => loadAnswerRecordsByAttempt(attempt.attemptId));

  const result = buildMemorizeMasteryDisplayText({
    studentId,
    runId,
    runnerInitialQuestionIds: runnerState.initialQuestionIds,
    attempts,
    answerRecords
  });

  if (result.ok) {
    quizScore.textContent = result.text;
  }
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

  unknownAnswerButton.disabled = false;

  answerResult.classList.remove("correct", "incorrect");
  answerResult.style.color = "";

  // 暗記モード-1 STEP M1-18: showMemorizeRunCompletion()が完了時にnoneへ設定した
  // quizProgress/quizScoreを、次の問題render開始時に必ず再表示へ戻す
  // （全モード共通でこの関数を通るため、暗記Run完了後に通常学習・新しい暗記Runの
  // いずれへ進んでも復元される）。
  quizProgress.style.display = "";
  quizScore.style.display = "";

  questionElements.questionImage.classList.add("hidden");
  questionElements.questionImage.src = "";
  questionElements.questionImage.alt = "";

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
  unknownAnswerButton.disabled = true;

  const question = state.quiz.currentQuestion;
  const isUnknownAnswer = selectedChoice === UNKNOWN_ANSWER_VALUE;

  const judgeTarget =
    question?.mode === "map_click"
      ? toJudgeableMapClickAnswer(selectedChoice)
      : selectedChoice;

  const correctAnswer = getCorrectAnswer(question);
  // 「わからない」はjudgeAnswer()の偶然の不一致に依存せず、明示的にisCorrect=falseとする
  // （STEP4の方針どおり。judgeAnswer・AnswerRecordモデル・GAS契約は無変更）。
  const isCorrect = isUnknownAnswer ? false : judgeAnswer(question, judgeTarget, normalizeValue);

  const displaySelectedChoice =
    question?.mode === "map_click"
      ? formatMapClickChoiceForDisplay(selectedChoice, getMapAreaLabelById)
      : judgeTarget;

  // 暗記モード-1（M1-2）: 想起ゲート経由の「わからない」（state.ui.deferAnswerUiActive
  // かつisUnknownAnswer）の場合だけ、結果メッセージを専用の中立文言へ差し替え、
  // 結果表示のclass/色も中立（neutral、赤でも緑でもない）にする。
  // 通常学習・TestSet等の既存unknown表示（buildResultMessage・赤incorrect）は
  // 一切変更しない（isCorrectだけで判定せず、deferAnswerUiActiveとisUnknownAnswerの
  // 両方を明示条件にする）。保存契約（selectedChoice/isCorrect/wrongQuestions等）は
  // applyAnswerResult側のロジックを一切変更していないため無影響。
  const isMemorizeUnknown = state.ui.deferAnswerUiActive && isUnknownAnswer;
  const resultMessageBuilder = isMemorizeUnknown
    ? buildDeferredAnswerUnknownResultMessage
    : buildResultMessage;

  const { savePayload } = applyAnswerResult({
    state,
    question,
    selectedChoice: displaySelectedChoice,
    correctAnswer,
    isCorrect,
    getQuestionId,
    buildResultMessage: resultMessageBuilder,
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
    rawSelectedChoice: selectedChoice,
    resultDisplayVariant: isMemorizeUnknown ? "neutral" : undefined
  });

  // 暗記モード-1（M1-4）: Resume用に、現在Round内・現在位置までのwrong/unknown一覧を
  // AttemptProgressのcontextへ反映する。「思い出した」押下時点では呼ばない（回答確定後のみ）。
  // state.ui.deferAnswerUiActiveは想起ゲート経由（＝memorize）のときだけtrueになる既存フラグ
  // （通常学習・TestSet等では常にfalseのまま、無関係）。recordAnswerForAttempt()より前に呼ぶことで、
  // その内部のsyncAttemptProgress()が最新のwrongQuestionIdsを含めて送信する。
  if (state.ui.deferAnswerUiActive) {
    updateProgressWrongQuestionIds(currentDomainAttemptId, extractQuestionIds(state.quiz.wrongQuestions));
  }

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
      isCorrect: savePayload.isCorrect,
      // Phase3B-2: 「次に表示すべき問題のindex」。「次へ」クリック時ではなく回答確定時点で
      // 送ることで、ブラウザが閉じられても回答済みの問題へ再開時に戻ってしまうズレを防ぐ
      // （state.quiz.currentIndexはこの時点ではまだ「今answerした問題」のindexのまま、
      // goToNextQuestion()が押されるまでインクリメントされない）。
      currentQuestionIndex: state.quiz.currentIndex + 1
    });
  } catch (domainError) {
    console.error("recordAnswerForAttempt error（既存の回答フローには影響しません）:", domainError);
  }

  // 暗記モード-2 STEP M2-3: recordAnswerForAttempt()がMemoryStorageへ同期保存した直後
  // （GAS送信の完了は待たない）に、回答直後の最新state込みでquiz-scoreを更新する。
  updateMemorizeMasteryDisplay();
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
    // Phase3B-2: startRetryWrongRound()実行後はstate.quiz.quizQuestionsが
    // シャッフル済みのwrong問題一覧に置き換わっているため、この時点で抽出した順序が
    // 「retryで実際に出題される順序」と一致する（wrongQuestionIdsとして送るのはこの順序）。
    syncAttemptProgressRetryStart(currentDomainAttemptId, extractQuestionIds(state.quiz.quizQuestions));
    renderQuestion();
    return;
  }

  showFinalResult();
}

function showFinalResult() {
  // Task55: TestSet実行中は、既存result-screenを表示せず次グループへ連続実行する
  // （通常学習のresult-screen・retry/wrong-retryボタンはTestSet実行中は一切使わない、
  // Task55確定方針）。既存Attempt完了処理（completeAttempt）は各グループとも通常学習と
  // 全く同じ経路をそのまま通す。
  // Phase3D-4B-2: TestSet内の現在工程（通常group/復習）はsourceType文字列ではなく
  // runner phase（isReviewPhase()）を正本として分岐する（runner stateがTestSet内の
  // 現在工程を表すため、Phase3D-4B設計監査STEP48の結論どおり）。
  if (isRunnerActive() && isReviewPhase()) {
    finishCurrentTestSetReviewGroupAndAdvance();
    return;
  }
  if (isRunnerActive()) {
    finishCurrentTestSetGroupAndAdvance();
    return;
  }
  // 暗記モード-1（M1-3）: memorize run実行中は、既存result-screenを使わず
  // Round連鎖（次Round開始 or 完了表示）へ分岐する。TestSet runnerとmemorize runnerは
  // 別々のsingletonで同時にactiveになる呼び出し経路が無いため、判定順序は影響しない。
  if (isMemorizeRunnerActive()) {
    finishCurrentMemorizeRoundAndAdvance();
    return;
  }

  renderFinalResult(state, {
    finalStudent,
    finalSubject,
    finalScore,
    wrongRetryButton
  });
  showResultScreen(resultScreen, allScreens);

  // Phase2 Task14-3: 裏側でAttemptを完了状態へ更新する（既存のリザルト表示には影響しない）
  // Phase3D-2前提: 通常ラウンドの誤答集合（retry開始前のstate.quiz.wrongQuestions）を
  // ここで抽出して渡す。retry後のAnswerRecordやattempt_progressから逆算しない。
  try {
    completeAttempt(currentDomainAttemptId, extractQuestionIds(state.quiz.wrongQuestions));
  } catch (domainError) {
    console.error("completeAttempt error（既存のリザルト表示フローには影響しません）:", domainError);
  }
}

// Task55: TestSetの現在グループの結果を記録し、次グループがあれば続けてQuizを開始する。
// 全グループ完了時のみTestSet全体完了として扱う（result-controller.jsのrenderFinalResultと
// 同じ集計方式：間違い直しラウンドがあった場合はfirstRoundScore/firstRoundTotalを本来の
// 結果として使う。これはAnswerRecord・History・Weaknessが元の解答を基準にしているのと
// 一致させるため）。
async function finishCurrentTestSetGroupAndAdvance() {
  const groupCorrect = state.quiz.retryMode ? state.quiz.firstRoundScore : state.quiz.score;
  const groupTotal = state.quiz.retryMode ? state.quiz.firstRoundTotal : state.quiz.quizQuestions.length;
  // Phase3D-2前提: このgroup（＝このAttempt）のstate.quiz.wrongQuestionsは、次groupの
  // resetQuizState（startTestSetGroupQuiz内）が呼ばれる前のこの時点でのみ正しい値を保持する。
  // Phase3D-4B-2: 同じ配列をrecordCurrentGroupResult（runner result）とcompleteAttempt
  // （Attempt保存）の両方へ渡す（二重計算しない、Phase3D-4B設計監査STEP16の結論どおり）。
  const initialWrongQuestionIds = extractQuestionIds(state.quiz.wrongQuestions);
  recordCurrentGroupResult(groupCorrect, groupTotal, initialWrongQuestionIds);

  // Phase2 Task14-3と同じ既存Attempt完了処理。TestSetの各グループも通常学習と同じ
  // Attempt/AnswerRecord経路を通っているため、History/Weaknessは無改修で反映される。
  try {
    completeAttempt(currentDomainAttemptId, initialWrongQuestionIds);
  } catch (domainError) {
    console.error("completeAttempt error（TestSet実行フローには影響しません）:", domainError);
  }

  if (hasNextGroup()) {
    const nextGroup = advanceToNextGroup();
    await startTestSetGroupQuiz(nextGroup.fieldId, nextGroup.questionIds);
    return;
  }

  // Phase3D-4B-2: 全通常group完了時のみ、誤答復習フェーズへの分岐を判定する。
  // available=false（旧Attempt等でinitialWrongQuestionIdsが不明なgroupが混在）の場合は、
  // 復習対象を正確に特定できないため復習を自動生成せず、既存の完了経路へフォールバックする
  // （アプリ異常として扱わない、Phase3D-4B設計監査「old Attempt unavailable」の結論どおり）。
  const review = buildReviewGroupsFromCurrentResults();

  if (!review.available || review.groups.length === 0) {
    const summary = finishRun();
    showTestSetCompletion(tssElements, summary);
    showTestSetStudentScreen(testSetStudentScreen, allScreens);
    return;
  }

  // Phase3D-4B-2: 復習フェーズ全体（全fieldIdのquestionIds）を、最初のreview Attemptを
  // 開始する前に一括検証する。1件でも問題データに不整合があれば、部分的に復習を開始せず
  // 安全側（既存TestSet画面へ戻す）へ倒す（Phase3D-4B設計監査「preflight全体」の結論どおり）。
  const preflight = await validateReviewGroups(review.groups, filterManager.getNormalizedQuestionsForSubject);

  if (!preflight.ok) {
    console.error("復習フェーズの開始に失敗（通常TestSetの結果には影響しません）:", preflight.errorMessage);
    abortRun();
    goToTestSetStudentScreen();
    showTssError(tssElements.selectError, "間違い直しの問題を準備できませんでした。テスト対策画面からもう一度お試しください。");
    return;
  }

  startReviewPhase(review.groups);
  await startTestSetReviewGroup();
  // Phase3D-4B-2: 案内は最初のreview Attempt開始・quiz画面表示後に一度だけ表示する
  // （review2以降では表示しない、Phase3D-4B設計監査STEP45/187の結論どおり）。
  showReviewStartBanner(getReviewQuestionCount(review.groups));
}

// Phase3D-4B-2: TestSetの1復習グループ（単一fieldId、そのfieldIdの誤答questionIdsのみ）分の
// Quizを開始する。既存startTestSetGroupQuiz()と同じ構造（固定questionIdsをactiveな問題一覧から
// 抽出→stateへ直接設定→beginAttemptAndShowQuiz）を踏襲し、sourceTypeのみ"testset_review"にする。
// 現在の復習グループはrunner側（getCurrentReviewGroup）から取得する（startTestSetGroupQuizと
// 異なり引数を取らない、Phase3D-4B設計監査STEP25の設計どおり）。
async function startTestSetReviewGroup() {
  const group = getCurrentReviewGroup();

  if (!group) {
    // 通常到達しない安全側フォールバック（reviewGroupsが空でstartReviewPhaseを呼んだ場合等）。
    console.error("startTestSetReviewGroup: 現在の復習グループを取得できません（TestSet実行フローには影響しません）。");
    const summary = finishReviewRun();
    showTestSetCompletion(tssElements, summary);
    showTestSetStudentScreen(testSetStudentScreen, allScreens);
    return;
  }

  const availableQuestions = await filterManager.getNormalizedQuestionsForSubject(group.fieldId);
  const matched = availableQuestions.filter((q) => group.questionIds.includes(q.questionId));

  state.session.subject = group.fieldId;
  state.session.unitFilter = "all";
  state.session.modeFilter = "all";
  state.session.subunitFilter = "all";
  state.session.requestedQuestionCount = matched.length;
  // 通常TestSet groupと同じ安全策（2026-08-30確定方針）。復習は1巡のみで、
  // 再誤答してもその場で再々出題しない（Phase3D-4B設計監査「review回数」の結論どおり）。
  state.session.retryWrongEnabled = false;

  resetQuizState(state);
  resetUiState(state);

  state.quiz.allQuestions = matched;
  state.quiz.quizQuestions = pickQuestions(matched, matched.length);

  await beginAttemptAndShowQuiz("testset_review", getRunnerTestSetId(), state.session.unitFilter);
}

// Phase3D-4B-2: 復習グループ完了時の結果記録・次復習グループへの遷移。
// 既存finishCurrentTestSetGroupAndAdvance()と責務・順序を揃える（Phase3D-4B設計監査STEP49）。
//
// Phase4E-1: このroundの全field完了後、無条件にfinishReviewRun()していた分岐を、
// 「このroundの誤答（runnerState.reviewResults）から次roundのreviewGroupsを組み立て、
// 残っていれば次roundを自動開始する」よう拡張した（全問正解まで自動反復）。
// while文で同期的に周回するのではなく、既存の「1問ごとのUI操作→この関数が呼ばれる」
// イベント駆動の流れへ次roundの開始を1回差し込むだけで、無限走行のリスクを持たない
// （各roundは必ず生徒の実際の解答操作を経てから次roundへ進む）。
async function finishCurrentTestSetReviewGroupAndAdvance() {
  const reviewCorrect = state.quiz.retryMode ? state.quiz.firstRoundScore : state.quiz.score;
  const reviewTotal = state.quiz.retryMode ? state.quiz.firstRoundTotal : state.quiz.quizQuestions.length;
  // このreview Attempt自身の再誤答（＝「復習後も確認が必要」の正本、Phase3D-4A契約どおり）。
  const initialWrongQuestionIds = extractQuestionIds(state.quiz.wrongQuestions);
  recordCurrentReviewResult(reviewCorrect, reviewTotal, initialWrongQuestionIds);

  try {
    completeAttempt(currentDomainAttemptId, initialWrongQuestionIds);
  } catch (domainError) {
    console.error("completeAttempt error（TestSet復習フローには影響しません）:", domainError);
  }

  if (hasNextReviewGroup()) {
    advanceToNextReviewGroup();
    await startTestSetReviewGroup();
    return;
  }

  // Phase4E-1: このroundの全field完了。直前roundの誤答（reviewResults）だけから
  // 次roundのreviewGroupsを組み立てる（通常group結果=runnerState.resultsは一切参照しない、
  // 過去roundの上書きもしない）。誤答0のfieldは既存buildTestSetReviewGroups()の
  // 判定ロジックにより自動的に除外される（新しい判定基準を持ち込まない）。
  const nextReview = buildNextReviewGroupsFromCurrentResults();

  if (!nextReview.available || nextReview.groups.length === 0) {
    // 全field誤答0（全問正解）、または情報不明（旧Attempt混在等）の場合は、
    // 既存どおりTestSet全体を完了とする（Phase3D-4B-2と同じフォールバック方針）。
    //
    // Phase4E-2: このうち「全問正解（available===true かつ groups0件）」のときだけ、
    // 完了画面で「もう一度復習する」を選べるようにする。情報不明（available===false）は
    // 初回誤答集合を正確に特定できないため、従来どおり完了のみとする（安全側）。
    // snapshotはrunnerStateをresetするfinishReviewRun()より【前】に取得する。
    const masteredAll = nextReview.available && nextReview.groups.length === 0;
    const restartSnapshot = masteredAll ? getReviewRestartSnapshot() : null;
    const summary = finishReviewRun();
    showTestSetCompletion(tssElements, summary, buildReviewRestartOption(restartSnapshot));
    showTestSetStudentScreen(testSetStudentScreen, allScreens);
    return;
  }

  // Phase4E-1: 次roundを開始する前に、既存のpreflight検証（startTestSetRun/
  // 3D-4B-2のvalidateReviewGroups()）を必ず通す（部分実行を防ぐ、既存方針の踏襲）。
  const preflight = await validateReviewGroups(nextReview.groups, filterManager.getNormalizedQuestionsForSubject);

  if (!preflight.ok) {
    console.error("次roundの復習フェーズの開始に失敗（このroundまでの結果には影響しません）:", preflight.errorMessage);
    abortRun();
    goToTestSetStudentScreen();
    showTssError(tssElements.selectError, "間違い直しの問題を準備できませんでした。テスト対策画面からもう一度お試しください。");
    return;
  }

  // Phase4E-1: 次roundはbanner表示なし（review開始bannerは最初のround1のみ、
  // Phase3D-4B-2確定方針のまま。round2以降は自動遷移のみで、途中summaryも表示しない）。
  startNextReviewRound(nextReview.groups);
  await startTestSetReviewGroup();
}

// Phase4E-2: 完了画面の「もう一度復習する」へ渡すオプションを組み立てる。
// snapshotがnull（再復習できない）の場合はnullを返し、ボタン自体を表示させない。
function buildReviewRestartOption(restartSnapshot) {
  if (!restartSnapshot) return null;
  return { snapshot: restartSnapshot, onRestart: restartTestSetReview };
}

// Phase4E-2: 完了画面「もう一度復習する」の実処理。初回誤答集合（snapshot.reviewGroups、
// 最終roundの誤答集合ではない）で新しいreviewRoundの復習を開始する。runIdは維持したまま
// reviewRoundだけを単調増加させるため、既存のresume（runId+reviewRound厳密一致）・
// History/Weaknessの経路はいずれも無改修のまま通る。
//
// 開始前のpreflight検証（問題データの実在確認）は、既存のvalidateReviewGroups()を
// そのまま再利用する（round1開始時・round2以降の自動反復時と同じ検証、部分実行を防ぐ）。
// 連打対策はtest-set-student-controller.js側のボタンdisable＋処理中フラグで行う
// （既存handleStartRequest()と同じ方式）。
async function restartTestSetReview(restartSnapshot) {
  const preflight = await validateReviewGroups(
    restartSnapshot?.reviewGroups,
    filterManager.getNormalizedQuestionsForSubject
  );

  if (!preflight.ok) {
    console.error("再復習の開始に失敗（これまでの結果には影響しません）:", preflight.errorMessage);
    return { ok: false, errorMessage: "間違い直しの問題を準備できませんでした。テスト対策画面からもう一度お試しください。" };
  }

  const restarted = restartReviewFromSnapshot(restartSnapshot);
  if (!restarted.ok) {
    console.error("再復習の開始に失敗（これまでの結果には影響しません）:", restarted.errorMessage);
    return { ok: false, errorMessage: restarted.errorMessage };
  }

  await startTestSetReviewGroup();
  return { ok: true };
}

// Phase3D-4B-2: 復習開始案内（一度きり）。Attempt/progressは表示前に既に開始済みのため、
// このoverlayを閉じてもreview Attemptには一切影響しない。
function showReviewStartBanner(questionCount) {
  reviewStartBannerText.textContent = `全問題が終わりました。間違えた${questionCount}問を復習しましょう。`;
  reviewStartBanner.classList.remove("hidden");
}

function hideReviewStartBanner() {
  reviewStartBanner.classList.add("hidden");
}

// ---------------------------------------------------------------------------
// 暗記モード-1 STEP M1-3: memorize Round連鎖。
//
// TestSet復習ラウンド（finishCurrentTestSetReviewGroupAndAdvance/
// startTestSetReviewGroup、上記参照）と同じ設計方針を踏襲する：
// - Round進行の正本（runId/reviewRound/currentRound）はrunner
//   （features/memorize/memorize-runner.js）が持つ。app.js側で別カウンタを作らない。
// - 「このRoundの誤答・わからない集合」は既存state.quiz.wrongQuestions（M1-2の
//   applyAnswerResult()が isCorrect===false のときに積む既存ロジック、無変更）を
//   そのまま正本として使う。memorize専用の別収集経路を作らない。
// - 1 Round = 1 Attempt。次Round開始は既存beginAttemptAndShowQuiz()を再利用する
//   （新しいAttempt発行の仕組みを作らない）。
// - 0問Roundは開始しない（finishMemorizeRound()がcompleted:trueを返した時点で終了する）。
// - ホーム/対象選択UIからの入力経路はまだ無い（M1-3では未配線、後続STEPで接続する）。
// ---------------------------------------------------------------------------

/**
 * 暗記run全体（Round1）を開始する。
 *
 * @param {string} fieldId
 * @param {string[]} questionIds - Round1の対象questionId
 * @param {string} [unit]
 * @returns {Promise<{ok:true}|{ok:false, errorMessage:string}>}
 */
async function startMemorizeRunQuiz(fieldId, questionIds, unit = "") {
  const availableQuestions = await filterManager.getNormalizedQuestionsForSubject(fieldId);
  const resolved = resolveMemorizeQuestions(questionIds, availableQuestions);

  if (!resolved.ok) {
    console.error("startMemorizeRunQuiz: 開始できません（fail-closed）:", resolved.errorMessage);
    return { ok: false, errorMessage: resolved.errorMessage };
  }

  const started = startMemorizeRun({ fieldId, unit, questionIds });

  if (!started.ok) {
    console.error("startMemorizeRunQuiz: startMemorizeRun失敗:", started.errorMessage);
    return { ok: false, errorMessage: started.errorMessage };
  }

  await startMemorizeRoundQuiz(questionIds);
  return { ok: true };
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 現在時刻を日本標準時（Asia/Tokyo、UTC+9固定・DSTなし）基準の"YYYY-MM-DD"へ変換する。
 * features/memorize/配下のM3-2/M3-2B/M3-3のtoJstCalendarDate_と同一の変換ロジックだが、
 * それらは「与えられたUTC timestampを変換するだけ」のpure helperであり現在時刻を
 * 取得しない。現在時刻の取得自体（Date.now()）は、M3系pure moduleが一切行わない
 * 契約になっているため、この呼び出し境界（app.js）で1箇所だけ行う
 * （暗記モード-3 STEP M3-5）。
 *
 * @returns {string}
 */
function getJstTodayDateString_() {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, "0");
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
}

// 暗記モード-3 STEP M3-5: M3-4までで確定した「今日の長期復習対象」を、既存の
// 暗記モード実行系（Runner/Attempt/Progress/Resume/abandon）へ最小変更で接続する入口。
//
// 【設計方針（M3-5 Research / Design Gate確定）】
// - 呼び出しのたびに生徒の学習履歴（getStudentHistory）からfresh deriveする
//   （UIが以前表示したquestionIdsをキャッシュとして受け取らない。stale ID対策）。
// - due 0件ならunfinished Run確認ダイアログを一切出さずに終了する（無駄な確認を
//   避けるため、derive→due判定→unfinished gateの順で処理する）。
// - unfinished Run確認は既存confirmAndAbandonResumeBeforeNewAttempt()をそのまま
//   再利用する（sourceType/fieldIdを問わず、既存の「studentにつき未解決Attemptは
//   最大1件」という契約をそのまま踏襲し、独自のfield単位blockingを新設しない）。
// - 実際のRun開始は既存startMemorizeRunQuiz()をそのまま呼ぶ（新しいquestion解決・
//   Runner初期化・Attempt開始ロジックを作らない）。unitは常に空文字を渡す
//   （Today's Reviewは元のunit分割を横断するため特定のunitを持たない。
//   resolveUnitForSourceType()がsourceType!=="normal"のunitを常に空文字へ
//   正規化する既存契約により、実データへの影響は無い）。
//
// @param {string} fieldId
// @returns {Promise<{ok:true, status:"started", questionCount:number}
//   |{ok:true, status:"empty"}
//   |{ok:true, status:"cancelled"}
//   |{ok:false, errorMessage:string}>}
async function startTodaysMemorizeReview(fieldId) {
  const studentId = state.session.studentId;
  const trimmedFieldId = String(fieldId || "").trim();

  if (!studentId || !trimmedFieldId) {
    return { ok: false, errorMessage: "生徒または科目が選択されていません。" };
  }

  const today = getJstTodayDateString_();
  const history = getStudentHistory(studentId);

  const derived = deriveTodaysMemorizeReview({ studentId, fieldId: trimmedFieldId, history, today });

  if (!derived.ok) {
    console.error("startTodaysMemorizeReview: derive失敗（fail-closed）:", derived.errorMessage);
    return { ok: false, errorMessage: derived.errorMessage };
  }

  if (derived.questionIds.length === 0) {
    return { ok: true, status: "empty" };
  }

  return confirmAndAbandonResumeBeforeNewAttempt(
    async () => {
      const started = await startMemorizeRunQuiz(trimmedFieldId, derived.questionIds, "");
      if (!started.ok) {
        return { ok: false, errorMessage: started.errorMessage };
      }
      return { ok: true, status: "started", questionCount: derived.questionIds.length };
    },
    {
      cancelResult: { ok: true, status: "cancelled" },
      abandonFailResult: {
        ok: false,
        errorMessage: "前回の続きの削除に失敗しました。通信環境を確認して、もう一度お試しください。"
      }
    }
  );
}

/**
 * 現在の暗記run（既にactive）の、指定questionIdsによる1Round分のQuizを開始する。
 * runnerが既にactiveであることを前提とする（fieldId/unitはrunner stateから取得する）。
 *
 * @param {string[]} questionIds - このRoundの対象questionId
 */
async function startMemorizeRoundQuiz(questionIds) {
  const runnerState = getMemorizeRunnerState();
  const fieldId = runnerState.fieldId;

  const availableQuestions = await filterManager.getNormalizedQuestionsForSubject(fieldId);
  const resolved = resolveMemorizeQuestions(questionIds, availableQuestions);

  if (!resolved.ok) {
    // Round1開始時（startMemorizeRunQuiz）で既に検証済みのはずのため、通常到達しない
    // 安全側フォールバック。到達した場合はrunを中断する（0問・不正なRoundを開始しない）。
    console.error("startMemorizeRoundQuiz: 想定外のquestionId不整合のためrunを中断します（fail-closed）:", resolved.errorMessage);
    abortMemorizeRun();
    return;
  }

  state.session.subject = fieldId;
  state.session.unitFilter = "all";
  state.session.modeFilter = "all";
  state.session.subunitFilter = "all";
  state.session.requestedQuestionCount = resolved.questions.length;
  // 暗記モードは既存の「間違えた問題を最後にもう一度出す」機能を使わない
  // （Round自体がその役割を果たすため、既存testset/testset_reviewと同じ安全策）。
  state.session.retryWrongEnabled = false;

  resetQuizState(state);
  resetUiState(state);

  state.quiz.allQuestions = resolved.questions;
  // 暗記モード-1（M1-3修正）: pickQuestions()（シャッフル）を使わない。
  // Round順序の正本はrunner/selector（features/memorize/memorize-runner.js・
  // memorize-round-selector.js）が渡すquestionIdsの順序とする。resolveMemorizeQuestions()は
  // questionIdsの順序を保ったままQuestion objectへ解決するため、そのままの順序で表示する
  // （session-controller層でも再shuffleしない）。将来selectNextRoundQuestionIds()が
  // 出題順序自体を決定するようになった際に、この層でのshuffleがその責務分離を壊さないため。
  state.quiz.quizQuestions = [...resolved.questions];

  await beginAttemptAndShowQuiz("memorize", null, runnerState.unit);
}

// Round境界（最後の問題で「次へ」）は、次Round開始のためにawaitを挟む非同期処理
// （filterManager.getNormalizedQuestionsForSubject・beginAttemptAndShowQuiz）を経由するため、
// この間はstate.quiz.currentIndex/quizQuestions/wrongQuestionsがまだ前Roundの値のまま残る。
// そのため、goToNextQuestion()の既存currentIndexガードだけではRound境界の二重実行
// （連打・二重発火）を防げない。handleAnswer側のstate.ui.answeredと同じ「同期的に
// trueへ倒してから非同期処理に入る」方式の排他フラグで、finishMemorizeRound()の
// 二重実行・reviewRoundの飛び番を防ぐ。
let memorizeRoundTransitionInProgress = false;

/**
 * 現在Roundの結果を記録し、次Roundへ進めるか暗記完了かを判定する。
 * showFinalResult()からのみ呼ばれる。
 */
async function finishCurrentMemorizeRoundAndAdvance() {
  if (memorizeRoundTransitionInProgress) return;
  memorizeRoundTransitionInProgress = true;

  try {
    const wrongQuestionIds = extractQuestionIds(state.quiz.wrongQuestions);

    try {
      completeAttempt(currentDomainAttemptId, wrongQuestionIds);
    } catch (domainError) {
      console.error("completeAttempt error（暗記モードフローには影響しません）:", domainError);
    }

    const result = finishMemorizeRound({ wrongQuestionIds });

    if (!result.ok) {
      console.error("finishCurrentMemorizeRoundAndAdvance: finishMemorizeRound失敗:", result.errorMessage);
      return;
    }

    if (result.completed) {
      showMemorizeRunCompletion(result.summary);
      return;
    }

    await startMemorizeRoundQuiz(result.questionIds);
  } finally {
    memorizeRoundTransitionInProgress = false;
  }
}

/**
 * 暗記run完了時の最小表示。新しい画面遷移は行わず、既存quiz-screenのDOMを
 * 再利用して完了メッセージへ置き換える（今回大規模な結果画面は新設しない）。
 *
 * @param {Object} summary - finishMemorizeRound()のcompleted:true結果に含まれるsummary
 */
function showMemorizeRunCompletion(summary) {
  choicesContainer.innerHTML = "";
  choicesContainer.className = "choices";
  unknownAnswerButton.style.display = "none";
  nextButton.disabled = true;
  nextButton.style.display = "none";
  // 暗記モード-1 STEP M1-18: 完了メッセージへ既存の成功色（#answer-result.correct）を
  // そのまま流用する（新規CSS・新規classは追加しない）。resetQuestionArea()が既に
  // "correct"/"incorrect"の両方を無条件でremoveしているため、次の問題render時に
  // 自動的に解除される（追加の解除コードは不要）。
  answerResult.classList.remove("incorrect");
  answerResult.classList.add("correct");
  answerResult.style.color = "";
  answerResult.textContent =
    `暗記モード完了：全${summary.initialQuestionCount}問を習得しました（${summary.roundCount}周）。`;
  questionElements.questionText.textContent = "暗記モード：完了";
  // 暗記モード-1 STEP M1-18: 完了時点では直前Roundの「進行：N/N」「正解数：N」が
  // 残留し視覚的に紛らわしいため非表示にする（単元表示quizUnitは「何を暗記したか」の
  // 情報として維持するため変更しない）。resetQuestionArea()で必ず再表示へ戻す。
  quizProgress.style.display = "none";
  quizScore.style.display = "none";
}

// ---------------------------------------------------------------------------
// 暗記モード-1 STEP M1-4: AttemptProgressからのResume（内部機構）。
//
// 今回はホーム/start-screenの「続きから」導線への配線は行わない（既存resumeQuiz()の
// 分岐へ大きな変更を加えるリスクを避けるため、M1-4では内部機構までに留める）。
// この関数はgetAttemptProgress()が返すprogress（sourceType="memorize"のもの）を
// 直接受け取り、現在Roundの現在位置から再開する。
//
// 【重要な既存方針の踏襲】
// - 既存resumeQuiz()（通常学習/TestSet共通）と同じく、startAttemptForQuiz()は
//   一切呼ばない＝新しいAttemptId・startAttempt再送を行わない。既存attemptIdをそのまま使う
//   （Memorize-0本番検証で確認済み：同一attemptIdでstartAttemptを再送するとstartedAtが
//   上書きされてしまうため、再送は避ける）。
// - 現在問題のUI内部状態（「思い出した」後のchoice表示＝S1）は復元しない。
//   常にS0（想起ゲート）から再開する（そもそも「思い出した」押下だけではProgressを
//   保存していないため、S1の情報自体が存在しない＝自然にS0のみが復元対象になる）。
// - currentQuestionIndex === questionIds.length（Round内全問回答済みだが未完了）は、
//   既存resumeQuiz()と同じくgoToNextQuestion()の既存Round境界分岐へそのまま合流させる
//   （memorizeRoundTransitionInProgressガードにより二重complete化はしない）。
//
// @param {Object} progress - getAttemptProgress()が返すprogress部分
// @returns {Promise<{ok:true}|{ok:false, errorMessage:string}>}
async function resumeMemorizeRunQuiz(progress) {
  const attempt = loadAttempt(progress?.attemptId);
  const validation = validateMemorizeResumeProgress(progress, attempt);

  if (!validation.ok) {
    console.error("resumeMemorizeRunQuiz: 再開できません（fail-closed）:", validation.errorMessage);
    return { ok: false, errorMessage: validation.errorMessage };
  }

  const availableQuestions = await filterManager.getNormalizedQuestionsForSubject(progress.fieldId);
  const resolved = resolveMemorizeQuestions(progress.questionIds, availableQuestions);

  if (!resolved.ok) {
    console.error("resumeMemorizeRunQuiz: 問題の解決に失敗しました（fail-closed）:", resolved.errorMessage);
    return { ok: false, errorMessage: resolved.errorMessage };
  }

  const restored = restoreMemorizeRun({
    runId: progress.runId,
    reviewRound: progress.reviewRound,
    fieldId: progress.fieldId,
    unit: progress.unit || "",
    questionIds: progress.questionIds
  });

  if (!restored.ok) {
    console.error("resumeMemorizeRunQuiz: restoreMemorizeRun失敗:", restored.errorMessage);
    return { ok: false, errorMessage: restored.errorMessage };
  }

  const questionState = buildMemorizeResumeQuestionState(progress, resolved.questions);

  state.session.subject = progress.fieldId;
  state.session.unitFilter = "all";
  state.session.modeFilter = "all";
  state.session.subunitFilter = "all";
  state.session.requestedQuestionCount = questionState.quizQuestions.length;
  state.session.retryWrongEnabled = false;

  resetQuizState(state);
  resetUiState(state);

  state.quiz.allQuestions = resolved.questions;
  state.quiz.quizQuestions = questionState.quizQuestions;
  state.quiz.currentIndex = questionState.currentIndex;
  state.quiz.wrongQuestions = questionState.wrongQuestions;

  // 既存Attemptをそのまま再利用する（startAttemptForQuiz/createAttemptは呼ばない）。
  currentDomainAttemptId = progress.attemptId;
  restoreAttemptProgressContext(progress);

  showQuizScreen(quizScreen, allScreens);

  if (state.quiz.currentIndex >= state.quiz.quizQuestions.length) {
    // 全問回答済みだがRound未完了のまま再起動されたケース。
    // 既存goToNextQuestion()のRound境界分岐へそのまま合流させる。
    goToNextQuestion();
  } else {
    await renderQuestion();
  }

  return { ok: true };
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
  // Task56: TestSet実行中にQuiz画面から離脱した場合、通常学習のstart-screenではなく
  // 「学校のテスト対策」画面へ戻す。abortRun()を先に呼ぶとisRunnerActive()が
  // falseになり判定できなくなるため、判定結果を先に保持しておく。
  const wasTestSetRun = isRunnerActive();

  if (wasTestSetRun) {
    abortRun();
  }

  // 暗記モード-1 STEP M1-20: 未完了memorize Runから離脱する場合も、TestSet runnerと
  // 同じ責務でローカルRunnerだけを終了する（Attempt/AttemptProgressは変更しない、
  // 中断であり破棄ではない。M1-19確定方針）。TestSet runnerとmemorize runnerは
  // 同時にactiveにならないため、wasTestSetRunの判定とは独立して行ってよい。
  if (isMemorizeRunnerActive()) {
    abortMemorizeRun();
  }

  if (wasTestSetRun) {
    // 既存のgoToTestSetStudentScreen()をそのまま再利用する（studentIdガード込み）。
    // initTestSetStudentScreen()が呼ばれるため、school/grade選択・currentIndex・
    // 復習状態等のtssState/runner stateは残らず、次回開始時は必ずphy_001から
    // 新規開始できる（誤操作防止のため毎回リセットする既存方針、Task54と同じ）。
    //
    // UI改善: 「テスト対策へ戻る」はabandonAttemptProgressを呼ばない中断であり、
    // サーバー側progressはin_progressのまま残る（STEP14）。この直後にTestSet画面へ
    // 戻ってきた場合、更新済みのcurrentQuestionIndexで再度「前回の続きから」を
    // 表示できるよう、backToStart()の通常quiz分岐と同じくresume候補を取り直す。
    hideResumeCandidate();
    fetchResumeCandidateForStartScreen();
    goToTestSetStudentScreen();
    return;
  }

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

  // STEP18: 中断（このbackToStart自体、既存どおりcompleteAttempt/abandonAttemptProgressは
  // 呼ばない）直後に再び開始画面へ戻ってきた場合も、goToStartScreenFromHomeと同じく
  // resume候補を取り直す（resume済みセッションをさらに中断した場合に、新しい
  // currentQuestionIndexで再度resume表示できるようにするため）。
  hideResumeCandidate();
  fetchResumeCandidateForStartScreen();
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

  // 生徒切替時は前の生徒のresume候補表示を即座にクリアする
  // （Home「苦手を復習」「復習する」はstart-screenを経由しないため、resume候補は
  // start-screen訪問を待たずここで取得しておく必要がある、STEP7）。
  hideResumeCandidate();

  // Phase5-4: 現在のMemoryStorage内容でHomeを即座に表示した後、裏で学習記録GASから
  // 過去のAttempt/AnswerRecordを取得しMemoryStorageへ復元する（fire-and-forget、
  // ここではawaitしない）。復元完了時に生徒が切り替わっていた場合、古い生徒のデータで
  // 現在のHome表示を上書きしないよう、再描画前に選択中studentIdの一致を確認する。
  const restoringStudentId = state.session.studentId;
  restoreStudentLearningRecords(restoringStudentId).then((result) => {
    if (result.ok && state.session.studentId === restoringStudentId) {
      renderHomeForStudent(state.session.studentId, homeElements, homePracticeCallbacks);
    }
    // STEP7: resume候補の判定(loadAttempt存在チェック、fetchResumeCandidateForStartScreen内)は
    // restoreStudentLearningRecordsによるAttempt Repository復元が終わった後でないと
    // 正しく行えないため、成否に関わらずこの直後に呼ぶ（内部でstudentId一致を再確認する）。
    fetchResumeCandidateForStartScreen();
  });
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

  // Phase4B-1: 共用タブレット運用のため、生徒切替のたびに問題数選択を既定値（20問）へ
  // 戻す（前の生徒が選んだ100問等を、そのまま次の生徒が引き継がないようにするため）。
  // 同じ生徒がquiz画面から「開始画面へ戻る」場合（backToStart()）はリセットしない。
  questionCountSelect.value = "20";

  syncStartScreenStudentDisplay();
  showStartScreen(startScreen, allScreens);

  // STEP7: studentId確定・開始画面表示のタイミングでresume候補を取得する
  // （studentId不明時はfetchResumeCandidateForStartScreen自体が何もしない）。
  hideResumeCandidate();
  fetchResumeCandidateForStartScreen();
}

// STEP7/STEP8: 開始画面表示のたびに、その時点で選択中のstudentIdについて
// resume候補（getAttemptProgress）を取得する。生徒切替race対策として、
// 発行時のrequestId・studentIdが取得完了時点でも最新であることを確認してから
// 反映する（Phase5-4のrestoringStudentId確認と同じ考え方）。
async function fetchResumeCandidateForStartScreen() {
  const studentId = state.session.studentId;
  if (!studentId) return;

  const requestId = ++resumeCandidateRequestId;

  let result;
  try {
    result = await getAttemptProgress(studentId);
  } catch (error) {
    // STEP37: 取得失敗時もアプリ全体・新規開始は通常どおり利用可能なままにする。
    console.error("getAttemptProgress error（開始画面は通常どおり利用できます）:", error);
    return;
  }

  if (requestId !== resumeCandidateRequestId || state.session.studentId !== studentId) {
    return; // このリクエストは既に古い（生徒切替後）ため破棄する
  }

  if (!result.progress) {
    hideResumeCandidate();
    return;
  }

  // 復元先AttemptがRepositoryに存在しない場合（restoreStudentLearningRecords失敗等）は
  // resumeを提示しない（completeAttempt等が後で失敗する不整合な状態を避けるため）。
  if (!loadAttempt(result.progress.attemptId)) {
    console.error(
      "getAttemptProgressの再開候補に対応するAttemptがRepositoryに見つかりません（resumeを表示しません）:",
      result.progress.attemptId
    );
    hideResumeCandidate();
    return;
  }

  showResumeCandidate(result.progress);
}

// STEP5/6/10/11/12: resume候補の表示。内部値（sourceType/testSetId等）は表示せず、
// 既存SUBJECT_CONFIGのlabelのみを使う（新しいlabel mapは作らない）。
// sourceType==="testset"のcandidateはstart-screenではなくTestSet画面側へのみ出す
// （同じcandidateを複数画面へ常時表示しないため、STEP6）。
function showResumeCandidate(progress) {
  resumeCandidate = progress;
  resumeProgressBlock.classList.add("hidden");
  tssResumeBlock.classList.add("hidden");

  if (progress.sourceType === "testset") {
    showTestSetResumeCandidate(progress);
    return;
  }

  // Phase3D-4B-3: testset_reviewは通常testsetと同じ「TestSet由来」だが、resume処理は
  // 別物（restoreRunnerStateではなくrestoreReviewRunnerStateを使う）ため専用分岐とする
  // （sourceType==="testset" || sourceType==="testset_review" への機械的な一括統合は行わない、
  // Phase3D-4B設計監査STEP207/386の結論どおり）。
  if (progress.sourceType === "testset_review") {
    showTestSetReviewResumeCandidate(progress);
    return;
  }

  // 暗記モード-1（M1-4B）: memorizeは既存start-screenの「続きから」パネル
  // （#resume-progress、既存の汎用DOM/CSSをそのまま再利用）に表示する。
  // TestSet系と異なり専用runner画面を持たないため、testset/testset_reviewと同じ
  // 「専用パネルへ切り替える」方式ではなく、文言だけを暗記モード向けに調整する。
  if (progress.sourceType === "memorize") {
    const subjectLabel = SUBJECT_CONFIG[progress.fieldId]?.label || progress.fieldId;
    resumeProgressText.textContent = `暗記モードの続き：${subjectLabel}（Round ${progress.reviewRound}）`;

    resumeProgressError.textContent = "";
    closeGlobalConfirm();
    resumeProgressBlock.classList.remove("hidden");
    return;
  }

  const subjectLabel = SUBJECT_CONFIG[progress.fieldId]?.label || progress.fieldId;
  const unitLabel = progress.unit && progress.unit !== "all" ? ` / ${progress.unit}` : "";
  resumeProgressText.textContent = `前回の続き：${subjectLabel}${unitLabel}`;

  resumeProgressError.textContent = "";
  closeGlobalConfirm();
  resumeProgressBlock.classList.remove("hidden");
}

// STEP5/7: TestSet専用のresume候補表示。TestSet名の解決には、resumeQuiz()のTestSet
// resumeで既に使っているloadTestSet()をそのまま再利用する（新規API追加なし）。
// 名称取得に失敗しても、続きから/この続きはやめる自体は利用可能なままにする。
async function showTestSetResumeCandidate(progress) {
  tssResumeError.textContent = "";
  tssResumeText.textContent = "前回のテスト対策の続き";
  closeGlobalConfirm();
  tssResumeBlock.classList.remove("hidden");

  if (!progress.testSetId) return;

  try {
    const { testSet } = await loadTestSet(progress.testSetId);
    // 表示準備中にresumeCandidateが差し替わっていた場合（生徒切替・discard等）は上書きしない。
    if (resumeCandidate === progress && testSet?.label) {
      tssResumeText.textContent = `前回の続き：${testSet.label}`;
    }
  } catch (error) {
    console.error("loadTestSet error（TestSet名の表示のみ失敗、resumeボタン自体は利用可能です）:", error);
  }
}

// Phase3D-4B-3: testset_review専用のresume候補表示。既存showTestSetResumeCandidate()と
// 同じ#tss-resume-progressを再利用し（新しいresume panelを増やさない）、文言のみ
// 「間違い直しの続き」に変える。TestSet名の解決はloadTestSet()を同様に再利用する。
async function showTestSetReviewResumeCandidate(progress) {
  tssResumeError.textContent = "";
  tssResumeText.textContent = "前回の間違い直しの続き";
  closeGlobalConfirm();
  tssResumeBlock.classList.remove("hidden");

  if (!progress.testSetId) return;

  try {
    const { testSet } = await loadTestSet(progress.testSetId);
    if (resumeCandidate === progress && testSet?.label) {
      tssResumeText.textContent = `${testSet.label} の間違い直しの続き`;
    }
  } catch (error) {
    console.error("loadTestSet error（TestSet名の表示のみ失敗、resumeボタン自体は利用可能です）:", error);
  }
}

function hideResumeCandidate() {
  resumeCandidate = null;
  resumeProgressBlock.classList.add("hidden");
  tssResumeBlock.classList.add("hidden");
  closeGlobalConfirm();
  resumeProgressError.textContent = "";
  tssResumeError.textContent = "";
}

// STEP4/14/15: 画面非依存の共通確認モーダル（resume discard・新規開始競合の両方で使う、複製しない）。
function openGlobalConfirm(text, onYes, onCancel = () => {}) {
  globalConfirmError.textContent = "";
  globalConfirmText.textContent = text;
  globalConfirmYesAction = onYes;
  globalConfirmCancelAction = onCancel;
  globalConfirmModal.classList.remove("hidden");
}

function closeGlobalConfirm() {
  globalConfirmModal.classList.add("hidden");
  globalConfirmYesAction = null;
  globalConfirmCancelAction = null;
  globalConfirmError.textContent = "";
}

// STEP39/40: 連打対策（処理中はボタンをdisabledにする）。
async function handleGlobalConfirmYesClick() {
  const action = globalConfirmYesAction;
  if (!action) return;

  globalConfirmYesButton.disabled = true;
  globalConfirmCancelButton.disabled = true;
  try {
    await action();
  } finally {
    globalConfirmYesButton.disabled = false;
    globalConfirmCancelButton.disabled = false;
  }
}

function handleGlobalConfirmCancelClick() {
  const onCancel = globalConfirmCancelAction;
  closeGlobalConfirm();
  onCancel();
}

// start-screen・TestSet画面のどちらの「この続きはやめる」からも共通で使う
// （STEP9、abandonAttemptProgress経路は複製しない）。errorElementだけ呼び出し元で切り替える。
function performResumeDiscard(errorElement) {
  if (!resumeCandidate) return;

  const candidateAttemptId = resumeCandidate.attemptId;
  openGlobalConfirm("前回の続きからは再開できなくなります。よろしいですか？", async () => {
    try {
      await abandonAttemptProgress(candidateAttemptId);
    } catch (error) {
      // STEP16: 失敗時は候補を消したことにしない。
      console.error("abandonAttemptProgress error:", error);
      errorElement.textContent = "削除に失敗しました。通信環境を確認して、もう一度お試しください。";
      return;
    }
    closeGlobalConfirm();
    hideResumeCandidate();
  });
}

function handleResumeDiscardClick() {
  performResumeDiscard(resumeProgressError);
}

function handleTestSetResumeDiscardClick() {
  performResumeDiscard(tssResumeError);
}

// start-screen・TestSet画面のどちらの「続きから」からも共通で使う
// （STEP8、resumeQuiz()経路は複製しない）。連打対策のdisable対象ボタンだけ呼び出し元で切り替える。
async function performResumeContinue(buttonsToDisable) {
  if (!resumeCandidate) return;

  buttonsToDisable.forEach((button) => { button.disabled = true; });
  try {
    // 暗記モード-1（M1-4B）: sourceType==="memorize"だけ、M1-4で完成済みの
    // resumeMemorizeRunQuiz()へ振り分ける（既存resumeQuiz()の内部分岐は一切変更しない）。
    // validation失敗時も既存resumeQuiz()失敗時と同じ規約（該当エラー要素へ表示、
    // 画面遷移なし、「この続きはやめる」は引き続き利用可能）に合わせる。
    // 失敗時に既存resumeQuiz()へフォールバックすることは絶対にしない
    // （sourceTypeの異なるResume処理へ誤って流さないため）。
    if (resumeCandidate.sourceType === "memorize") {
      const result = await resumeMemorizeRunQuiz(resumeCandidate);
      if (!result.ok) {
        getResumeErrorElement(resumeCandidate).textContent =
          result.errorMessage || "前回の暗記モードの続きを再開できませんでした。";
        return;
      }
      hideResumeCandidate();
      return;
    }

    await resumeQuiz(resumeCandidate);
  } finally {
    buttonsToDisable.forEach((button) => { button.disabled = false; });
  }
}

async function handleResumeContinueClick() {
  await performResumeContinue([resumeContinueButton, resumeDiscardButton]);
}

async function handleTestSetResumeContinueClick() {
  await performResumeContinue([tssResumeContinueButton, tssResumeDiscardButton]);
}

// Phase3D-4B-3: resume候補の表示先（#resume-progress / #tss-resume-progress）に応じて、
// エラー表示先も揃える。testset/testset_reviewはいずれも#tss-resume-progress側にのみ
// 候補が出るため、そちらのエラー要素へ表示する（従来のtestsetブランチがresumeProgressError
// （start-screen側、表示されない）へ書いていた既存の表示不備も、この判定を共通化することで
// 合わせて解消する）。
function getResumeErrorElement(progress) {
  return progress?.sourceType === "testset" || progress?.sourceType === "testset_review"
    ? tssResumeError
    : resumeProgressError;
}

// STEP20-STEP36: 「続きから」本体。新規Attempt/QuestionSetは一切生成せず、
// progress.attemptIdをそのまま使い回す。questionIds/wrongQuestionIdsの再抽選・
// 再shuffleは行わない（core/quiz-controller.jsのprepareResumedQuiz参照）。
async function resumeQuiz(progress) {
  const resumeErrorElement = getResumeErrorElement(progress);
  resumeProgressError.textContent = "";
  tssResumeError.textContent = "";
  startError.textContent = "";

  const questions = await filterManager.getNormalizedQuestionsForSubject(progress.fieldId);
  const answerRecords = loadAnswerRecordsByAttempt(progress.attemptId);

  // STEP33: TestSet resumeは、既存loadTestSet()と、生徒選択時に既に復元済みの
  // Attempt一覧からrunnerStateを再構築してから、通常のprepareResumedQuizへ合流する。
  if (progress.sourceType === "testset") {
    let testSetData;
    try {
      testSetData = await loadTestSet(progress.testSetId);
    } catch (error) {
      console.error("loadTestSet error（resume不可）:", error);
      resumeErrorElement.textContent =
        "前回の続き（テスト対策）のデータ取得に失敗しました。通信環境を確認して、もう一度お試しください。";
      return;
    }

    const priorAttempts = loadAttemptsByStudent(state.session.studentId);
    const runnerResult = restoreRunnerState({
      testSet: testSetData.testSet,
      questions: testSetData.questions,
      resumeFieldId: progress.fieldId,
      priorAttempts,
      // Phase4E-0A: progress.runIdが空（旧データ・本番GAS未反映）の場合はrestoreRunnerState内で
      // fail-closedとなり、completedAtでの推測復元へは一切フォールバックしない。
      runId: progress.runId,
      studentId: state.session.studentId
    });

    if (!runnerResult.ok) {
      resumeErrorElement.textContent = runnerResult.errorMessage;
      return;
    }
  } else if (progress.sourceType === "testset_review") {
    // Phase3D-4B-3: review resumeは既存restoreRunnerStateを使わず、専用のpure検証関数
    // （prepareTestSetReviewResumePlan、features/test-set-runner/test-set-review-resume.js）で
    // 通常group結果の復元・reviewGroups再生成・progressとの照合・過去run混入抑制まで
    // 完全に検証してから、restoreReviewRunnerStateで一括してrunnerStateへ反映する
    // （検証途中で失敗した場合、runnerStateには一切触れない＝half-restored stateを作らない）。
    let testSetData;
    try {
      testSetData = await loadTestSet(progress.testSetId);
    } catch (error) {
      console.error("loadTestSet error（resume不可）:", error);
      resumeErrorElement.textContent =
        "前回の間違い直しの続きのデータ取得に失敗しました。通信環境を確認して、もう一度お試しください。";
      return;
    }

    const priorAttempts = loadAttemptsByStudent(state.session.studentId);
    const plan = prepareTestSetReviewResumePlan({
      testSet: testSetData.testSet,
      questions: testSetData.questions,
      progress,
      priorAttempts
    });

    if (!plan.ok) {
      resumeErrorElement.textContent = plan.errorMessage;
      return;
    }

    restoreReviewRunnerState(plan.runnerData);
  }

  const result = prepareResumedQuiz({ state, questions, progress, answerRecords });
  if (!result.ok) {
    // STEP21: questionId欠落・境界不正時はresumeを開始しない
    // （「この続きはやめる」は引き続き利用可能なまま）。
    resumeErrorElement.textContent = result.errorMessage;
    return;
  }

  currentDomainAttemptId = progress.attemptId;
  restoreAttemptProgressContext(progress);

  // 学習記録GASのstartAttempt契約にはtotalCountが含まれない（gas-api-contract-v1.md §5.1）ため、
  // 復元直後のAttempt.totalCountは常に未確定(0)のままになる（非resumeの通常フローでは、
  // Attemptオブジェクトが生成時からページ内に残り続けるため顕在化しなかった問題）。
  // completeAttempt()が誤ったtotalCount=0を送信しないよう、progress.questionIds（開始時点の
  // 出題数、resumeでも再抽選しない値）から復元する。将来GAS側がtotalCountを返すようになった
  // 場合に備え、既に正しい値が入っている場合は上書きしない。
  const restoredAttempt = loadAttempt(progress.attemptId);
  if (restoredAttempt && !restoredAttempt.totalCount) {
    saveAttempt({ ...restoredAttempt, totalCount: progress.questionIds.length });
  }

  hideResumeCandidate();

  backToStartButton.textContent = isRunnerActive() ? "テスト対策へ戻る" : "開始画面へ戻る";
  showQuizScreen(quizScreen, allScreens);

  // STEP22: currentQuestionIndex===配列長（全問回答済み・次状態遷移直前）の場合は、
  // 既存goToNextQuestion()の境界判定（retry突入 or 終了）へそのまま委ねる
  // （新しい分岐を作らず、既存ロジックを完全に再利用する）。
  if (state.quiz.currentIndex >= state.quiz.quizQuestions.length) {
    goToNextQuestion();
  } else {
    await renderQuestion();
  }
}

// Phase5-1: 各画面から「ホームへ戻る」際に、Home画面の統計表示（学習履歴・苦手問題数等）を
// 最新化してから遷移する統一関数。renderHomeForStudentは同期・MemoryStorageのみ参照で
// GAS通信を行わないため（Phase5-0確定の永続化設計どおり、home-renderer.js/home-service.js
// 側は無変更）、無条件に呼び直してもGAS通信は増えない。studentId未選択時は
// renderHomeForStudentを呼ばず、既存のHome未選択状態表示（showHomeEmptyState）をそのまま
// 維持する（renderHomeForStudent自体も空文字列で同じ分岐を持つが、ここでは呼び出し自体を
// 省略し、意図を明確にする）。
function returnToHome() {
  if (state.session.studentId) {
    renderHomeForStudent(state.session.studentId, homeElements, homePracticeCallbacks);
  }
  showHomeScreen(homeScreen, allScreens);
}

// Phase2 Task23-4: ホーム画面の「学習履歴を見る」から、history-screenへ遷移する。
// state.session.studentId をそのまま使う（新しいstudentId用のstate・localStorage・
// sessionStorageは作らない）。描画自体はhistory-renderer.jsに委ねる（app.jsは
// 呼び出すだけで、履歴集計・DOM生成は一切行わない）。
function goToHistoryScreen() {
  if (!state.session.studentId) return;

  renderHistoryForStudent(
    state.session.studentId,
    historyElements,
    handleHistoryRetryClick,
    handleHistoryRetryWrongClick,
    handleHistoryDetailClick
  );
  showHistoryScreen(historyScreen, allScreens);
}

// Phase3D-3: 学習履歴「詳細」画面から戻る。history-screenは非表示中もDOM上に残ったまま
// （core/screen-controller.jsのdisplay:none/block切り替えのみ、要素は破棄されない）ため、
// 履歴一覧を再取得・再描画しない（追加監査D/E：スクロール位置・DOMともに自然に保持される）。
// Phase4C-1: 戻り先はhistoryDetailReturnTargetで分岐する（Home起点なら「ホームへ戻る」、
// 履歴一覧起点なら従来どおり「学習履歴へ戻る」）。大規模なnavigation historyは持たず、
// 直近の遷移元1件のみを覚える最小限の状態にとどめる。
let historyDetailReturnTarget = "history";

function returnFromHistoryDetail() {
  if (historyDetailReturnTarget === "home") {
    returnToHome();
    return;
  }
  showHistoryScreen(historyScreen, allScreens);
}

// Phase3D-3: 学習履歴「詳細」。二重押し防止のための簡易な再入防止フラグ
// （3D-1/3D-2のhistoryRetryInProgressとは別。詳細表示は新Attemptを作らない読み取り専用の
// ため、共有ガードを再利用する必要はない）。Phase4C-1でHome起点の入口が増えても、
// この1つのフラグをそのまま共有する（読み取り専用処理という性質は入口が増えても変わらない）。
let historyDetailLoadInProgress = false;

async function showHistoryDetailForEntry(entry) {
  if (historyDetailLoadInProgress) return;
  historyDetailLoadInProgress = true;

  try {
    const viewModel = await getHistoryDetailViewModel(entry);
    renderHistoryDetailScreen(viewModel, historyDetailElements);
    renderHistoryDetailRetryActions(entry, historyDetailElements, {
      onRetryAttempt: handleHistoryDetailRetryAttempt,
      onRetryWrongAttempt: handleHistoryDetailRetryWrongAttempt
    });
    showHistoryDetailScreen(historyDetailScreen, allScreens);
  } catch (error) {
    console.error("学習履歴の詳細取得でエラーが発生しました（既存の履歴表示には影響しません）:", error);
    showHistoryDetailError(historyDetailElements, "この学習履歴の詳細を表示できませんでした。");
    renderHistoryDetailRetryActions(null, historyDetailElements);
    showHistoryDetailScreen(historyDetailScreen, allScreens);
  } finally {
    historyDetailLoadInProgress = false;
  }
}

// Phase4C-2: detail画面内の再挑戦ボタン押下時の入口。entryはrenderHistoryDetailRetryActions()が
// このdetail表示時点で解決済みのものをそのまま受け取るだけで、ここで再取得・再判定はしない
// （home-renderer.jsの4C-1「前回学習」カードと同じ構造）。押下時点でstudentIdが表示時と
// 一致しない場合（理論上は生徒切替がdetail画面を離れずには起こり得ないが、念のための防御）は
// 何もしない。実処理は既存3D-1/3D-2ハンドラへ丸ごと委譲し、エラー表示先のみdetail画面側
// （historyDetailError）に差し替える（history-screen側のhistoryErrorは非表示中で見えないため）。
function handleHistoryDetailRetryAttempt(entry) {
  if (!entry?.attempt || entry.attempt.studentId !== state.session.studentId) return;
  return handleHistoryRetryClick(entry, { errorTarget: historyDetailError });
}

function handleHistoryDetailRetryWrongAttempt(entry) {
  if (!entry?.attempt || entry.attempt.studentId !== state.session.studentId) return;
  return handleHistoryRetryWrongClick(entry, { errorTarget: historyDetailError });
}

// Phase3D-3: 学習履歴一覧（history-screen）から「詳細」を押した場合の入口。
function handleHistoryDetailClick(entry) {
  historyDetailReturnTarget = "history";
  return showHistoryDetailForEntry(entry);
}

// Phase4C-1: ホーム「前回学習」カードを押した場合の入口。history-detail-model/service/
// rendererはPhase3D-3のものをそのまま再利用し、home専用のdetail資産は一切作らない。
// entryはhome-renderer.js側でHome描画時に既に解決済み（getLatestCompletedAttempt由来）の
// ものをそのまま受け取るだけで、ここで再取得・再判定はしない。
function handleHomeLatestStudyClick(entry) {
  historyDetailReturnTarget = "home";
  return showHistoryDetailForEntry(entry);
}

// Phase4D-1+2: ホーム「苦手問題」カードから、苦手問題一覧画面（weakness-screen）へ遷移する。
// WeaknessServiceの取得自体は同期処理だが、questionIdから現在の問題マスタを解決する部分
// （features/history/history-detail-service.jsのloadQuestionMapForFieldをそのまま再利用）が
// CSV読込を伴う非同期処理のため、fetchResumeCandidateForStartScreen()と同じ
// requestId + studentId二重チェックで、取得中に生徒が切り替わった場合の誤描画を防ぐ
// （Phase4D-3で追加した「この1問を解く」「まとめて解く」の実際のAttempt開始処理は
// handleWeaknessFieldGroupPracticeClick()/handleWeaknessSingleQuestionPracticeClick()側の
// 責務で、この一覧取得処理自体は引き続き読み取り専用）。
let weaknessListRequestId = 0;

async function goToWeaknessScreen() {
  if (!state.session.studentId) return;

  const studentId = state.session.studentId;
  const requestId = ++weaknessListRequestId;

  try {
    const viewModel = await getWeaknessListViewModel(studentId);
    if (requestId !== weaknessListRequestId || state.session.studentId !== studentId) return;

    renderWeaknessListScreen(viewModel, weaknessElements, handleWeaknessDetailClick, handleWeaknessFieldGroupPracticeClick);
    showWeaknessScreen(weaknessScreen, allScreens);
  } catch (error) {
    console.error("苦手問題一覧の取得でエラーが発生しました（既存のHome表示には影響しません）:", error);
    if (requestId !== weaknessListRequestId || state.session.studentId !== studentId) return;

    showWeaknessListError(weaknessElements, "苦手問題の取得に失敗しました。時間をおいて再度お試しください。");
    showWeaknessScreen(weaknessScreen, allScreens);
  }
}

// Phase4D-1+2: 苦手一覧のcard押下時。itemはweakness-list-renderer.js側で描画時に
// 既に解決済み（questionまで解決済み）のものをそのまま受け取るだけで、ここで
// WeaknessServiceの再呼び出し・questionIdの再検索は行わない（4C-1/4C-2と同じ設計）。
// 同期処理のみのため、非同期の競合ガードは不要。
//
// Phase4D-3: 「この1問を解く」ボタンのコールバックをここでitemをclosureに閉じ込めて渡す。
// WeaknessDetailViewModelにはunitが無いため（Phase4D-1+2の正本view model契約は変更しない）、
// unitを含む元のWeaknessListItem（item）をそのまま渡すことでこのgapを吸収する
// （view modelへ新しいfieldを追加しない、という最小差分の判断）。
function handleWeaknessDetailClick(item) {
  try {
    const viewModel = buildWeaknessDetailViewModel(item);
    renderWeaknessDetailScreen(viewModel, weaknessDetailElements, () => handleWeaknessSingleQuestionPracticeClick(item));
  } catch (error) {
    console.error("苦手問題の詳細表示でエラーが発生しました（既存の一覧表示には影響しません）:", error);
    showWeaknessDetailError(weaknessDetailElements, "この問題の詳細を表示できませんでした。");
  }
  showWeaknessDetailScreen(weaknessDetailScreen, allScreens);
}

// Phase4D-3: 苦手一覧「まとめて解く」・詳細「この1問を解く」共通の二重押し防止フラグ。
// 学習履歴画面専用のhistoryRetryInProgressとは無関係な画面同士のため共有しない
// （片方の処理中にもう一方の無関係な画面がブロックされるのを避ける、新しい単一目的の
// ガードを1つだけ追加する）。
let weaknessPracticeStartInProgress = false;

// Phase4D-3: 苦手一覧「まとめて解く」（科目groupごと）。既存のstartWeaknessReview()
// （Home「苦手を復習」と完全に同一の処理: startPracticeSession(fieldId,"weak")→
// sourceType=weak_review、confirmAndAbandonResumeBeforeNewAttempt経由）をそのまま呼ぶだけで、
// 新しいbuilder・新しいsourceTypeは一切作らない。エラー表示先のみweaknessErrorへ差し替える
// （Phase4C-2のerrorTargetパターンを踏襲、historyErrorへは漏らさない）。
async function handleWeaknessFieldGroupPracticeClick(fieldId) {
  if (weaknessPracticeStartInProgress) return;
  weaknessPracticeStartInProgress = true;

  try {
    await startWeaknessReview(fieldId, { errorTarget: weaknessError });
  } finally {
    weaknessPracticeStartInProgress = false;
  }
}

// Phase4D-3: 苦手詳細「この1問を解く」。itemはhandleWeaknessDetailClick()が描画時点で
// 既に解決済みのWeaknessListItemをclosure経由でそのまま受け取るだけで、questionIdの
// 再検索・WeaknessServiceの再呼び出しは行わない。仮のAttemptは作らず、3D-1/3D-2と同じ
// assembleFixedQuestionSession()の延長（prepareFixedSingleQuestionSession()）のみを使う。
async function handleWeaknessSingleQuestionPracticeClick(item) {
  if (!item || !item.available) return;
  if (weaknessPracticeStartInProgress) return;
  weaknessPracticeStartInProgress = true;
  weaknessDetailError.textContent = "";

  try {
    const questions = await filterManager.getNormalizedQuestionsForSubject(item.fieldId);
    const prepared = prepareFixedSingleQuestionSession({
      state,
      questions,
      questionId: item.questionId,
      fieldId: item.fieldId,
      unit: item.unit
    });

    if (!prepared.ok) {
      weaknessDetailError.textContent = prepared.errorMessage;
      return;
    }

    // Phase3C: 3D-1/3D-2と同じ既存の共通ガードをそのまま再利用する（複製しない）。
    // sourceTypeは新しいAttemptの起点として固定値"weak_review"を使う（元Attemptの
    // 引き継ぎではない。この1問には元Attemptが存在しないため）。
    await confirmAndAbandonResumeBeforeNewAttempt(() =>
      beginAttemptAndShowQuiz("weak_review", null, prepared.unit)
    );
  } catch (error) {
    console.error("苦手問題「この1問を解く」の開始準備でエラーが発生しました（既存の詳細表示には影響しません）:", error);
    weaknessDetailError.textContent = "この問題は現在やり直せません。";
  } finally {
    weaknessPracticeStartInProgress = false;
  }
}

// Phase4D-1+2: 苦手問題一覧・詳細の「戻る」。origin分岐は不要（Home→一覧→Home、
// 一覧→詳細→一覧の1経路ずつのみ、4C-1のようなHome/History二方向の入口は無いため）。
// weakness-screenは非表示中もDOM上に残ったまま（screen-controller.jsのactive切替のみ）の
// ため、詳細から一覧へ戻る際に一覧を再取得・再描画しない（history-screenと同じ既存方針）。
function returnFromWeaknessScreen() {
  returnToHome();
}

function returnFromWeaknessDetail() {
  showWeaknessScreen(weaknessScreen, allScreens);
}

// Phase3D-1: 学習履歴「もう一度やる」。二重押し防止のための簡易な再入防止フラグ
// （履歴カードは最大5件のみのため、個別ボタンのdisabled管理までは行わない）。
let historyRetryInProgress = false;

// STEP38の処理順を守る: 履歴item検証(questionIds復元・fieldId/unit確認含む)→開始可能確定→
// resume競合confirm→必要ならabandon→新Attempt開始。無効な履歴の再挑戦のために、
// 有効なresume候補を先に破棄しないよう、検証は競合ガードより必ず前に行う。
//
// Phase4C-2: errorTargetはエラー文言の表示先（既定はhistoryError＝history-screen側）。
// history-detail-screenから呼ばれる場合、history-screenは非表示中のためhistoryErrorへ
// 書いても利用者に見えない。retryロジック自体は複製せず、表示先のみを呼び出し元から
// 差し替え可能にする最小限の変更（呼び出し元＝app.js内、公開APIの形は変えない）。
async function handleHistoryRetryClick(entry, { errorTarget = historyError } = {}) {
  if (historyRetryInProgress) return;
  historyRetryInProgress = true;
  errorTarget.textContent = "";

  try {
    const attempt = entry?.attempt;
    const answerRecords = Array.isArray(entry?.answerRecords) ? entry.answerRecords : [];

    const fieldResult = resolveFixedSessionFieldId(answerRecords);
    if (!fieldResult.ok) {
      errorTarget.textContent = "この学習は現在やり直せません。";
      return;
    }

    const questions = await filterManager.getNormalizedQuestionsForSubject(fieldResult.fieldId);
    const prepared = prepareFixedQuestionSession({ state, questions, answerRecords });
    if (!prepared.ok) {
      errorTarget.textContent = prepared.errorMessage;
      return;
    }

    // Phase3C: resume候補があれば確認→abandon成功後のみ新規開始する既存の共通ガードを
    // そのまま再利用する（複製しない）。sourceTypeは元Attemptの値をそのまま引き継ぐ
    // （新sourceTypeは追加しない）。
    await confirmAndAbandonResumeBeforeNewAttempt(() =>
      beginAttemptAndShowQuiz(attempt?.sourceType, null, prepared.unit)
    );
  } catch (error) {
    console.error("学習履歴の再挑戦準備でエラーが発生しました（既存の履歴表示には影響しません）:", error);
    errorTarget.textContent = "この学習は現在やり直せません。";
  } finally {
    historyRetryInProgress = false;
  }
}

// Phase3D-2: 学習履歴「間違えたN問をやり直す」。historyRetryInProgressを3D-1と共有し、
// 「もう一度やる」「間違えたN問をやり直す」いずれかの処理中はもう一方も含めて二重起動しない
// （履歴画面から一度に1つの新Attemptしか開始できないという既存前提と同じ）。
// 表示条件（isWrongRetryEligibleAttempt）と同じ判定を、DOM操作等で直接呼ばれた場合に備えて
// ここでも独立して再検証する（UI非表示だけに頼らない、STEP34/35/37の防御）。
//
// Phase4C-2: errorTargetはhandleHistoryRetryClick()と同じ理由・同じ既定値。
async function handleHistoryRetryWrongClick(entry, { errorTarget = historyError } = {}) {
  if (historyRetryInProgress) return;
  historyRetryInProgress = true;
  errorTarget.textContent = "";

  try {
    const attempt = entry?.attempt;

    if (!isWrongRetryEligibleAttempt(attempt, RETRY_ELIGIBLE_SOURCE_TYPES)) {
      errorTarget.textContent = "この学習には、間違えた問題の記録がありません。";
      return;
    }

    const answerRecords = Array.isArray(entry?.answerRecords) ? entry.answerRecords : [];
    const wrongIdSet = new Set(attempt.initialWrongQuestionIds);
    const wrongRecords = answerRecords.filter((record) => wrongIdSet.has(String(record?.questionId || "").trim()));

    const fieldResult = resolveFixedSessionFieldId(wrongRecords);
    if (!fieldResult.ok) {
      errorTarget.textContent = "この学習は現在やり直せません。";
      return;
    }

    const questions = await filterManager.getNormalizedQuestionsForSubject(fieldResult.fieldId);
    const prepared = prepareFixedWrongQuestionSession({ state, questions, attempt, answerRecords });
    if (!prepared.ok) {
      errorTarget.textContent = prepared.errorMessage;
      return;
    }

    // Phase3C: 3D-1と同じ既存の共通ガードをそのまま再利用する（複製しない）。
    // sourceTypeは元Attemptの値をそのまま引き継ぐ（新sourceTypeは追加しない）。
    await confirmAndAbandonResumeBeforeNewAttempt(() =>
      beginAttemptAndShowQuiz(attempt?.sourceType, null, prepared.unit)
    );
  } catch (error) {
    console.error("学習履歴の誤答再挑戦準備でエラーが発生しました（既存の履歴表示には影響しません）:", error);
    errorTarget.textContent = "この学習は現在やり直せません。";
  } finally {
    historyRetryInProgress = false;
  }
}

// Task53: ホーム画面の「講師用」から、講師用問題選定画面（teacher-screen）へ遷移する。
// 生徒選択の有無に関わらずいつでも開ける（講師モードは生徒の学習フローと完全に別物のため、
// state.session.studentIdを条件にしない）。表示のたびにteacher-controller.js側で
// state・フォームをリセットする（PINも含め毎回再入力、誤操作防止のため）。
function goToTeacherScreen() {
  initTeacherScreen(teacherElements);
  initTeacherHistorySection(teacherHistoryElements);
  showTeacherScreen(teacherScreen, allScreens);
}

// Task54: ホーム画面の「学校のテスト対策」から、生徒用TestSet選択画面へ遷移する。
// studentId選択の要否はhome-history-button/goToHistoryScreenと同じ既存の無言ガード方式に
// 揃える（生徒未選択時は何もしない。home-renderer.jsのdisabled切替ロジックには触れない）。
// schoolId/gradeIdはstudentIdから自動判定しない（test-set-student-controller.js側で
// 生徒が毎回自己選択する）。
function goToTestSetStudentScreen() {
  if (!state.session.studentId) return;

  initTestSetStudentScreen(tssElements, startTestSetFromSelection);
  showTestSetStudentScreen(testSetStudentScreen, allScreens);
}

// Task55: 「このテスト対策を始める」から呼ばれるコールバック。
// TestSetをfieldIdごとのグループへ分割・事前検証し（features/test-set-runner/
// test-set-runner.js）、成功すれば最初のグループのQuizを開始する。
// QuestionSet/Attemptモデル自体は一切変更せず、既存の単一fieldId実行フロー
// （startTestSetGroupQuiz→beginAttemptAndShowQuiz、既存startPracticeSessionと同型）を
// グループの数だけ順番に呼び出す（Task50確定方針）。
// STEP6: 「このテスト対策を始める」＝TestSet実行の最初の1回だけをresume競合ガードの
// 対象にする。TestSet実行中の次グループ開始（finishCurrentTestSetGroupAndAdvance→
// startTestSetGroupQuiz）はこの関数を経由しないため、group1→group2遷移を誤って
// 「旧resume」と判定することはない。
//
// キャンセル時は{ok:true}を返す（test-set-student-controller.jsは ok:true の場合
// 「成功、画面遷移はapp.js側が行う」とみなして何もしないため、ボタンが再度押せる状態へ
// 戻るだけで、実際には何も開始されない＝キャンセルの意図どおりの挙動になる）。
// abandon失敗時は既存のerrorMessage表示経路(tss-confirm-step)へ理由を渡す。
async function startTestSetFromSelection(selectedTestSet) {
  return confirmAndAbandonResumeBeforeNewAttempt(() => executeStartTestSetFromSelection(selectedTestSet), {
    cancelResult: { ok: true },
    abandonFailResult: {
      ok: false,
      errorMessage: "前回の続きの削除に失敗しました。通信環境を確認して、もう一度お試しください。"
    }
  });
}

async function executeStartTestSetFromSelection(selectedTestSet) {
  const result = await startTestSetRun(selectedTestSet, filterManager.getNormalizedQuestionsForSubject);

  if (!result.ok) {
    return result;
  }

  const firstGroup = getCurrentGroup();
  await startTestSetGroupQuiz(firstGroup.fieldId, firstGroup.questionIds);

  return { ok: true };
}

// Task55: TestSetの1グループ（単一fieldId）分のQuizを開始する。
// features/home/home-practice-controller.jsのbuildHomePracticeQuizを使うstartPracticeSession
// と同じ構造（filterManagerで絞り込まず、既にactiveな問題一覧から対象questionIdだけを
// 抽出してstateへ直接設定→beginAttemptAndShowQuiz）。既存のstartQuiz/prepareQuizStartの
// 「単元・分野・N問ランダム抽出」ロジックは通常学習専用のままで、TestSetでは使わない
// （TestSetの問題集合は講師が選定した固定集合であり、勝手に別問題へ置換しない）。
async function startTestSetGroupQuiz(fieldId, questionIds) {
  const availableQuestions = await filterManager.getNormalizedQuestionsForSubject(fieldId);
  const matched = availableQuestions.filter((q) => questionIds.includes(q.questionId));

  state.session.subject = fieldId;
  state.session.unitFilter = "all";
  state.session.modeFilter = "all";
  state.session.subunitFilter = "all";
  state.session.requestedQuestionCount = matched.length;
  // TestSetは通常学習の「間違えた問題だけ復習」設定を引き継がない（別仕様、2026-08-30確定）。
  // state.session.retryWrongEnabledの初期値はtrue固定（core/state.js）で、通常学習の
  // startQuiz()を一度も経由せずTestSetへ直行した場合に前セッションの値が漏れ込む
  // （もしくは初期値trueのまま）ため、85問完走後に意図せず間違い直しラウンドへ突入し
  // TestSetが完了しない不具合があった。通常学習側のチェックボックス連動ロジック
  // （core/quiz-controller.jsのprepareQuizStart）は変更せず、TestSet専用の実行経路である
  // ここでだけ明示的にfalseへ固定する。
  state.session.retryWrongEnabled = false;

  resetQuizState(state);
  resetUiState(state);

  state.quiz.allQuestions = matched;
  state.quiz.quizQuestions = pickQuestions(matched, matched.length);

  await beginAttemptAndShowQuiz("testset", getRunnerTestSetId(), state.session.unitFilter);
}
