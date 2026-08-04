// features/repository/question-set-repository.js
//
// QuestionSetの永続化方法を隠蔽するRepository。
// 内部の保存先はStorageInterface（features/storage/storage-interface.js）互換の
// オブジェクトに委譲する。デフォルトはMemoryStorageだが、コンストラクタ引数で
// 任意のStorageInterface実装に差し替え可能にしてある
// （将来GasStorage等を渡せば、このファイルのコードは一切変更不要）。
// 公開API（save/findById/findAll/findByCoursePurpose/findBySchool/delete）は不変。
//
// ドメインモデル（features/question-set/question-set-model.js）へは一切importしない
// （Repositoryはプレーンなオブジェクトのプロパティのみを見て動作する疎結合設計）。
// Storage実装（MemoryStorageかどうか等）も呼び出し側からは一切見えない。
//
// QuestionSetは「同じquestionSetIdでもversionが異なれば別レコード」という設計
// （docs/specification/domain-model-v1.md 3.10節「既存バージョンは変更しない」）を尊重し、
// 内部の保存キーは `questionSetId::version` の複合キーとする。

import { createMemoryStorage } from "../storage/memory-storage.js";

function buildStorageKey(questionSetId, version) {
  return `${questionSetId}::${version}`;
}

/**
 * @param {import("../storage/storage-interface.js").StorageInterface} [storage]
 */
export function createQuestionSetRepository(storage = createMemoryStorage()) {
  function save(questionSet) {
    if (!questionSet?.questionSetId) {
      throw new Error("questionSetIdが無いQuestionSetは保存できません。");
    }

    return storage.save(buildStorageKey(questionSet.questionSetId, questionSet.version), questionSet);
  }

  /**
   * 指定したquestionSetIdのうち、最新（最大）のversionを1件返す。
   * 特定バージョンが必要な場合はfindAll()の結果を呼び出し側で絞り込むこと。
   */
  function findById(questionSetId) {
    const matches = storage.loadAll().filter((record) => record.questionSetId === questionSetId);
    if (matches.length === 0) return null;
    return matches.reduce((latest, current) => (current.version > latest.version ? current : latest));
  }

  function findAll() {
    return storage.loadAll();
  }

  function findByCoursePurpose(coursePurposeId) {
    return storage.loadAll().filter((record) => record.coursePurposeId === coursePurposeId);
  }

  /**
   * schoolIdが空のQuestionSetは「学校を問わず共通」として扱い、指定学校向けの結果に含める
   * （features/question-set/question-set-model.js の matchesSchoolAndGrade と同じ考え方）。
   */
  function findBySchool(schoolId) {
    return storage.loadAll().filter((record) => !record.schoolId || record.schoolId === schoolId);
  }

  /**
   * versionを指定した場合はそのレコードのみ、省略した場合は該当questionSetIdの全バージョンを削除する。
   */
  function deleteById(questionSetId, version) {
    if (version != null) {
      return storage.delete(buildStorageKey(questionSetId, version));
    }

    const targets = storage.loadAll().filter((record) => record.questionSetId === questionSetId);
    targets.forEach((record) => storage.delete(buildStorageKey(record.questionSetId, record.version)));
    return targets.length > 0;
  }

  return {
    save,
    findById,
    findAll,
    findByCoursePurpose,
    findBySchool,
    delete: deleteById
  };
}
