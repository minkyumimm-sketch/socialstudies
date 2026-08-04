// features/repository/attempt-repository.js
//
// Attemptの永続化方法を隠蔽するRepository。内部の保存先はStorageInterface
// （features/storage/storage-interface.js）互換のオブジェクトに委譲する。
// デフォルトはMemoryStorageだが、コンストラクタ引数で任意のStorageInterface実装に
// 差し替え可能にしてある（question-set-repository.jsと同じ方針）。
// 公開API（save/findById/findByStudent/findByQuestionSet/delete）は不変。
//
// ドメインモデル（features/history/attempt-model.js）へは一切importしない。
//
// 保存キーはattemptId単体（QuestionSetと異なりバージョン概念を持たないため複合キー不要）。

import { createMemoryStorage } from "../storage/memory-storage.js";

/**
 * @param {import("../storage/storage-interface.js").StorageInterface} [storage]
 */
export function createAttemptRepository(storage = createMemoryStorage()) {
  function save(attempt) {
    if (!attempt?.attemptId) {
      throw new Error("attemptIdが無いAttemptは保存できません。");
    }

    return storage.save(attempt.attemptId, attempt);
  }

  function findById(attemptId) {
    return storage.load(attemptId);
  }

  function findByStudent(studentId) {
    return storage.loadAll().filter((record) => record.studentId === studentId);
  }

  /**
   * versionを指定した場合はそのバージョンのAttemptのみ、省略した場合は
   * 該当questionSetIdの全バージョンのAttemptを返す。
   */
  function findByQuestionSet(questionSetId, questionSetVersion) {
    return storage
      .loadAll()
      .filter(
        (record) =>
          record.questionSetId === questionSetId &&
          (questionSetVersion == null || record.questionSetVersion === questionSetVersion)
      );
  }

  function deleteById(attemptId) {
    return storage.delete(attemptId);
  }

  return {
    save,
    findById,
    findByStudent,
    findByQuestionSet,
    delete: deleteById
  };
}
