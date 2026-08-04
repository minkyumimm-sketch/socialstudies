// features/repository/answer-record-repository.js
//
// AnswerRecordの永続化方法を隠蔽するRepository。内部の保存先はStorageInterface
// （features/storage/storage-interface.js）互換のオブジェクトに委譲する。
// デフォルトはMemoryStorageだが、コンストラクタ引数で任意のStorageInterface実装に
// 差し替え可能にしてある（question-set-repository.jsと同じ方針）。
// 公開API（save/findByAttempt/findByQuestion/delete）は不変。
//
// ドメインモデル（features/history/answer-record-model.js）へは一切importしない。
// 複合キー生成ロジックは、モデル層のgetAnswerRecordKey()と同じ形式
// （attemptId::questionId）をこのファイル内に独立して保持する
// （Repository層をモデル層から完全に切り離すための意図的な最小限の重複）。
//
// 保存キーはattemptId + questionId の複合キー（docs/specification/domain-model-v1.md 3.12節）。

import { createMemoryStorage } from "../storage/memory-storage.js";

function buildStorageKey(attemptId, questionId) {
  return `${attemptId}::${questionId}`;
}

/**
 * @param {import("../storage/storage-interface.js").StorageInterface} [storage]
 */
export function createAnswerRecordRepository(storage = createMemoryStorage()) {
  function save(answerRecord) {
    if (!answerRecord?.attemptId || !answerRecord?.questionId) {
      throw new Error("attemptId/questionIdが無いAnswerRecordは保存できません。");
    }

    return storage.save(buildStorageKey(answerRecord.attemptId, answerRecord.questionId), answerRecord);
  }

  function findByAttempt(attemptId) {
    return storage.loadAll().filter((record) => record.attemptId === attemptId);
  }

  function findByQuestion(questionId) {
    return storage.loadAll().filter((record) => record.questionId === questionId);
  }

  function deleteRecord(attemptId, questionId) {
    return storage.delete(buildStorageKey(attemptId, questionId));
  }

  return {
    save,
    findByAttempt,
    findByQuestion,
    delete: deleteRecord
  };
}
