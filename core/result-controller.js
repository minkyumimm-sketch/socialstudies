import { SUBJECT_CONFIG } from "../config/subjects.js";
import { MODE_LABELS, MODE_FILTER_OPTIONS } from "../config/modes.js";

function formatUnitFilterLabel(unitFilter) {
  if (!unitFilter || unitFilter === "all") return "";
  return ` / ${unitFilter}`;
}

function formatModeFilterLabel(subject, modeFilter) {
  if (!modeFilter || modeFilter === "all") return "";
  const label = MODE_LABELS[modeFilter];
  if (!label) return "";
  if (!MODE_FILTER_OPTIONS[subject]?.some((option) => option.value === modeFilter)) return "";
  return ` / ${label}`;
}

function formatSubunitFilterLabel(subunitFilter) {
  if (!subunitFilter || subunitFilter === "all") return "";
  return ` / ${subunitFilter}`;
}

function formatMapClickAnswerLabel(value, getMapAreaLabelById) {
  if (!value) return "未選択";

  return String(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => getMapAreaLabelById(item) || item)
    .join(" | ");
}

export function buildResultMessage(
  isCorrect,
  question,
  correctAnswer,
  selectedChoice,
  getMapAreaLabelById
) {
  const explanation = question.explanation
    ? `解説：${question.explanation}`
    : "解説：未設定";

  if (question.mode === "map_click") {
    const selectedLabel = formatMapClickAnswerLabel(
      selectedChoice,
      getMapAreaLabelById
    );

    const correctLabel = formatMapClickAnswerLabel(
      correctAnswer,
      getMapAreaLabelById
    );

    const selectedLine = `あなたの解答：${selectedLabel}`;

    if (isCorrect) {
      return `○ 正解！\n${selectedLine}\n${explanation}`;
    }

    return `× 不正解\n${selectedLine}\n正解：${correctLabel}\n${explanation}`;
  }

  if (isCorrect) {
    return `○ 正解！\n${explanation}`;
  }

  return `× 不正解\n正解：${correctAnswer}\n${explanation}`;
}

export function buildSavedSubjectName(state) {
  let result = String(state.session.subject || "").trim();

  if (state.session.unitFilter && state.session.unitFilter !== "all") {
    result += `_${state.session.unitFilter}`;
  }

  if (state.session.modeFilter && state.session.modeFilter !== "all") {
    result += `_${state.session.modeFilter}`;
  }

  if (state.session.subunitFilter && state.session.subunitFilter !== "all") {
    result += `_${state.session.subunitFilter}`;
  }

  if (state.quiz.retryMode) {
    result += "_retry";
  }

  return result;
}

export function renderFinalResult(state, elements) {
  const {
    finalStudent,
    finalSubject,
    finalScore,
    wrongRetryButton
  } = elements;

  finalStudent.textContent = `生徒名：${state.session.studentName}`;

  finalSubject.textContent =
    `科目：${SUBJECT_CONFIG[state.session.subject].label}` +
    `${formatUnitFilterLabel(state.session.unitFilter)}` +
    `${formatModeFilterLabel(state.session.subject, state.session.modeFilter)}` +
    `${formatSubunitFilterLabel(state.session.subunitFilter)}`;

  if (state.quiz.retryMode) {
    finalScore.textContent =
      `本番：${state.quiz.firstRoundScore} / ${state.quiz.firstRoundTotal} 問正解\n` +
      `復習：${state.quiz.score} / ${state.quiz.quizQuestions.length} 問正解`;
  } else {
    finalScore.textContent =
      `結果：${state.quiz.score} / ${state.quiz.quizQuestions.length} 問正解`;
  }

  wrongRetryButton.style.display =
    state.quiz.wrongQuestions.length > 0
      ? "inline-block"
      : "none";
}

export function buildQuizMetaText(state) {
  return {
    quizSubjectText:
      `科目：${SUBJECT_CONFIG[state.session.subject].label}` +
      `${formatUnitFilterLabel(state.session.unitFilter)}` +
      `${formatModeFilterLabel(state.session.subject, state.session.modeFilter)}` +
      `${formatSubunitFilterLabel(state.session.subunitFilter)}` +
      `${state.quiz.retryMode ? "（復習）" : ""}`
  };
}