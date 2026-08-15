// features/test-set-student/test-set-student-renderer.js
//
// test-set-student-screenのDOM描画のみを担当する（features/teacher/teacher-renderer.js・
// features/history/history-renderer.jsと同じ思想：呼び出し側が取得済みのDOM要素・データを
// 渡し、ここではfetch/GAS通信を行わない）。

export { renderSchoolOptions } from "../teacher/teacher-renderer.js";

const GRADE_OPTIONS = ["中1", "中2", "中3"];

/**
 * @param {HTMLSelectElement} selectEl
 */
export function renderGradeOptions(selectEl) {
  selectEl.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "選択してください";
  selectEl.appendChild(placeholder);

  GRADE_OPTIONS.forEach((grade) => {
    const option = document.createElement("option");
    option.value = grade;
    option.textContent = grade;
    selectEl.appendChild(option);
  });
}

/**
 * TestSet一覧をカード形式で描画する。
 * @param {HTMLElement} containerEl
 * @param {Array<{testSetId:string, examRoundLabel:string, label:string, questionCount:number}>} testSets
 * @param {(testSetId:string) => void} onSelect
 */
export function renderTestSetList(containerEl, testSets, onSelect) {
  containerEl.innerHTML = "";

  testSets.forEach((testSet) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "tss-test-set-card";

    const labelLine = document.createElement("p");
    labelLine.className = "tss-test-set-card-label";
    labelLine.textContent = testSet.label || "";

    const metaLine = document.createElement("p");
    metaLine.className = "tss-test-set-card-meta";
    metaLine.textContent = `${testSet.examRoundLabel || ""} ｜ ${testSet.questionCount ?? 0}問`;

    card.appendChild(labelLine);
    card.appendChild(metaLine);

    card.addEventListener("click", () => onSelect(testSet.testSetId));

    containerEl.appendChild(card);
  });
}

/**
 * 開始前確認の表示内容を組み立てる。
 * @param {HTMLElement} containerEl
 * @param {{schoolName:string, gradeId:string, testSet:Object}} data
 */
export function renderConfirmInfo(containerEl, data) {
  containerEl.innerHTML = "";

  const rows = [
    ["学校", data.schoolName],
    ["学年", data.gradeId],
    ["テスト回", data.testSet?.examRoundLabel || ""],
    ["セット名", data.testSet?.label || ""],
    ["問題数", `${Array.isArray(data.testSet?.questions) ? data.testSet.questions.length : 0}問`]
  ];

  rows.forEach(([label, value]) => {
    const row = document.createElement("p");
    row.className = "tss-confirm-row";
    row.innerHTML = `<span class="tss-confirm-row-label">${label}</span><span class="tss-confirm-row-value"></span>`;
    row.querySelector(".tss-confirm-row-value").textContent = value;
    containerEl.appendChild(row);
  });
}

/**
 * @param {HTMLElement} el
 * @param {string} message
 */
export function showTssError(el, message) {
  el.textContent = message || "";
}
