export function judgeAnswer(question, selectedChoice, normalizeValue) {
  if (!question) return false;

  if (question.mode === "sort") {
    const selectedArray = Array.isArray(selectedChoice)
      ? selectedChoice
      : splitPipeValues(selectedChoice);

    const answerArray = Array.isArray(question.sortAnswerArray)
      ? question.sortAnswerArray
      : splitPipeValues(question.answer);

    if (selectedArray.length !== answerArray.length) return false;

    return selectedArray.every((item, index) => {
      return normalizeValue(item) === normalizeValue(answerArray[index]);
    });
  }

  if (question.mode === "map_click") {
    const selectedIds = normalizePipeSet(selectedChoice, normalizeValue);
    const correctIds = normalizePipeSet(getMapCorrectAreaIds(question), normalizeValue);

    if (selectedIds.length !== correctIds.length) return false;

    return selectedIds.every((item, index) => item === correctIds[index]);
  }

  const correctAnswer = getCorrectAnswer(question);
  return normalizeValue(selectedChoice) === normalizeValue(correctAnswer);
}

export function getCorrectAnswer(question) {
  if (!question) return "";

  if (question.mode === "era") {
    return question.eraCorrect || question.answer || "";
  }

  if (question.mode === "sort") {
    if (Array.isArray(question.sortAnswerArray)) {
      return question.sortAnswerArray.join(" | ");
    }
    return question.answer || "";
  }

  if (question.mode === "map_click") {
    return question.answer || "";
  }

  return question.answer || "";
}

export function getMapCorrectAreaIds(question) {
  if (!question) return "";

  const svgAreaIds = String(question.svgAreaIds || "").trim();
  if (svgAreaIds) return svgAreaIds;

  const svgAreaId = String(question.svgAreaId || "").trim();
  if (svgAreaId) return svgAreaId;

  return String(question.answer || "").trim();
}

function splitPipeValues(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePipeSet(value, normalizeValue) {
  return splitPipeValues(value)
    .map((item) => normalizeValue(item))
    .filter(Boolean)
    .sort();
}