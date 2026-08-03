// features/history/answer-record-model.js
//
// 参照: docs/specification/domain-model-v1.md 3.12節（AnswerRecord）
//
// AnswerRecordは「1問ごとの解答結果」を表すモデル。既存の`saveRecord`ペイロード
// （services/student-service.js）に相当する将来のデータ形だが、今回はモデル定義のみで
// GAS通信・実際の保存処理には接続しない。
// attemptId + questionId の複合キーで一意性を判定する関数のみ用意する。

/**
 * @typedef {Object} AnswerRecord
 * @property {string} attemptId - 所属するAttemptのID
 * @property {string} questionId - 回答した問題のID
 * @property {string} studentId - 生徒ID
 * @property {string} fieldId - 分野（既存の科目キー、例: japan_geo）
 * @property {string} unit - 単元
 * @property {string} selectedChoice - 生徒が選択・入力した解答
 * @property {string} correctAnswer - 正解
 * @property {boolean} isCorrect - 正誤
 * @property {string|null} answeredAt - 解答日時（ISO文字列）
 * @property {number|null} responseTimeSeconds - この設問の回答所要時間（秒）
 * @property {boolean} timedOut - 制限時間切れによる解答か（設計書12.2節参照）
 */

import { toTrimmedString, toBooleanFlag, toNullableNumber } from "../common/field-helpers.js";

/**
 * @param {Partial<AnswerRecord>} [input]
 * @returns {AnswerRecord}
 */
export function createAnswerRecord(input = {}) {
  return {
    attemptId: toTrimmedString(input.attemptId),
    questionId: toTrimmedString(input.questionId),
    studentId: toTrimmedString(input.studentId),
    fieldId: toTrimmedString(input.fieldId),
    unit: toTrimmedString(input.unit),
    selectedChoice: toTrimmedString(input.selectedChoice),
    correctAnswer: toTrimmedString(input.correctAnswer),
    isCorrect: toBooleanFlag(input.isCorrect),
    answeredAt: input.answeredAt ?? null,
    responseTimeSeconds: toNullableNumber(input.responseTimeSeconds),
    timedOut: toBooleanFlag(input.timedOut)
  };
}

/**
 * AnswerRecordの一意キー（attemptId + questionId の複合キー、設計書3.12節）。
 * @param {AnswerRecord} answerRecord
 * @returns {string}
 */
export function getAnswerRecordKey(answerRecord) {
  return `${answerRecord?.attemptId ?? ""}::${answerRecord?.questionId ?? ""}`;
}
