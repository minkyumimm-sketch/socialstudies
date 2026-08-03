// features/school/school-model.js
//
// 参照: docs/specification/domain-model-v1.md 3.2節（School）
//
// 学校情報のSingle Source of Truthも生徒管理システム（外部）であり、
// 学習アプリ側は複製を持たない。学校名の表記ゆれを避けるため、
// テスト範囲等のキーには必ず schoolId を使い、学校名は表示専用とする
// （設計書9.2節「学校名の表記揺れ対策」）。

/**
 * @typedef {Object} SchoolRef
 * @property {string} schoolId - 生徒管理システムが発行する一意なID
 * @property {string} displayName - 学校名（表示専用。キーとして使わない）
 */

import { toTrimmedString } from "../common/field-helpers.js";

/**
 * @param {Partial<SchoolRef>} [input]
 * @returns {SchoolRef}
 */
export function createSchoolRef(input = {}) {
  return {
    schoolId: toTrimmedString(input.schoolId),
    displayName: toTrimmedString(input.displayName)
  };
}

/**
 * @param {SchoolRef} schoolRef
 * @returns {boolean}
 */
export function isValidSchoolRef(schoolRef) {
  return Boolean(schoolRef && schoolRef.schoolId);
}
