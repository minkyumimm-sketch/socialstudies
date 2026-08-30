// features/teacher/teacher-history-renderer.js
//
// 管理Phase M-2の描画専用ファイル（DOM書き込みのみ、GAS通信・状態保持は行わない、
// 既存teacher-renderer.jsと同じ方針）。

function formatAnsweredAt(answeredAt) {
  if (!answeredAt) return "日時不明";
  const time = Date.parse(answeredAt);
  if (!Number.isFinite(time)) return "日時不明";

  const date = new Date(time);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSourceBadge(record) {
  if (record.sourceType === "testset") {
    return record.testSetId ? `テストセット（${record.testSetId}）` : "テストセット";
  }
  if (record.sourceType === "weak_review") return "苦手復習";
  if (record.sourceType === "dormant_review") return "復習（久しぶり）";
  if (record.sourceType === "normal") return "通常学習";
  return "起点不明";
}

/**
 * @param {HTMLElement} containerEl
 * @param {Array<Object>} wrongAnswers - features/teacher/teacher-history-service.jsの結果
 * @param {boolean} [hasAttempts] - falseなら「間違いなし」ではなく「学習履歴自体が無い」と表示する
 */
export function renderWrongAnswerList(containerEl, wrongAnswers, hasAttempts = true) {
  containerEl.innerHTML = "";

  if (wrongAnswers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "teacher-history-empty";
    empty.textContent = hasAttempts
      ? "現在記録されている間違いはありません。"
      : "まだ学習履歴がありません。";
    containerEl.appendChild(empty);
    return;
  }

  const heading = document.createElement("p");
  heading.className = "teacher-history-count";
  heading.textContent = `現在の間違い：${wrongAnswers.length}件`;
  containerEl.appendChild(heading);

  wrongAnswers.forEach((record) => {
    const card = document.createElement("div");
    card.className = "teacher-history-card";

    const meta = document.createElement("p");
    meta.className = "teacher-history-meta";
    meta.textContent = `${record.fieldLabel} ／ ${record.unit || "（単元不明）"} ／ ${formatSourceBadge(record)}`;

    const questionLine = document.createElement("p");
    questionLine.className = "teacher-history-question";
    questionLine.textContent = record.questionText
      ? `問題：${record.questionText}`
      : `問題ID: ${record.questionId}（現在の問題マスターに見つかりません）`;

    const selectedLine = document.createElement("p");
    selectedLine.className = "teacher-history-selected";
    selectedLine.textContent = `生徒の回答：${record.selectedChoice || "（未記録）"}`;

    const correctLine = document.createElement("p");
    correctLine.className = "teacher-history-correct";
    correctLine.textContent = `正解：${record.correctAnswer || "（未記録）"}`;

    const dateLine = document.createElement("p");
    dateLine.className = "teacher-history-date";
    dateLine.textContent = `回答：${formatAnsweredAt(record.answeredAt)}`;

    card.appendChild(meta);
    card.appendChild(questionLine);
    card.appendChild(selectedLine);
    card.appendChild(correctLine);
    card.appendChild(dateLine);
    containerEl.appendChild(card);
  });
}

/**
 * @param {HTMLElement} el
 * @param {string} message
 */
export function showTeacherHistoryStatus(el, message) {
  el.textContent = message || "";
}
