// features/repository/school-repository.js
//
// 【重要】SchoolRefの正本（Single Source of Truth）は既存の生徒管理システム（外部GAS/Sheets）。
// このRepositoryが保持するのはあくまで学習アプリ側の一時的な参照キャッシュであり、
// 学校情報そのものを新規に作成・所有するものではない
// （docs/specification/domain-model-v1.md 3.2節、features/school/school-model.jsの設計と同じ前提）。
//
// 内部の保存先はStorageInterface（features/storage/storage-interface.js）互換の
// オブジェクトに委譲する。デフォルトはMemoryStorageだが、コンストラクタ引数で
// 任意のStorageInterface実装に差し替え可能にしてある。公開API（save/findById）は不変。
//
// ドメインモデル（features/school/school-model.js）へは一切importしない。

import { createMemoryStorage } from "../storage/memory-storage.js";

/**
 * @param {import("../storage/storage-interface.js").StorageInterface} [storage]
 */
export function createSchoolRepository(storage = createMemoryStorage()) {
  function save(schoolRef) {
    if (!schoolRef?.schoolId) {
      throw new Error("schoolIdが無いSchoolRefは保存できません。");
    }

    return storage.save(schoolRef.schoolId, schoolRef);
  }

  function findById(schoolId) {
    return storage.load(schoolId);
  }

  return { save, findById };
}
