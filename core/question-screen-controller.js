// hideSubunitはTestSet（学校のテスト対策）実行中にのみtrueが渡される。
// 小単元名が問題の答えを示唆してしまうケース（例："光の直進"）があるため、
// TestSet実行中は問題表示前のUIから小単元を隠す。通常学習では従来どおり表示する。
// 呼び出し元（app.js）がisRunnerActive()の結果をここへ渡すだけで、
// coreはfeatures/test-set-runner/に依存しない。
export function buildQuizUnitText(question, hideSubunit = false) {
  const parts = [];
  if (question?.unit) parts.push(question.unit);
  if (!hideSubunit && question?.subunit) parts.push(question.subunit);
  return parts.length ? `単元：${parts.join(" / ")}` : "";
}

const QUESTION_MODE_HANDLERS = {
  map_click: {
    guideMessage: "地図をクリックして選び、「解答」を押してください。",
    render: async ({ question, state, renderers, callbacks, extra }) => {
      await renderers.renderMapClickQuestion(question, extra.questionElements, state);
    }
  },

  era: {
    guideMessage: "選択肢を1つ選んでください。",
    render: async ({ question, state, renderers, callbacks, extra }) => {
      renderers.renderEraQuestion(
        question,
        extra.questionElements,
        extra.ERA_CHOICES,
        (choice) => {
          if (state.ui.answered) return;
          callbacks.handleAnswer(choice);
        }
      );
    }
  },

  sort: {
    guideMessage: "出来事を正しい順に並べ替えてから「解答」を押してください。",
    render: async ({ question, state, renderers, callbacks, extra }) => {
      renderers.renderSortQuestion(
        question,
        extra.questionElements,
        state,
        (fromIndex, toIndex) => {
          if (state.ui.answered) return;
          callbacks.swapSortItems(fromIndex, toIndex);
        }
      );
    }
  },

  choice: {
    guideMessage: "選択肢を1つ選んでください。",
    render: async ({ question, state, renderers, callbacks, extra }) => {
      renderers.renderChoiceQuestion(
        question,
        extra.questionElements,
        (choice) => {
          if (state.ui.answered) return;
          callbacks.handleAnswer(choice);
        }
      );
    }
  },

  text: {
    guideMessage: "答えを入力して「解答」を押してください。",
    render: async ({ question, renderers, extra }) => {
      renderers.renderTextQuestion(question, extra.questionElements);
    }
  }
};

export const VALID_QUESTION_MODES = Object.keys(QUESTION_MODE_HANDLERS);

function getQuestionModeHandler(mode) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  return QUESTION_MODE_HANDLERS[normalizedMode] || QUESTION_MODE_HANDLERS.text;
}

export function getInitialGuideMessage(question) {
  const handler = getQuestionModeHandler(question?.mode);
  return handler.guideMessage || "";
}

async function renderQuestionByMode(params) {
  const { question } = params;
  const handler = getQuestionModeHandler(question?.mode);
  await handler.render(params);
}

export async function renderCurrentQuestion(params) {
  const {
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
    swapSortItems,
    hideSubunit
  } = params;

  state.ui.answered = false;
  state.ui.selectedChoice = "";
  state.ui.currentSortOrder = [];
  state.ui.selectedMapArea = "";
  state.ui.selectedMapAreaId = "";
  state.quiz.currentQuestion = state.quiz.quizQuestions[state.quiz.currentIndex];

  resetQuestionArea();
  nextButton.disabled = true;

  const question = state.quiz.currentQuestion;

  if (state.quiz.retryMode) {
    answerResult.textContent = "復習モード：間違えた問題です。";
  } else {
    answerResult.textContent = getInitialGuideMessage(question);
  }

  await renderQuestionByMode({
    question,
    state,
    renderers: {
      renderMapClickQuestion,
      renderEraQuestion,
      renderSortQuestion,
      renderChoiceQuestion,
      renderTextQuestion
    },
    callbacks: {
      handleAnswer,
      swapSortItems
    },
    extra: {
      questionElements,
      ERA_CHOICES
    }
  });

  const { quizSubjectText } = buildQuizMetaText(state);

  quizStudent.textContent = `生徒名：${state.session.studentName}`;
  quizSubject.textContent = quizSubjectText;
  quizProgress.textContent = `進行：${state.quiz.currentIndex + 1} / ${state.quiz.quizQuestions.length}`;
  quizScore.textContent = state.quiz.retryMode
    ? `復習正解数：${state.quiz.score}`
    : `正解数：${state.quiz.score}`;
  quizUnit.textContent = buildQuizUnitText(question, hideSubunit);
}