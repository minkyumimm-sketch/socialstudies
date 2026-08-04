// features/question-set/question-set-service.js
//
// QuestionSetLoader（CSV→QuestionSet生成）とQuestionSetRepository（永続化）を橋渡しするService層。
// Repositoryへ直接アクセスするのはこのServiceだけ、という方針
// （features/history/attempt-service.js・features/history/answer-record-service.jsと同じ思想）。
//
// 責務は「QuestionSet生成（Loaderへ委譲） → Repository保存 → Repository取得」の橋渡しのみ。
//   - features/question-set/question-set-loader.js の loadQuestionSet()（CSV読込・正規化・
//     QuestionSet生成）はそのまま再利用し、重複実装はしない。CSV読込ロジック自体はLoaderの
//     責務のまま変更しない（Loader内からRepositoryを呼ぶこともしない）。
//   - features/repository/question-set-repository.js の createQuestionSetRepository()（永続化）
//     もそのまま再利用する。
//
// モジュール読み込み時に既定のQuestionSetRepositoryインスタンス（既定でMemoryStorageを使う。
// features/storage/memory-storage.js参照）を1つ保持し、各関数はそれを暗黙に利用する。
// テストや将来のStorage差し替え（GasStorage等。features/storage/gas-storage.js参照）に備え、
// 各関数の最後の引数で明示的にRepositoryインスタンスを渡すこともできる
// （attempt-service.js・answer-record-service.jsと同じ思想）。
//
// 公開APIはcreateQuestionSet / saveQuestionSet / loadQuestionSet / loadQuestionSetsの4つのみ。
// Attempt・AnswerRecordへの責務追加は行わない（features/history/配下へは一切importしない）。

import { loadQuestionSet as generateQuestionSetFromCsv } from "./question-set-loader.js";
import { createQuestionSetRepository } from "../repository/question-set-repository.js";

const defaultRepository = createQuestionSetRepository();

/**
 * 【QuestionSet生成】CSVからQuestionSetを生成する（保存はしない）。
 * 実処理はquestion-set-loader.jsのloadQuestionSet()にそのまま委譲する
 * （CSV読込・正規化・QuestionSet組み立てロジックの重複実装はしない）。
 *
 * @param {Object} params - question-set-loader.js の loadQuestionSet() と同じ形。
 *   fieldId・coursePurposeIdが必須（詳細はquestion-set-loader.jsのJSDoc参照）。
 * @returns {Promise<import("./question-set-model.js").QuestionSet>}
 */
export async function createQuestionSet(params = {}) {
  return generateQuestionSetFromCsv(params);
}

/**
 * 【Repository保存】QuestionSetをRepositoryへ保存する。
 * @param {import("./question-set-model.js").QuestionSet} questionSet
 * @param {ReturnType<typeof createQuestionSetRepository>} [repository] - 省略時はモジュール既定のRepositoryを使う
 * @returns {import("./question-set-model.js").QuestionSet}
 */
export function saveQuestionSet(questionSet, repository = defaultRepository) {
  return repository.save(questionSet);
}

/**
 * 【Repository取得】questionSetIdで、保存済みQuestionSetのうち最新versionを1件取得する。
 * @param {string} questionSetId
 * @param {ReturnType<typeof createQuestionSetRepository>} [repository]
 * @returns {import("./question-set-model.js").QuestionSet|null}
 */
export function loadQuestionSet(questionSetId, repository = defaultRepository) {
  return repository.findById(questionSetId);
}

/**
 * 【Repository取得】保存済みQuestionSet一覧を取得する。
 * @param {ReturnType<typeof createQuestionSetRepository>} [repository]
 * @returns {Array<import("./question-set-model.js").QuestionSet>}
 */
export function loadQuestionSets(repository = defaultRepository) {
  return repository.findAll();
}
