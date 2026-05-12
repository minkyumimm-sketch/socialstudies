import { pickQuestions } from "./question-picker.js";
import { resetQuizState, resetUiState } from "./state.js";

export function resetStartScreenMessages(elements) {
  const { startError, answerResult } = elements;

  if (startError) {
    startError.textContent = "";
  }

  if (answerResult) {
    answerResult.textContent = "";
  }
}

export function restartQuiz(state) {
  const preservedAllQuestions = [...state.quiz.allQuestions];
  const requestedQuestionCount = state.session.requestedQuestionCount;

  resetQuizState(state);
  resetUiState(state);

  state.quiz.allQuestions = preservedAllQuestions;
  state.quiz.quizQuestions = pickQuestions(preservedAllQuestions, requestedQuestionCount);
}