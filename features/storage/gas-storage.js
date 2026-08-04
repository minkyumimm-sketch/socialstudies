// features/storage/gas-storage.js
//
// features/storage/storage-interface.js のGAS（Google Apps Script）向け実装の器（Task14-4）。
// 今回は「Repository層を一切変更せずに永続化先を差し替えられる」というDIの土台のみを用意する。
// 実際のGAS通信（fetch/postToGas等）・Apps Script側の実装・既存の生徒管理GASとの接続は
// 一切行わない（本タスクのスコープ外）。
//
// features/storage/memory-storage.js と同じ形（createXxxStorage()がStorageInterface互換の
// オブジェクトを返す）にすることで、Repository側の
// createAttemptRepository(storage) へそのまま差し替え注入できるようにする
// （Repository・AttemptServiceの公開APIは一切変更しない）。
//
// save/load/loadAll/delete/clearは全て未実装で、呼び出すと Error("Not implemented") を投げる。

import { isValidStorageImplementation } from "./storage-interface.js";

/**
 * @returns {import("./storage-interface.js").StorageInterface}
 */
export function createGasStorage() {
  function save(key, value) {
    throw new Error("Not implemented");
  }

  function load(key) {
    throw new Error("Not implemented");
  }

  function loadAll() {
    throw new Error("Not implemented");
  }

  function deleteKey(key) {
    throw new Error("Not implemented");
  }

  function clear() {
    throw new Error("Not implemented");
  }

  const storage = { save, load, loadAll, delete: deleteKey, clear };

  // 自己検証: GasStorage自身がStorageInterfaceの契約（5メソッドの存在）を満たしていることを
  // 生成時に確認する（メソッドの中身がNot implementedであることとは別に、形が正しいかを検証する。
  // features/storage/memory-storage.js と同じ安全策）。
  if (!isValidStorageImplementation(storage)) {
    throw new Error("GasStorageがStorageInterfaceの契約を満たしていません。");
  }

  return storage;
}
