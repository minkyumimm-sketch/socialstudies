import { UNKNOWN_ANSWER_VALUE } from "../config/unknown-answer.js";

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

// choiceの実際の回答UI（既存renderChoiceQuestion呼び出し）だけを切り出したヘルパー。
// 通常描画（deferAnswerUiActive===false）と、想起ゲート「思い出した」後の遅延描画
// （renderAnswerUiForCurrentQuestion経由）の両方から呼ばれる、単一の実装。
function renderChoiceAnswerUi({ question, state, renderers, callbacks, extra }) {
  renderers.renderChoiceQuestion(
    question,
    extra.questionElements,
    (choice) => {
      if (state.ui.answered) return;
      callbacks.handleAnswer(choice);
    }
  );
}

/**
 * 暗記モード-1（M1-2）: 想起ゲートで「思い出した」が押された後に、現在の問題の
 * choice回答UIだけを生成する。問題文の再描画・questionIndex/progressの変更・
 * AnswerRecord生成・正誤判定は一切行わない（回答UIの遅延生成のみ）。
 *
 * choice以外のmodeでは使用できない（fail-closed、何もしない）。
 * 既にchoice-buttonがDOM上に存在する場合も、二重生成を避けるため何もしない
 * （同一問題に対して複数回呼ばれても安全）。
 *
 * @param {Object} params - renderCurrentQuestion内部のchoiceハンドラと同じ形
 *   （{question, state, renderers, callbacks, extra}）。
 */
export function renderAnswerUiForCurrentQuestion(params) {
  const { question, state, renderers, callbacks, extra } = params;

  if (question?.mode !== "choice") {
    console.error(
      "renderAnswerUiForCurrentQuestion: choice以外のmodeでは使用できません。mode=" +
        question?.mode
    );
    return;
  }

  if (state.ui.answered) return;

  const container = extra?.questionElements?.choicesContainer;
  if (container && container.querySelector(".choice-button")) return;

  // 問題文・画像（stem）は想起ゲート表示時（S0）に既に描画済みのため、ここでは
  // 選択肢ボタンだけを追加生成する（renderChoiceQuestionStemは呼ばない＝再描画しない）。
  renderers.renderChoiceAnswerButtons(
    question,
    extra.questionElements,
    (choice) => {
      if (state.ui.answered) return;
      callbacks.handleAnswer(choice);
    }
  );
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
    render: async (params) => {
      const { question, state, renderers, callbacks, extra } = params;

      // 暗記モード-1（M1-2）: state.ui.deferAnswerUiActiveがtrueの間は、
      // choice回答UIをまだ生成せず、想起ゲート（思い出した/わからない）を先に出す。
      // 問題文・画像（stem）だけは先に描画する（生徒が問題を読めるようにするため）。
      // renderMemorizeGateはapp.js側から関数参照として渡される（features/への
      // 直接依存をcoreへ持ち込まない、既存renderers.render*と同じ注入パターン）。
      if (state.ui.deferAnswerUiActive) {
        renderers.renderChoiceQuestionStem(question, extra.questionElements);
        renderers.renderMemorizeGate({
          container: extra.questionElements.choicesContainer,
          onRecalled: () => renderAnswerUiForCurrentQuestion(params),
          onUnknown: () => {
            if (state.ui.answered) return;
            callbacks.handleAnswer(UNKNOWN_ANSWER_VALUE);
          }
        });
        return;
      }

      renderChoiceAnswerUi(params);
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
    renderChoiceQuestionStem,
    renderChoiceAnswerButtons,
    renderTextQuestion,
    renderMemorizeGate,
    ERA_CHOICES,
    handleAnswer,
    swapSortItems,
    hideSubunit,
    deferAnswerUi = false,
    unknownAnswerButton
  } = params;

  state.ui.answered = false;
  state.ui.selectedChoice = "";
  state.ui.currentSortOrder = [];
  state.ui.selectedMapArea = "";
  state.ui.selectedMapAreaId = "";
  // 暗記モード-1（M1-2）: このフラグはdeferAnswerUiが渡されなかった既存呼び出し元
  // （通常学習・TestSet・weak/dormant_review等）では常にfalseのまま。choiceハンドラの
  // 分岐条件としてのみ使用し、他のmode・他の処理からは一切参照されない。
  state.ui.deferAnswerUiActive = deferAnswerUi === true;
  state.quiz.currentQuestion = state.quiz.quizQuestions[state.quiz.currentIndex];

  // 想起ゲート中（S0）・ゲート後のchoice回答中（S1）は、既存の常設「わからない」
  // ボタン（index.html #unknown-answer-button）が想起ゲート自身の「わからない」と
  // 重複して表示されてしまう（発見済みの実機確認結果）。deferAnswerUiActive中は
  // 常設ボタンを非表示にし、想起ゲート側の「わからない」だけを窓口にする。
  // 通常描画（deferAnswerUiActive===false）では従来どおり常に表示する。
  if (unknownAnswerButton) {
    unknownAnswerButton.style.display = state.ui.deferAnswerUiActive ? "none" : "";
  }

  resetQuestionArea();
  nextButton.disabled = true;

  const question = state.quiz.currentQuestion;

  if (state.quiz.retryMode) {
    answerResult.textContent = "復習モード：間違えた問題です。";
  } else {
    answerResult.textContent = getInitialGuideMessage(question);
  }

  // fail-closed: 想起ゲート（deferAnswerUi=true）はchoice以外のmodeに未対応。
  // 通常描画へ黙ってフォールバックすると「暗記モードなのに答えUIが最初から
  // 見える」事故につながるため、回答UI自体を一切生成せずに停止する。
  if (state.ui.deferAnswerUiActive && question?.mode !== "choice") {
    console.error(
      "renderCurrentQuestion: deferAnswerUi=trueはchoice以外のmode（mode=" +
        question?.mode +
        "）に対応していません。fail-closedとして回答UIを生成しません。"
    );
    answerResult.textContent = "この問題形式は暗記モードにまだ対応していません。";

    const { quizSubjectText: fallbackSubjectText } = buildQuizMetaText(state);
    quizStudent.textContent = `生徒名：${state.session.studentName}`;
    quizSubject.textContent = fallbackSubjectText;
    quizProgress.textContent = `進行：${state.quiz.currentIndex + 1} / ${state.quiz.quizQuestions.length}`;
    quizScore.textContent = state.quiz.retryMode
      ? `復習正解数：${state.quiz.score}`
      : `正解数：${state.quiz.score}`;
    quizUnit.textContent = buildQuizUnitText(question, hideSubunit);
    return;
  }

  await renderQuestionByMode({
    question,
    state,
    renderers: {
      renderMapClickQuestion,
      renderEraQuestion,
      renderSortQuestion,
      renderChoiceQuestion,
      renderChoiceQuestionStem,
      renderChoiceAnswerButtons,
      renderTextQuestion,
      renderMemorizeGate
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