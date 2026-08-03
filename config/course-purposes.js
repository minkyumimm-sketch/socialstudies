// config/course-purposes.js
//
// 参照:
//   - docs/specification/domain-model-v1.md 3.5節（CoursePurpose）
//   - docs/architecture/ls-total-test-system-design-v1.md 3.4節・19.2節（識別子設計）
//   - CLAUDE.md ⑨ 命名規則
//
// 学習目的（定期テスト対策 / 都立高校入試対策）の正式なマスタ定義。
// 正式名称は coursePurposeId とする（studyType は不採用、CLAUDE.md ⑨で確定済み）。
//
// config/subjects.js・config/modes.js・config/era-choices.js と同じ
// 「静的マスタ定数（キー→表示名）」という性質を持つため、features/ ではなく
// config/ に配置する（採用理由の詳細は完了後報告に記載）。
//
// 今回はマスタ定義のみで、UI・CSV・GASのいずれにも接続していない。

export const COURSE_PURPOSE_CONFIG = {
  regular_exam: {
    label: "定期テスト対策"
  },
  entrance_exam: {
    label: "都立高校入試対策"
  }
};

/**
 * @param {string} coursePurposeId
 * @returns {boolean}
 */
export function isValidCoursePurposeId(coursePurposeId) {
  return Object.prototype.hasOwnProperty.call(COURSE_PURPOSE_CONFIG, coursePurposeId);
}

/**
 * @param {string} coursePurposeId
 * @returns {string} 表示名。未知のIDの場合は空文字列。
 */
export function getCoursePurposeLabel(coursePurposeId) {
  return COURSE_PURPOSE_CONFIG[coursePurposeId]?.label ?? "";
}

/**
 * questionSetId の命名規則 `<fieldId>__<coursePurposeId>__<slug>`
 * （docs/specification/domain-model-v1.md 2.1節）を組み立てる共通ユーティリティ。
 * QuestionSet実装（別タスク）が始まった際に重複実装を避けるため、ここに用意する。
 *
 * @param {string} fieldId
 * @param {string} coursePurposeId
 * @param {string} slug
 * @returns {string}
 */
export function buildQuestionSetId(fieldId, coursePurposeId, slug) {
  return [fieldId, coursePurposeId, slug].map((part) => String(part ?? "").trim()).join("__");
}
