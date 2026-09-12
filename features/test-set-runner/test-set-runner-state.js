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
    results: [], // [{fieldId, correct, total, initialWrongQuestionIds}] グループ完了ごとに追加
    // Phase3D-4B-1: TestSet全group誤答復習（review phase）のための状態。
    // ここで型を追加するのみで、実際にreview Attemptを開始する配線は3D-4B-2で行う。
    phase: "groups", // "groups" | "review"
    reviewGroups: /** @type {TestSetGroup[]} */ ([]),
    currentReviewIndex: -1,
    reviewResults: [], // [{fieldId, correct, total, initialWrongQuestionIds}] 復習グループ完了ごとに追加
    // Phase4E-0A: TestSet実行1回を一意に識別するID（ローカル実装のみ・本番未反映）。
    // startTestSetRun()で1回だけ発行し、通常group・全review周で維持する。
    runId: "",
    // Phase4E-0A: 現在の復習周数（0=通常group中、1=review1周目…）。
    // startReviewPhase()で1へ設定する。「次周へ進むAPI」自体は準備するが、
    // Phase4E本体（全問正解まで自動反復）は本タスクではまだ配線しない。
    currentReviewRound: 0
  };
}
