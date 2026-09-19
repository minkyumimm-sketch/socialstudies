import { UNKNOWN_ANSWER_VALUE, formatSelectedChoiceForDisplay } from "../config/unknown-answer.js";

function splitPipeValues(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatMapClickLabelList(value, getMapAreaLabelById) {
  if (Array.isArray(value)) {
    return value
      .map((item) => getMapAreaLabelById(item) || String(item ?? ""))
      .join(" | ");
  }

  return splitPipeValues(value)
    .map((item) => getMapAreaLabelById(item) || item)
    .join(" | ");
}

export function formatSelectedChoiceForSave(selectedChoice, question, getMapAreaLabelById) {
  if (Array.isArray(selectedChoice)) {
    if (question?.mode === "map_click") {
      return formatMapClickLabelList(selectedChoice, getMapAreaLabelById);
    }
    return selectedChoice.join(" | ");
  }

  if (question?.mode === "map_click") {
    return formatMapClickLabelList(selectedChoice, getMapAreaLabelById);
  }

  return String(selectedChoice ?? "");
}

export function applyAnswerResult(params) {
  const {
    state,
    question,
    selectedChoice,
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
    rawSelectedChoice,
    // 暗記モード-1（M1-2）: 結果表示のclass/色を、isCorrectからの既定決定
    // （true→"correct"、false→"incorrect"）ではなく明示的に上書きしたい場合に渡す
    // 汎用オプション（例："neutral"）。coreはmemorizeという概念を一切知らない
    // （呼び出し元がどの値を渡すか判断する）。省略時は既存挙動と完全に同じ。
    resultDisplayVariant
  } = params;

  answerResult.classList.remove("correct", "incorrect");
  answerResult.style.color = "";

  const displayCorrectAnswer =
    question?.mode === "map_click"
      ? (question.answer || formatMapClickLabelList(question.svgAreaIds || question.svgAreaId || "", getMapAreaLabelById))
      : correctAnswer;

  // 「わからない」（selectedChoice===UNKNOWN_ANSWER_VALUE）の場合は、mode別の整形
  // （map_clickの地名変換等）を経由させず、AnswerRecordへ保存する値を常に内部値
  // そのままにする。画面表示（結果メッセージ）だけは別途ラベルへ変換する。
  const displaySelectedAnswer =
    selectedChoice === UNKNOWN_ANSWER_VALUE
      ? UNKNOWN_ANSWER_VALUE
      : question?.mode === "map_click"
        ? formatMapClickLabelList(selectedChoice, getMapAreaLabelById)
        : selectedChoice;

  const messageSelectedAnswer = formatSelectedChoiceForDisplay(displaySelectedAnswer);

  if (isCorrect) {
    state.quiz.score += 1;
    answerResult.textContent = buildResultMessage(
      true,
      question,
      displayCorrectAnswer,
      messageSelectedAnswer,
      getMapAreaLabelById
    );
  } else {
    answerResult.textContent = buildResultMessage(
      false,
      question,
      displayCorrectAnswer,
      messageSelectedAnswer,
      getMapAreaLabelById
    );

    if (!state.quiz.retryMode) {
      const currentQuestionId = getQuestionId(question);
      if (!state.quiz.wrongQuestions.some((q) => getQuestionId(q) === currentQuestionId)) {
        state.quiz.wrongQuestions.push(question);
      }
    }
  }

  // 表示class/色の決定。resultDisplayVariantが明示的に渡された場合はそれを優先し、
  // 省略時はisCorrectから既定どおり決定する（既存の全呼び出し元はこちらのまま）。
  // "correct"/"incorrect"以外の値（例："neutral"）ではclassList/style.colorに
  // 一切触れない＝.result-box既定の中立表示のまま（.correct/.incorrectのCSS自体は無変更）。
  const displayVariant = resultDisplayVariant || (isCorrect ? "correct" : "incorrect");
  if (displayVariant === "correct") {
    answerResult.classList.add("correct");
    answerResult.style.color = "#2e7d32";
  } else if (displayVariant === "incorrect") {
    answerResult.classList.add("incorrect");
    answerResult.style.color = "#c62828";
  }

  if (question.mode === "choice" || question.mode === "era") {
    lockChoiceButtons(choicesContainer, selectedChoice, correctAnswer, normalizeValue);
  }

  if (question.mode === "sort") {
    drawSortList(choicesContainer, state, (fromIndex, toIndex) => {
      if (state.ui.answered) return;
      swapSortItems(fromIndex, toIndex);
    });
  }

  if (question.mode === "map_click") {
    const correctIds =
      question.svgAreaIds ||
      question.svgAreaId ||
      question.answer ||
      "";

    const selectedIdsForVisual =
      Array.isArray(rawSelectedChoice)
        ? rawSelectedChoice.join("|")
        : String(rawSelectedChoice || "");

    lockMapClickVisuals(
      questionElements.mapClickContainer,
      selectedIdsForVisual,
      correctIds,
      normalizeValue
    );
  }

  quizScore.textContent = state.quiz.retryMode
    ? `復習正解数：${state.quiz.score}`
    : `正解数：${state.quiz.score}`;

  nextButton.disabled = false;

  return {
    savePayload: {
      studentId: state.session.studentId,
      name: state.session.studentName,
      subject: buildSavedSubjectName(state),
      questionId: getQuestionId(question),
      unit: question.unit,
      question: question.question,
      selectedChoice: displaySelectedAnswer,
      correctAnswer: displayCorrectAnswer,
      isCorrect
    }
  };
}