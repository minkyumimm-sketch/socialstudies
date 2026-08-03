// features/question-set/question-set-model.js
//
// 参照: docs/specification/domain-model-v1.md 3.9節（QuestionSet）・3.10節（QuestionSetVersion）
//
// 【設計書との差分（意図的な統合）】
// 設計書3.9/3.10は「QuestionSet」と「QuestionSetVersion」を別エンティティとして定義しているが、
// 本タスクの指示（保持すべき情報一覧にversion・questionIdsが含まれる）に基づき、
// バージョン情報と構成問題を1つのQuestionSetレコードに内包する単一エンティティとして実装する。
// 「構成変更時は必ずversionをインクリメントし、既存バージョンは変更しない」という
// 設計書3.10節の確定方針は、この統合後の実装でも運用ルールとして維持する
// （= version違いは別レコードとして新規作成し、既存レコードをその場で書き換えない）。
//
// QuestionSetは問題本体を一切持たない。保持するのは questionId の一覧のみであり、
// 実際の問題データ（CSV）との対応付けは questionId を通じてのみ行う
// （CSVの構造・出題ロジックには一切関与しない）。
//
// schoolId/gradeId が空文字列の場合は「学校・学年を問わず共通」を意味する設計とし、
// 学校別テスト範囲・先生配信問題など、将来の絞り込み用途にそのまま利用できるようにする。

import { toTrimmedString, toBooleanFlag, toNullableNumber } from "../common/field-helpers.js";
import { isValidCoursePurposeId } from "../../config/course-purposes.js";
import { SUBJECT_CONFIG } from "../../config/subjects.js";

/**
 * @typedef {Object} QuestionSet
 * @property {string} questionSetId - 一意なID（推奨形式: `<fieldId>__<coursePurposeId>__<slug>`、config/course-purposes.js の buildQuestionSetId 参照）
 * @property {string} coursePurposeId - `regular_exam` | `entrance_exam`（config/course-purposes.js参照）
 * @property {string} fieldId - 分野（既存の科目キー、例: japan_geo。config/subjects.jsのSUBJECT_CONFIGに存在する値のみ有効）
 * @property {string} title - 表示名
 * @property {string} description - 説明文
 * @property {number} version - 構成のバージョン（1始まり。構成変更時は新しいレコードとしてインクリメントする）
 * @property {string[]} questionIds - 構成する問題のquestionId一覧（問題本体は持たない）
 * @property {string} schoolId - 対象学校ID（空文字列 = 学校を問わず共通）
 * @property {string} gradeId - 対象学年ID（空文字列 = 学年を問わず共通）
 * @property {boolean} isPublished - 公開状態（false = 下書き、生徒には出題しない想定）
 * @property {string|null} createdAt - 作成日時（ISO文字列）
 * @property {string|null} updatedAt - 更新日時（ISO文字列）
 */

/**
 * @param {Partial<QuestionSet>} [input]
 * @returns {QuestionSet}
 */
export function createQuestionSet(input = {}) {
  return {
    questionSetId: toTrimmedString(input.questionSetId),
    coursePurposeId: toTrimmedString(input.coursePurposeId),
    fieldId: toTrimmedString(input.fieldId),
    title: toTrimmedString(input.title),
    description: toTrimmedString(input.description),
    version: toNullableNumber(input.version) ?? 1,
    questionIds: normalizeQuestionIds(input.questionIds),
    schoolId: toTrimmedString(input.schoolId),
    gradeId: toTrimmedString(input.gradeId),
    isPublished: toBooleanFlag(input.isPublished),
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? null
  };
}

function normalizeQuestionIds(questionIds) {
  if (!Array.isArray(questionIds)) return [];
  return questionIds.map((id) => toTrimmedString(id)).filter(Boolean);
}

/**
 * QuestionSetの基本的な整合性検証。
 * CSVやSVGには一切アクセスしない（questionIdの実在確認はscripts/validate-questions.mjs等、
 * 別レイヤーの責務とする）。
 *
 * @param {QuestionSet} questionSet
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateQuestionSet(questionSet) {
  const errors = [];

  if (!questionSet?.questionSetId) {
    errors.push("questionSetIdが空です。");
  }

  if (!questionSet?.fieldId) {
    errors.push("fieldIdが空です。");
  } else if (!SUBJECT_CONFIG[questionSet.fieldId]) {
    errors.push(`fieldId="${questionSet.fieldId}"はSUBJECT_CONFIGに存在しません。`);
  }

  if (!questionSet?.coursePurposeId) {
    errors.push("coursePurposeIdが空です。");
  } else if (!isValidCoursePurposeId(questionSet.coursePurposeId)) {
    errors.push(`coursePurposeId="${questionSet.coursePurposeId}"は許可された値ではありません。`);
  }

  if (!Array.isArray(questionSet?.questionIds) || questionSet.questionIds.length === 0) {
    errors.push("questionIdsが空です。QuestionSetは最低1件のquestionIdを持つ必要があります。");
  }

  if (!Number.isInteger(questionSet?.version) || questionSet.version < 1) {
    errors.push("versionは1以上の整数である必要があります。");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 指定した学校・学年に対して、このQuestionSetが適用対象かどうかを判定する。
 * schoolId/gradeIdが空のQuestionSetは「共通（全校・全学年対象）」として扱う。
 * 学校別テスト範囲・先生配信問題など、対象を絞り込みたい将来機能から利用する想定。
 *
 * @param {QuestionSet} questionSet
 * @param {{ schoolId?: string, gradeId?: string }} [target]
 * @returns {boolean}
 */
export function matchesSchoolAndGrade(questionSet, target = {}) {
  const targetSchoolId = toTrimmedString(target.schoolId);
  const targetGradeId = toTrimmedString(target.gradeId);

  const schoolMatches = !questionSet?.schoolId || questionSet.schoolId === targetSchoolId;
  const gradeMatches = !questionSet?.gradeId || questionSet.gradeId === targetGradeId;

  return schoolMatches && gradeMatches;
}

/**
 * 問題数（構成の大きさ）を返す軽量ヘルパー。
 * @param {QuestionSet} questionSet
 * @returns {number}
 */
export function getQuestionCount(questionSet) {
  return Array.isArray(questionSet?.questionIds) ? questionSet.questionIds.length : 0;
}
