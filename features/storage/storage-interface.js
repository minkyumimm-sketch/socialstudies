// features/storage/storage-interface.js
//
// Repository層の下に位置するStorage抽象化の「契約」を定義する。
// JavaScript自体にはinterfaceが無いため、ここではJSDocによる型定義と、
// 実装がこの契約を満たしているかをダックタイピングで検証する
// isValidStorageImplementation() を提供する。
//
// 将来のGasStorage / GoogleSheetsStorage / IndexedDbStorage は、いずれも
// このファイルが定義する5メソッド（save/load/loadAll/delete/clear）を実装すれば、
// Repository層（features/repository/*.js）のコードを一切変更せずに差し替えられる。
// Repositoryの利用側は、この契約を満たすオブジェクトが渡ってくることだけを前提にし、
// 実装がメモリなのかGASなのかを一切意識しない。

/**
 * @typedef {Object} StorageInterface
 * @property {(key: string, value: any) => any} save - 指定キーで値を保存し、保存後の値を返す
 * @property {(key: string) => any|null} load - 指定キーの値を取得する。無ければnull
 * @property {() => any[]} loadAll - 保存されている全ての値を配列で取得する
 * @property {(key: string) => boolean} delete - 指定キーの値を削除する。削除できたか否かを返す
 * @property {() => void} clear - 保存されている全ての値を削除する
 */

const REQUIRED_METHODS = ["save", "load", "loadAll", "delete", "clear"];

/**
 * 渡されたオブジェクトがStorageInterfaceの契約（5メソッドすべて）を満たしているかを検証する。
 * 新しいStorage実装（GasStorage等）を追加する際の自己検証、およびRepository側での
 * 防御的チェックに利用できる。
 *
 * @param {*} storage
 * @returns {boolean}
 */
export function isValidStorageImplementation(storage) {
  if (!storage || typeof storage !== "object") return false;
  return REQUIRED_METHODS.every((method) => typeof storage[method] === "function");
}
