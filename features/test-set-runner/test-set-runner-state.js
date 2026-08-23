// features/test-set-runner/test-set-runner-state.js
//
// TestSet実行中の状態（グループ分割・進行位置・各グループ結果）のみを保持する
// 純粋なデータ構造。DOM・GAS通信・既存quiz state（core/state.js）へは一切依存しない。

/**
 * @typedef {Object} TestSetGroup
 * @property {string} fieldId
 * @property {string[]} questionIds
 */

/**
 * @returns {Object} TestSetRunnerの初期state（非実行中）
 */
export function createRunnerState() {
  return {
    active: false,
    testSetLabel: "",
    testSetId: "",
    groups: /** @type {TestSetGroup[]} */ ([]),
    currentGroupIndex: -1,
    results: [] // [{fieldId, correct, total}] グループ完了ごとに追加
  };
}
