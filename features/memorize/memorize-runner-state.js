// features/memorize/memorize-runner-state.js
//
// 暗記モード（sourceType="memorize"）のRound進行状態のみを保持する、純粋なデータ構造。
// DOM・GAS通信・既存quiz state（core/state.js）・TestSet runnerState
// （features/test-set-runner/test-set-runner-state.js）のいずれにも依存しない。
//
// 【TestSet runnerとの分離（暗記モード-1 M1-1の最重要方針）】
// TestSetのrunnerStateへmemorize用のフィールド・phaseを追加することはしない。
// 同一のモジュール内シングルトンを共有すると、TestSet実行中と暗記モード実行中が
// 相互に状態を汚染し得るため、暗記モードは専用のstateを持つ（設計パターンだけを
// test-set-runner-state.jsから踏襲する）。
//
// 【questionId中心で保持する理由】
// question object（問題文・選択肢・解説等）はcore/state.jsのstate.quiz側が正本であり、
// runnerはquestionIdの集合とRound番号だけを持つ。問題データの二重管理を避け、
// 「runner＝Round連鎖の管理」「quiz/data層＝問題の実体と出題順」という責務分離を保つ。

/**
 * 暗記モードのAttemptへ常に用いるsourceType（暗記モード-0で確立した契約値）。
 * 呼び出し側（app.js等）が文字列リテラルを各所へ散らさないよう、唯一の定義元とする。
 * 参照: docs/specification/domain-model-v1.md 3.11.6節
 */
export const MEMORIZE_SOURCE_TYPE = "memorize";

/**
 * @typedef {Object} MemorizeRoundResult
 * @property {number} round - そのRoundのreviewRound（1以上）
 * @property {number} totalCount - そのRoundの出題数
 * @property {number} wrongCount - そのRoundで次Round対象になった問題数
 */

/**
 * @typedef {Object} MemorizeRunnerState
 * @property {boolean} active - 暗記run実行中かどうか
 * @property {string} runId - 暗記run 1回を一意に識別するID（全Roundで不変）
 * @property {number} currentRound - 現在のRound番号（=Attempt.reviewRound、1以上）
 * @property {string} fieldId - 科目キー（単一fieldIdのみ。QuestionSetの単一fieldId制約を維持）
 * @property {string} unit - 単元（任意。空文字＝単元を限定していない）
 * @property {string[]|null} initialQuestionIds - Round1の対象集合。
 *   null＝不明（Round2以降からのrestoreでは復元できないため）
 * @property {string[]} currentQuestionIds - 現在のRoundの対象集合
 * @property {MemorizeRoundResult[]} roundResults - 完了した各Roundの件数記録
 *   （完了画面の表示に必要な最小限のみ。問題の実体・正誤の詳細はAnswerRecord側が正本）
 */

/**
 * @returns {MemorizeRunnerState} 暗記モードrunnerの初期state（非実行中）
 */
export function createMemorizeRunnerState() {
  return {
    active: false,
    runId: "",
    currentRound: 0,
    fieldId: "",
    unit: "",
    initialQuestionIds: /** @type {string[]|null} */ (null),
    currentQuestionIds: /** @type {string[]} */ ([]),
    roundResults: /** @type {MemorizeRoundResult[]} */ ([])
  };
}
