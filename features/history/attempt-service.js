// features/history/attempt-service.js
//
// AttemptRepositoryのラッパー（Service層）。
// 「Attempt生成 → Repository保存 → Repository取得」のみを担当する。
//
// 将来のUI層はこのServiceを経由してAttemptを扱い、
// features/repository/attempt-repository.js へ直接アクセスしないことを前提とする
// （Repositoryの存在自体をUI側から隠蔽する窓口）。
//
// 内部では既存コードをそのまま再利用し、重複実装はしない:
//   - features/history/attempt-model.js の createAttempt()（Attempt生成）
//   - features/repository/attempt-repository.js の createAttemptRepository()（永続化）
//
// モジュール読み込み時に既定のAttemptRepositoryインスタンス（既定でMemoryStorageを使う。
// features/storage/memory-storage.js参照）を1つ保持し、各関数はそれを暗黙に利用する。
// テストや将来のRepository差し替え（例: GAS版Repositoryの注入）に備え、各関数の最後の引数で
// 明示的にRepositoryインスタンスを渡すこともできる
// （features/repository/*.js自体がStorageを差し替え可能にしているのと同じ思想）。
//
// 責務はAttemptの生成・保存・取得のみ。UI・Loader・Version・Storageへの責務追加は行わない。
// questionSetId/questionSetVersionはAttemptモデル（Task5）が既に持つ単純な識別子として
// そのまま扱うのみで、features/question-set/配下のファイルへは一切importしない。

import { createAttempt as buildAttempt } from "./attempt-model.js";
import { createAttemptRepository } from "../repository/attempt-repository.js";

const defaultRepository = createAttemptRepository();

/**
 * 【Attempt生成】Attemptを生成する（保存はしない）。
 * @param {Partial<import("./attempt-model.js").Attempt>} [input]
 * @returns {import("./attempt-model.js").Attempt}
 */
export function createAttempt(input = {}) {
  return buildAttempt(input);
}

/**
 * 【Repository保存】AttemptをRepositoryへ保存する。
 * @param {import("./attempt-model.js").Attempt} attempt
 * @param {ReturnType<typeof createAttemptRepository>} [repository] - 省略時はモジュール既定のRepositoryを使う
 * @returns {import("./attempt-model.js").Attempt}
 */
export function saveAttempt(attempt, repository = defaultRepository) {
  return repository.save(attempt);
}

/**
 * 【Repository取得】attemptIdでAttemptを1件取得する。
 * @param {string} attemptId
 * @param {ReturnType<typeof createAttemptRepository>} [repository]
 * @returns {import("./attempt-model.js").Attempt|null}
 */
export function loadAttempt(attemptId, repository = defaultRepository) {
  return repository.findById(attemptId);
}

/**
 * 【Repository取得】studentIdに紐づくAttempt一覧を取得する。
 * @param {string} studentId
 * @param {ReturnType<typeof createAttemptRepository>} [repository]
 * @returns {Array<import("./attempt-model.js").Attempt>}
 */
export function loadAttemptsByStudent(studentId, repository = defaultRepository) {
  return repository.findByStudent(studentId);
}

/**
 * 【Repository取得】questionSetId（+任意のquestionSetVersion）に紐づくAttempt一覧を取得する。
 * @param {string} questionSetId
 * @param {number} [questionSetVersion] - 省略時は全バージョンのAttemptを対象にする
 * @param {ReturnType<typeof createAttemptRepository>} [repository]
 * @returns {Array<import("./attempt-model.js").Attempt>}
 */
export function loadAttemptsByQuestionSet(questionSetId, questionSetVersion, repository = defaultRepository) {
  return repository.findByQuestionSet(questionSetId, questionSetVersion);
}
