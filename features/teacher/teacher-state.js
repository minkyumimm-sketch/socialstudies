// features/teacher/teacher-state.js
//
// 講師用問題選定UI（teacher-screen）専用の状態。既存state.session/state.quiz/state.ui
// （core/state.js）へは混ぜず、独立したstateとして持つ（Task53確定方針、STEP24）。
// 生徒の学習フローとは完全に別物であり、studentIdもここでは一切扱わない。
//
// PINはこのstate（メモリ上）にのみ保持し、localStorage等へ永続化しない。
// ページ再読込後は再入力が必要（Task53確定方針、STEP18）。

/**
 * @typedef {Object} TeacherQuestionRef
 * @property {string} fieldId
 * @property {string} questionId
 */

/**
 * @returns {Object} 講師UI用の初期state
 */
export function createTeacherState() {
  return {
    pin: "",
    pinEntered: false,
    schools: [],
    selectedSchoolId: "",
    gradeId: "",
    academicYearId: computeCurrentAcademicYearId(),
    examRoundLabel: "",
    label: "",
    currentFieldId: "",
    questionCacheByField: {}, // fieldId -> 正規化済みactive問題配列（遅延ロード）
    unitFilter: "all",
    subunitFilter: "all",
    selectedQuestions: new Map(), // questionId -> {fieldId, questionId}

    // 管理Phase M-1: 保存済みTestSet一覧・アーカイブ機能用の状態。
    // 生徒の学習フロー・問題選択状態とは独立して持つ。
    savedTestSets: [], // 現在選択中のschoolId/gradeId/academicYearIdに対応するactive一覧
    savedTestSetsLoading: false,
    savedTestSetsError: "",
    confirmingArchiveTestSetId: "", // 非表示確認UIを表示中のtestSetId（空なら非表示）
    archivingTestSetId: "" // GAS通信中のtestSetId（二重クリック防止用）
  };
}

/**
 * 4月始まりの学年度をAY<開始暦年>形式で算出する（domain-model-v1.md 3.17節）。
 * @param {Date} [date]
 * @returns {string}
 */
export function computeCurrentAcademicYearId(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  return `AY${startYear}`;
}

/**
 * 選択中のquestionIdを追加/削除する（フィールド・フィルタ変更をまたいで保持される）。
 * @param {Object} teacherState
 * @param {string} fieldId
 * @param {string} questionId
 * @param {boolean} isSelected
 */
export function setQuestionSelected(teacherState, fieldId, questionId, isSelected) {
  if (isSelected) {
    teacherState.selectedQuestions.set(questionId, { fieldId, questionId });
  } else {
    teacherState.selectedQuestions.delete(questionId);
  }
}

/**
 * @param {Object} teacherState
 * @returns {Array<TeacherQuestionRef>}
 */
export function getSelectedQuestionList(teacherState) {
  return Array.from(teacherState.selectedQuestions.values());
}

/**
 * 教科ごとの選択数を集計する（保存前確認表示用）。
 * @param {Object} teacherState
 * @returns {Record<string, number>}
 */
export function getSelectedCountByField(teacherState) {
  const counts = {};
  teacherState.selectedQuestions.forEach((ref) => {
    counts[ref.fieldId] = (counts[ref.fieldId] || 0) + 1;
  });
  return counts;
}
