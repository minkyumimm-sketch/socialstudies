export function splitPipeValues(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildFallbackQuestionId(question, fallbackSubject = "") {
  const parts = [
    question.subject || fallbackSubject || "subject",
    question.mode || "mode",
    question.unit || "unit",
    question.question || "question"
  ];

  return parts
    .join("_")
    .replace(/\s+/g, "_")
    .replace(/　/g, "_")
    .replace(/[^\wぁ-んァ-ヶ一-龠ー]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || `q_${Date.now()}`;
}

export function normalizeQuestion(question, fallbackSubject = "") {
  const normalized = { ...question };

  normalized.questionId = String(question.questionId ?? question.id ?? "").trim();
  normalized.subject = String(question.subject ?? "").trim().toLowerCase();
  normalized.unit = String(question.unit ?? "").trim();
  normalized.subunit = String(question.subunit ?? "").trim();
  normalized.mode = String(question.mode ?? "").trim().toLowerCase();
  normalized.question = String(question.question ?? "").trim();
  normalized.answer = String(question.answer ?? "").trim();
  normalized.explanation = String(question.explanation ?? "").trim();
  normalized.status = String(question.status ?? "active").trim().toLowerCase();
  normalized.choices = String(question.choices ?? "").trim();
  normalized.eraCorrect = String(question.eraCorrect ?? "").trim();
  normalized.sortGroup = String(question.sortGroup ?? "").trim();
  normalized.sortItems = String(question.sortItems ?? "").trim();

  normalized.choiceArray = splitPipeValues(normalized.choices);
  normalized.sortItemsArray = splitPipeValues(normalized.sortItems);
  normalized.sortAnswerArray = splitPipeValues(normalized.answer);

  normalized.svgAreaId = String(question.svgAreaId ?? "").trim();
  normalized.mapId = String(question.mapId ?? "").trim();
  normalized.answerAlias = String(question.answerAlias ?? "").trim();
  normalized.imagePath = String(question.imagePath ?? "").trim();

  if (!normalized.questionId) {
    normalized.questionId = buildFallbackQuestionId(normalized, fallbackSubject);
  }

  return normalized;
}