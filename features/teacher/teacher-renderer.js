// features/teacher/teacher-renderer.js
//
// teacher-screenのDOM描画のみを担当する（history-renderer.jsと同じ思想：
// 呼び出し側が既に取得済みのDOM要素を受け取り、ここではfetch/GAS通信を行わない）。
// イベント配線・データ取得はfeatures/teacher/teacher-controller.jsの責務とし、
// このファイルは「渡されたデータをどう描画するか」だけに専念する。

import { SUBJECT_CONFIG } from "../../config/subjects.js";

/**
 * @param {HTMLSelectElement} selectEl
 * @param {Array<{schoolId:string, schoolName:string}>} schools
 */
export function renderSchoolOptions(selectEl, schools) {
  selectEl.innerHTML = "";

  if (schools.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "学校が登録されていません";
    selectEl.appendChild(option);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "選択してください";
  selectEl.appendChild(placeholder);

  schools.forEach((school) => {
    const option = document.createElement("option");
    option.value = school.schoolId;
    option.textContent = school.schoolName;
    selectEl.appendChild(option);
  });
}

/**
 * @param {HTMLSelectElement} selectEl
 */
export function renderFieldOptions(selectEl) {
  selectEl.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "選択してください";
  selectEl.appendChild(placeholder);

  Object.entries(SUBJECT_CONFIG).forEach(([fieldId, config]) => {
    const option = document.createElement("option");
    option.value = fieldId;
    option.textContent = config.label;
    selectEl.appendChild(option);
  });
}

/**
 * @param {HTMLSelectElement} selectEl
 * @param {string[]} units
 */
export function renderUnitOptions(selectEl, units) {
  selectEl.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "すべて";
  selectEl.appendChild(allOption);

  units.forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit;
    selectEl.appendChild(option);
  });
}

/**
 * @param {HTMLSelectElement} selectEl
 * @param {string[]} subunits
 */
export function renderSubunitOptions(selectEl, subunits) {
  renderUnitOptions(selectEl, subunits);
}

/**
 * 候補問題一覧を描画する。行ごとにcheckboxを持ち、状態変化はonToggleへ委譲する
 * （このファイルはDOM書き込みのみ、選択状態の保持はteacher-state.jsの責務）。
 *
 * @param {HTMLElement} containerEl
 * @param {Array<Object>} questions - 正規化済み・絞り込み済みのQuestion配列
 * @param {string} fieldId
 * @param {Map<string, Object>} selectedQuestions - teacherState.selectedQuestions
 * @param {(fieldId:string, questionId:string, checked:boolean) => void} onToggle
 */
export function renderQuestionList(containerEl, questions, fieldId, selectedQuestions, onToggle) {
  containerEl.innerHTML = "";

  if (questions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "teacher-question-empty";
    empty.textContent = "条件に一致する問題がありません。";
    containerEl.appendChild(empty);
    return;
  }

  questions.forEach((question) => {
    const questionId = String(question.questionId || "");
    const row = document.createElement("label");
    row.className = "teacher-question-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedQuestions.has(questionId);
    checkbox.addEventListener("change", () => {
      onToggle(fieldId, questionId, checkbox.checked);
    });

    const body = document.createElement("div");
    body.className = "teacher-question-body";

    const metaLine = document.createElement("p");
    metaLine.className = "teacher-question-meta";
    const imageBadge = question.imagePath ? "［画像あり］" : "";
    metaLine.textContent = `${questionId} ｜ ${question.unit || ""} ${question.subunit ? "/ " + question.subunit : ""} ｜ ${question.mode || ""} ${imageBadge}`;

    const questionLine = document.createElement("p");
    questionLine.className = "teacher-question-text";
    questionLine.textContent = question.question || "";

    const answerLine = document.createElement("p");
    answerLine.className = "teacher-question-answer";
    answerLine.textContent = `答え: ${formatAnswerForDisplay(question)}`;

    body.appendChild(metaLine);
    body.appendChild(questionLine);
    body.appendChild(answerLine);

    row.appendChild(checkbox);
    row.appendChild(body);
    containerEl.appendChild(row);
  });
}

function formatAnswerForDisplay(question) {
  if (question.mode === "map_click") {
    return "（地図クリック問題）";
  }
  if (Array.isArray(question.sortAnswerArray) && question.sortAnswerArray.length > 0) {
    return question.sortAnswerArray.join(" → ");
  }
  return String(question.answer || "");
}

/**
 * @param {HTMLElement} el
 * @param {Object} teacherState
 * @param {(teacherState:Object) => Record<string, number>} getSelectedCountByField
 */
export function renderSelectionSummary(el, teacherState, getSelectedCountByField) {
  const total = teacherState.selectedQuestions.size;
  const counts = getSelectedCountByField(teacherState);

  const parts = Object.entries(counts).map(([fieldId, count]) => {
    const label = SUBJECT_CONFIG[fieldId]?.label || fieldId;
    return `${label} ${count}問`;
  });

  el.textContent = parts.length > 0 ? `選択中：${total}問（${parts.join("／")}）` : `選択中：${total}問`;
}

/**
 * 保存済みTestSet一覧を描画する（管理Phase M-1）。行ごとに「非表示にする」ボタンを
 * 持ち、確認中(confirmingId===testSetId)の行だけ確認メッセージ＋
 * キャンセル/非表示にするボタンへ切り替える。物理削除ではないことを毎回明示する。
 *
 * @param {HTMLElement} containerEl
 * @param {Array<{testSetId:string, examRoundLabel:string, label:string, questionCount:number}>} testSets
 * @param {{confirmingId:string, archivingId:string}} uiState
 * @param {{onRequestArchive:(testSetId:string)=>void, onCancelArchive:()=>void, onConfirmArchive:(testSetId:string)=>void}} callbacks
 */
export function renderSavedTestSetList(containerEl, testSets, uiState, callbacks) {
  containerEl.innerHTML = "";

  if (testSets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "teacher-testset-empty";
    empty.textContent = "保存済みのテストセットはありません。";
    containerEl.appendChild(empty);
    return;
  }

  testSets.forEach((testSet) => {
    const row = document.createElement("div");
    row.className = "teacher-testset-row";

    if (uiState.confirmingId === testSet.testSetId) {
      row.classList.add("teacher-testset-row-confirm");
      const message = document.createElement("p");
      message.className = "teacher-testset-confirm-message";
      message.textContent = "このテストセットを生徒の一覧から非表示にします。過去の学習記録は削除されません。よろしいですか？";

      const buttonRow = document.createElement("div");
      buttonRow.className = "teacher-testset-confirm-buttons";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "secondary-button";
      cancelButton.textContent = "キャンセル";
      cancelButton.addEventListener("click", () => callbacks.onCancelArchive());

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "primary-button";
      const isArchiving = uiState.archivingId === testSet.testSetId;
      confirmButton.textContent = isArchiving ? "処理中..." : "非表示にする";
      confirmButton.disabled = isArchiving;
      confirmButton.addEventListener("click", () => callbacks.onConfirmArchive(testSet.testSetId));

      buttonRow.appendChild(cancelButton);
      buttonRow.appendChild(confirmButton);
      row.appendChild(message);
      row.appendChild(buttonRow);
    } else {
      const info = document.createElement("p");
      info.className = "teacher-testset-info";
      info.textContent = `${testSet.label}（${testSet.examRoundLabel}・${testSet.questionCount}問）`;

      const archiveButton = document.createElement("button");
      archiveButton.type = "button";
      archiveButton.className = "secondary-button";
      archiveButton.textContent = "非表示にする";
      archiveButton.addEventListener("click", () => callbacks.onRequestArchive(testSet.testSetId));

      row.appendChild(info);
      row.appendChild(archiveButton);
    }

    containerEl.appendChild(row);
  });
}

/**
 * @param {HTMLElement} el
 * @param {string} message
 */
export function showTeacherError(el, message) {
  el.textContent = message || "";
}

/**
 * @param {HTMLElement} el
 * @param {string} message
 * @param {boolean} isError
 */
export function showSaveResult(el, message, isError) {
  el.textContent = message || "";
  el.classList.toggle("teacher-save-result-error", Boolean(isError));
  el.classList.toggle("teacher-save-result-success", !isError && Boolean(message));
}
