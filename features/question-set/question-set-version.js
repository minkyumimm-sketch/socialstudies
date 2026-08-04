// features/question-set/question-set-version.js
//
// QuestionSetVersion（問題セットのバージョン管理）専用モデル。
// 参照: docs/specification/domain-model-v1.md 3.10節（QuestionSetVersion）
//
// Task4（./question-set-model.js）はQuestionSetVersionをQuestionSetへ統合した簡易実装
// だったが、本ファイルでは設計書どおり「QuestionSet → Version」という独立した履歴管理を
// 追加する。question-set-model.js は一切変更しない（追加のみで実現。Task4との互換性は
// 下記の createQuestionSetVersionFromQuestionSet() で橋渡しする）。
//
// QuestionSetVersionは「ある時点の構成（questionIds）のスナップショット」を表す、
// 不変（immutable）に扱うべきレコードとする。構成変更時は既存のVersionレコードを書き換えず、
// 必ず新しいversion番号の新しいレコードを作る（設計書3.10節「既存バージョンは変更しない」）。
//
// 保持する情報は questionSetId / version / createdAt / questionIds / description のみ。
// title・coursePurposeId・fieldId・schoolId・gradeId・isPublished等はQuestionSet（Task4）側の
// 責務として扱い、本ファイルでは持たない。
//
// 責務は「Version生成・Version検証・Version比較」のみで、Repositoryへの保存は行わない。
//
// 【Task11】Version自体はcoursePurposeIdを保持しない設計（上記のとおり）を維持しつつ、
// 「QuestionSet → Version」という橋渡しを行うcreateQuestionSetVersionFromQuestionSet()では、
// 元になるQuestionSetのcoursePurposeIdが有効であることをisValidCoursePurposeId()
// （config/course-purposes.js、重複実装しない）で検証する。coursePurposeIdが未確定の
// QuestionSetからはVersionを作れない、という形でcoursePurposeIdを実質的な必須項目として扱う。

import { toTrimmedString, toNullableNumber } from "../common/field-helpers.js";
import { isValidCoursePurposeId } from "../../config/course-purposes.js";

/**
 * @typedef {Object} QuestionSetVersion
 * @property {string} questionSetId - 対象QuestionSetのID
 * @property {number} version - バージョン番号（1始まりの整数）
 * @property {string|null} createdAt - このバージョンの作成日時（ISO文字列）
 * @property {string[]} questionIds - このバージョン時点の構成問題ID一覧
 * @property {string} description - このバージョンの説明・変更理由等
 */

function normalizeQuestionIds(questionIds) {
  if (!Array.isArray(questionIds)) return [];
  return questionIds.map((id) => toTrimmedString(id)).filter(Boolean);
}

/**
 * 【Version生成】QuestionSetVersionを生成する。
 * @param {Partial<QuestionSetVersion>} [input]
 * @returns {QuestionSetVersion}
 */
export function createQuestionSetVersion(input = {}) {
  return {
    questionSetId: toTrimmedString(input.questionSetId),
    version: toNullableNumber(input.version) ?? 1,
    createdAt: input.createdAt ?? null,
    questionIds: normalizeQuestionIds(input.questionIds),
    description: toTrimmedString(input.description)
  };
}

/**
 * Task4のQuestionSet（./question-set-model.js の createQuestionSet() で生成したオブジェクト）
 * から、対応するQuestionSetVersionスナップショットを作る。question-set-model.js は
 * importしない（プロパティのみを見る疎結合設計。Repository/Storage層と同じ方針）。
 * Task4との互換性維持のためのブリッジ関数。
 *
 * @param {import("./question-set-model.js").QuestionSet} questionSet - coursePurposeIdが有効な値である必要がある
 * @param {{ description?: string, createdAt?: string }} [overrides]
 * @returns {QuestionSetVersion}
 * @throws {Error} questionSetのcoursePurposeIdが未指定、またはCOURSE_PURPOSE_CONFIGに存在しない値の場合
 */
export function createQuestionSetVersionFromQuestionSet(questionSet, overrides = {}) {
  if (!isValidCoursePurposeId(questionSet?.coursePurposeId)) {
    throw new Error(
      `元になるQuestionSetのcoursePurposeId="${questionSet?.coursePurposeId}"は有効な値ではありません。coursePurposeIdが確定したQuestionSetからのみVersionを生成できます。`
    );
  }

  return createQuestionSetVersion({
    questionSetId: questionSet?.questionSetId,
    version: questionSet?.version,
    questionIds: questionSet?.questionIds,
    description: overrides.description ?? questionSet?.description,
    createdAt: overrides.createdAt ?? questionSet?.createdAt
  });
}

/**
 * 【Version検証】QuestionSetVersion単体の妥当性を検証する。
 * QuestionSet全体の妥当性（question-set-model.js の validateQuestionSet）とは責務が異なり、
 * ここではVersionレコード自身が持つ項目（questionSetId/version/questionIds）の形式のみを見る。
 *
 * @param {QuestionSetVersion} questionSetVersion
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateQuestionSetVersion(questionSetVersion) {
  const errors = [];

  if (!questionSetVersion?.questionSetId) {
    errors.push("questionSetIdが空です。");
  }

  if (!Number.isInteger(questionSetVersion?.version) || questionSetVersion.version < 1) {
    errors.push("versionは1以上の整数である必要があります。");
  }

  if (!Array.isArray(questionSetVersion?.questionIds) || questionSetVersion.questionIds.length === 0) {
    errors.push("questionIdsが空です。QuestionSetVersionは最低1件のquestionIdを持つ必要があります。");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 【Version生成／比較の起点】既存のQuestionSetVersionから、次のバージョンを生成する。
 * 引数のpreviousVersionは一切変更せず（ミューテートしない）、常に新しいオブジェクトを返す
 * （設計書3.10節「既存バージョンは変更しない」を実装レベルで担保する中心的な関数）。
 *
 * @param {QuestionSetVersion} previousVersion
 * @param {{ questionIds?: string[], description?: string, createdAt?: string }} [changes] - 新バージョンでの変更内容
 * @returns {QuestionSetVersion}
 */
export function incrementVersion(previousVersion, changes = {}) {
  if (!previousVersion?.questionSetId) {
    throw new Error("incrementVersion()には有効なQuestionSetVersion（questionSetId必須）が必要です。");
  }

  return createQuestionSetVersion({
    questionSetId: previousVersion.questionSetId,
    version: (toNullableNumber(previousVersion.version) ?? 0) + 1,
    questionIds: changes.questionIds ?? previousVersion.questionIds,
    description: changes.description ?? previousVersion.description,
    createdAt: changes.createdAt ?? null
  });
}

/**
 * 【Version比較】指定したQuestionSetVersionが、渡されたバージョン群の中で最新（最大version）かを判定する。
 * versionsに異なるquestionSetIdのレコードが混ざっていても、同一questionSetIdのものだけを
 * 対象に比較する。
 *
 * @param {QuestionSetVersion} questionSetVersion
 * @param {QuestionSetVersion[]} versions - 比較対象のQuestionSetVersion群
 * @returns {boolean}
 */
export function isLatestVersion(questionSetVersion, versions) {
  if (!questionSetVersion?.questionSetId) return false;

  const sameSet = (Array.isArray(versions) ? versions : []).filter(
    (v) => v?.questionSetId === questionSetVersion.questionSetId
  );

  if (sameSet.length === 0) return true;

  const maxVersion = Math.max(...sameSet.map((v) => v.version ?? 0));
  return questionSetVersion.version >= maxVersion;
}
