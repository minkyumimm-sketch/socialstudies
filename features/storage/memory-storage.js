// features/storage/memory-storage.js
//
// features/storage/storage-interface.js のメモリ内実装（MemoryStorage）。
// GAS/Google Sheets/IndexedDBにはまだ一切接続しない。
//
// Repository層はこのファイルの存在を直接意識しない構造にする
// （Repositoryのコンストラクタ引数としてStorageInterface互換オブジェクトを受け取るのみ）。
//
// 格納する値は常にプレーンなオブジェクトであることを前提とし、save/load/loadAllのいずれでも
// 浅いコピーを行うことで、呼び出し側が戻り値を書き換えても内部状態が汚染されないようにする
// （この防御コピーはメモリ参照特有の懸念であり、Storage層に集約することでRepository層の
//   重複したコピー処理を削減している）。

import { isValidStorageImplementation } from "./storage-interface.js";

/**
 * @returns {import("./storage-interface.js").StorageInterface}
 */
export function createMemoryStorage() {
  const map = new Map();

  function save(key, value) {
    const stored = { ...value };
    map.set(key, stored);
    return { ...stored };
  }

  function load(key) {
    if (!map.has(key)) return null;
    return { ...map.get(key) };
  }

  function loadAll() {
    return [...map.values()].map((value) => ({ ...value }));
  }

  function deleteKey(key) {
    return map.delete(key);
  }

  function clear() {
    map.clear();
  }

  const storage = { save, load, loadAll, delete: deleteKey, clear };

  // 自己検証: MemoryStorage自身が契約を満たしていることを生成時に確認する
  // （将来の実装ミス・リファクタ時の取りこぼしを早期に検知するための安全策）。
  if (!isValidStorageImplementation(storage)) {
    throw new Error("MemoryStorageがStorageInterfaceの契約を満たしていません。");
  }

  return storage;
}
