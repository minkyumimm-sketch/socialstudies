// features/student/student-model.js
//
// 参照: docs/specification/domain-model-v1.md 3.1節（Student）
//
// 生徒情報のSingle Source of Truthは既存の生徒管理システム（外部GAS/Sheets）であり、
// 学習アプリ側は生徒情報を複製・永続保存しない（設計書の確定方針）。
// そのため本モデルは「生徒そのもの」ではなく、外部の生徒情報への参照
// （studentIdを主キーとする軽量な値オブジェクト）として定義する。
// 表示名・学校・学年はUI表示等のための一時的なキャッシュ値として保持できるが、
// これらの値の正本は常に外部の生徒管理システム側にある。
//
// 今回のタスクでは、実際にstudentIdを使った通信・状態管理は開始しない
// （モデルの形を定義するのみ）。

/**
 * @typedef {Object} StudentRef
 * @property {string} studentId - 生徒管理システムが発行する一意なID
 * @property {string} displayName - 表示名（キャッシュ値。正本は生徒管理システム）
 * @property {string} schoolId - 在籍校ID（キャッシュ値）
 * @property {string} gradeId - 学年ID（キャッシュ値）
 * @property {boolean} active - 在籍状態（キャッシュ値）
 */

import { toTrimmedString, toBooleanFlag } from "../common/field-helpers.js";

/**
 * @param {Partial<StudentRef>} [input]
 * @returns {StudentRef}
 */
export function createStudentRef(input = {}) {
  return {
    studentId: toTrimmedString(input.studentId),
    displayName: toTrimmedString(input.displayName),
    schoolId: toTrimmedString(input.schoolId),
    gradeId: toTrimmedString(input.gradeId),
    active: toBooleanFlag(input.active)
  };
}

/**
 * @param {StudentRef} studentRef
 * @returns {boolean}
 */
export function isValidStudentRef(studentRef) {
  return Boolean(studentRef && studentRef.studentId);
}
