// features/question-set/question-set-loader.js
//
// CSVからQuestionSetを生成するLoader。
// 責務は「CSV → Question配列 → QuestionSet生成」までであり、Repositoryへの保存は行わない
// （保存はfeatures/repository/question-set-repository.jsの責務。本Loaderはそれを呼び出さない）。
//
// 既存のCSV読込・正規化処理をそのまま再利用し、CSVパーサは新規実装しない:
//   - core/question-loader.js の loadQuestions()（CSVパーサ本体）
//   - core/question-normalizer.js の normalizeQuestion()
//   - config/subjects.js の SUBJECT_CONFIG（fieldId → csvPathの解決）
//   - config/course-purposes.js の buildQuestionSetId()（questionSetIdの既定値生成）
//
// 現段階ではQuestionSetの構成要素のうち fieldId / coursePurposeId / questionIds のみを扱う。
// QuestionSetVersionの版管理（構成変更時のバージョン運用等）は別タスクで対応する
// （今回はすべて既定のversion=1として生成する）。
// coursePurposeIdはCSV側に列が存在しないため、呼び出し側が明示的に指定する
// （docs/specification/domain-model-v1.md 2.2節のとおり、既存CSVへの列追加は行わない）。
//
// 【Task11】coursePurposeIdを正式な必須項目として扱う。createQuestionSetFromQuestions()の
// 入口でisValidCoursePurposeId()（config/course-purposes.js、重複実装しない）による検証を行い、
// 不正・未指定の場合は明確なエラーで停止する。この検証はbuildQuestionSetId()の呼び出しより
// 前に行うため、不正なcoursePurposeIdのままquestionSetIdが生成されることも構造的に防げる
// （loadQuestionSet()/loadQuestionSets()は内部でcreateQuestionSetFromQuestions()を呼ぶため、
//   この1箇所の検証で3つの公開APIすべてに適用される）。
//
// loadQuestions()はfetch()ベースであり、ブラウザ（実際のアプリの実行環境）では
// 相対パスがページのオリジンに対して解決される。Node単体でfile://等から直接fetchすることは
// 想定していない（実行環境の前提を変えないため、本Loaderでもfetchベースのまま扱う）。

import { loadQuestions } from "../../core/question-loader.js";
import { normalizeQuestion } from "../../core/question-normalizer.js";
import { SUBJECT_CONFIG } from "../../config/subjects.js";
import { buildQuestionSetId, isValidCoursePurposeId } from "../../config/course-purposes.js";
import { createQuestionSet } from "./question-set-model.js";

/**
 * 指定したfieldIdのCSVを読み込み、正規化したQuestion配列を返す内部ヘルパー。
 * デフォルトでは status === "active" の問題のみを対象にする
 * （filters/filter-manager.jsと同じ「activeのみ許可」のホワイトリスト方針。
 *   docs/architecture/ls-total-test-system-design-v1.md 5.4節）。
 *
 * @param {string} fieldId
 * @param {{ includeInactive?: boolean }} [options]
 * @returns {Promise<Array<Object>>}
 */
async function loadNormalizedQuestions(fieldId, options = {}) {
  const subjectConfig = SUBJECT_CONFIG[fieldId];

  if (!subjectConfig) {
    throw new Error(`fieldId="${fieldId}"はSUBJECT_CONFIGに存在しません。`);
  }

  const rawRows = await loadQuestions(subjectConfig.csvPath);
  const normalized = rawRows.map((row) => normalizeQuestion(row, fieldId));

  if (options.includeInactive) {
    return normalized;
  }

  return normalized.filter((question) => question.status === "active");
}

/**
 * 正規化済みQuestion配列からQuestionSetを生成する。
 * Question本体はQuestionSetに含めず、questionIdの一覧のみを抽出して保持する
 * （features/question-set/question-set-model.jsの設計方針どおり）。
 *
 * @param {Array<Object>} questions - normalizeQuestion() 済みQuestion配列
 * @param {Partial<import("./question-set-model.js").QuestionSet>} [questionSetFields] - questionIds以外のQuestionSetフィールド（coursePurposeIdは必須）
 * @returns {import("./question-set-model.js").QuestionSet}
 * @throws {Error} coursePurposeIdが未指定、またはCOURSE_PURPOSE_CONFIGに存在しない値の場合
 */
export function createQuestionSetFromQuestions(questions, questionSetFields = {}) {
  const questionIds = (Array.isArray(questions) ? questions : [])
    .map((question) => question?.questionId)
    .filter(Boolean);

  const fieldId = questionSetFields.fieldId ?? "";
  const coursePurposeId = questionSetFields.coursePurposeId ?? "";

  if (!isValidCoursePurposeId(coursePurposeId)) {
    throw new Error(
      `coursePurposeId="${coursePurposeId}"は有効な値ではありません。config/course-purposes.jsのCOURSE_PURPOSE_CONFIG（regular_exam / entrance_exam）のいずれかを指定してください。`
    );
  }

  const questionSetId =
    questionSetFields.questionSetId || buildQuestionSetId(fieldId, coursePurposeId, questionSetFields.slug || "all");

  return createQuestionSet({
    ...questionSetFields,
    questionSetId,
    fieldId,
    coursePurposeId,
    questionIds
  });
}

/**
 * 指定したfieldId（必須）のCSVから1件のQuestionSetを生成する。
 * questionIdsを指定した場合は、そのfieldIdの問題のうち一致するものだけに絞り込む。
 * 指定しない場合は、そのfieldIdの（既定ではactive状態の）全問題を対象にする。
 *
 * @param {Object} params
 * @param {string} params.fieldId
 * @param {string} params.coursePurposeId - 必須。regular_exam / entrance_exam のいずれか（config/course-purposes.js参照）
 * @param {string[]} [params.questionIds] - 指定した場合、この一覧に含まれる問題のみに絞り込む
 * @param {boolean} [params.includeInactive] - trueの場合、active以外のstatusも対象に含める
 * @param {string} [params.questionSetId] - 省略時は buildQuestionSetId() で自動生成する
 * @param {string} [params.slug] - questionSetId自動生成時に使う識別子（省略時 "all"）
 * @param {string} [params.title]
 * @param {string} [params.description]
 * @param {string} [params.schoolId]
 * @param {string} [params.gradeId]
 * @param {boolean} [params.isPublished]
 * @returns {Promise<import("./question-set-model.js").QuestionSet>}
 * @throws {Error} fieldId未指定、またはcoursePurposeIdが不正な場合（createQuestionSetFromQuestions()参照）
 */
export async function loadQuestionSet(params = {}) {
  const { fieldId, coursePurposeId, questionIds, includeInactive, ...questionSetFields } = params;

  if (!fieldId) {
    throw new Error("loadQuestionSet()にはfieldIdが必要です。");
  }

  const normalizedQuestions = await loadNormalizedQuestions(fieldId, { includeInactive });

  const targetQuestions =
    Array.isArray(questionIds) && questionIds.length > 0
      ? normalizedQuestions.filter((question) => questionIds.includes(question.questionId))
      : normalizedQuestions;

  return createQuestionSetFromQuestions(targetQuestions, {
    ...questionSetFields,
    fieldId,
    coursePurposeId
  });
}

/**
 * 複数のQuestionSet定義（loadQuestionSet()と同じ形のパラメータの配列）から、
 * まとめて複数のQuestionSetを生成する。
 *
 * @param {Array<Object>} definitions - loadQuestionSet()に渡すparamsオブジェクトの配列
 * @returns {Promise<Array<import("./question-set-model.js").QuestionSet>>}
 */
export async function loadQuestionSets(definitions = []) {
  const list = Array.isArray(definitions) ? definitions : [];
  return Promise.all(list.map((definition) => loadQuestionSet(definition)));
}
