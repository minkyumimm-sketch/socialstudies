import { SUBJECT_CONFIG } from "../config/subjects.js";
import { pickQuestions, shuffleArray } from "./question-picker.js";
import { filterQuestions } from "./question-filters.js";
import { resetQuizState, resetUiState } from "./state.js";

export async function prepareQuizStart(params) {
  const {
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
    retryWrongEnabled
  } = params;

  if (!studentId || !studentName) {
    return {
      ok: false,
      errorMessage: "候補から生徒を選んでください。"
    };
  }

  if (!subject || !SUBJECT_CONFIG[subject]) {
    return {
      ok: false,
      errorMessage: "科目を選んでください。"
    };
  }

  const normalizedQuestions = await filterManager.getNormalizedQuestionsForSubject(subject);
  const allQuestions = filterQuestions(
    normalizedQuestions,
    {
      unitFilter,
      modeFilter,
      subunitFilter
    },
    normalizeValue
  );

  if (!allQuestions.length) {
    return {
      ok: false,
      errorMessage: "条件に合う問題がありません。"
    };
  }

  state.session.studentName = studentName;
  state.session.studentId = studentId;
  state.session.subject = subject;
  state.session.unitFilter = unitFilter;
  state.session.modeFilter = modeFilter;
  state.session.subunitFilter = subunitFilter;
  state.session.requestedQuestionCount = requestedQuestionCount;
  state.session.retryWrongEnabled = Boolean(retryWrongEnabled);

  resetQuizState(state);
  resetUiState(state);

  state.quiz.allQuestions = allQuestions;
  state.quiz.quizQuestions = pickQuestions(allQuestions, requestedQuestionCount);

  return {
    ok: true
  };
}

export function startRetryWrongRound(state) {
  state.quiz.firstRoundScore = state.quiz.score;
  state.quiz.firstRoundTotal = state.quiz.quizQuestions.length;
  state.quiz.quizQuestions = shuffleArray([...state.quiz.wrongQuestions]);
  state.quiz.currentIndex = 0;
  state.quiz.score = 0;
  state.quiz.currentQuestion = null;
  state.quiz.retryMode = true;

  resetUiState(state);
}