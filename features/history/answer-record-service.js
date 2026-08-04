// features/history/answer-record-service.js
//
// AnswerRecordRepositoryのラッパー（Service層）。
// 「AnswerRecord生成 → Repository保存 → Repository取得」のみを担当する。
//
// 将来のUI層はこのServiceを経由してAnswerRecordを扱い、
// features/repository/answer-record-repository.js へ直接アクセスしないことを前提とする
// （Repositoryの存在自体をUI側から隠蔽する窓口。features/history/attempt-service.jsと同じ方針）。
//
// 内部では既存コードをそのまま再利用し、重複実装はしない:
//   - features/history/answer-record-model.js の createAnswerRecord()（AnswerRecord生成）
//   - features/repository/answer-record-repository.js の createAnswerRecordRepository()（永続化）
//
// モジュール読み込み時に既定のAnswerRecordRepositoryインスタンス（既定でMemoryStorageを使う。
// features/storage/memory-storage.js参照）を1つ保持し、各関数はそれを暗黙に利用する。
// テストや将来のRepository差し替えに備え、各関数の最後の引数で明示的にRepositoryインスタンスを
// 渡すこともできる（attempt-service.jsと同じ思想）。
//
// AnswerRecordRepository自体に単一キー取得API（findById相当）が存在しない
// （attemptId+questionIdの複合キーのため）ことに合わせ、本Serviceでも単体取得APIは持たせない。
//
// 責務はAnswerRecordの生成・保存・取得のみ。Attempt・QuestionSet・Loader・Storage・Versionへの
// 責務追加は行わない。features/history/attempt-service.js・features/question-set/配下・
// features/storage/配下のいずれへも一切importしない。

import { createAnswerRecord as buildAnswerRecord } from "./answer-record-model.js";
import { createAnswerRecordRepository } from "../repository/answer-record-repository.js";

const defaultRepository = createAnswerRecordRepository();

/**
 * 【AnswerRecord生成】AnswerRecordを生成する（保存はしない）。
 * @param {Partial<import("./answer-record-model.js").AnswerRecord>} [input]
 * @returns {import("./answer-record-model.js").AnswerRecord}
 */
export function createAnswerRecord(input = {}) {
  return buildAnswerRecord(input);
}

/**
 * 【Repository保存】AnswerRecordをRepositoryへ保存する。
 * @param {import("./answer-record-model.js").AnswerRecord} answerRecord
 * @param {ReturnType<typeof createAnswerRecordRepository>} [repository] - 省略時はモジュール既定のRepositoryを使う
 * @returns {import("./answer-record-model.js").AnswerRecord}
 */
export function saveAnswerRecord(answerRecord, repository = defaultRepository) {
  return repository.save(answerRecord);
}

/**
 * 【Repository取得】attemptIdに紐づくAnswerRecord一覧を取得する。
 * @param {string} attemptId
 * @param {ReturnType<typeof createAnswerRecordRepository>} [repository]
 * @returns {Array<import("./answer-record-model.js").AnswerRecord>}
 */
export function loadAnswerRecordsByAttempt(attemptId, repository = defaultRepository) {
  return repository.findByAttempt(attemptId);
}

/**
 * 【Repository取得】questionIdに紐づくAnswerRecord一覧を取得する。
 * @param {string} questionId
 * @param {ReturnType<typeof createAnswerRecordRepository>} [repository]
 * @returns {Array<import("./answer-record-model.js").AnswerRecord>}
 */
export function loadAnswerRecordsByQuestion(questionId, repository = defaultRepository) {
  return repository.findByQuestion(questionId);
}
