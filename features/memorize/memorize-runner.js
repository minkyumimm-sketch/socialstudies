// features/memorize/memorize-runner.js
//
// 暗記モード（sourceType="memorize"）のRound連鎖だけを管理するrunner。
//
//   Round 1（対象集合すべて）
//     → そのRoundで不正解／わからないだった問題を抽出
//   Round 2
//     → さらに不正解／わからないだった問題を抽出
//   …
//   → 次Round対象0問 → 暗記完了
//
// 【責務の境界】
// - DOM操作・画面遷移・GAS通信・Attempt生成は一切行わない
//   （Attempt/AnswerRecord/progressの保存は既存のfeatures/history・features/progress側が担う）
// - question objectを保持しない。questionIdの集合とRound番号のみを持つ
//   （問題の実体・出題順の決定はquiz/data層＝core/state.js・core/question-picker.jsの責務）
// - 次Round対象の判定ロジックはmemorize-round-selector.jsへ完全に分離する
//   （将来の忘却対策・速度条件はそのファイルだけを拡張すればよい状態を維持する）
//
// 【TestSet runnerとの関係】
// features/test-set-runner/のrunnerStateは一切共有・変更しない（相互汚染防止）。
// ただし「モジュール内シングルトンを小さなAPI経由でのみ変更する」「fail-closed」
// 「runId生成を重複実装しない」という設計パターンは踏襲する。
// run identityの契約検証は、GAS側と同一ルールの正本である
// features/test-set-runner/test-set-run-identity.jsのvalidateRunIdentity()を再利用する
// （同ファイルはstateを持たない純粋関数のみで構成されており、TestSet runnerの
// 実行状態には一切触れない。暗記モード-0でmemorize分岐が追加済み）。
//
// 【暗記モード-0で確立済みの契約（変更しない）】
// - sourceType="memorize"（MEMORIZE_SOURCE_TYPE）
// - runId: 暗記run 1回を束ねる。全Roundで同一値を維持する
// - reviewRound: 1以上の整数。Round番号として使う（1 Round = 1 Attempt）
// - testSetIdは指定禁止（本runnerは一切扱わない）

import { createMemorizeRunnerState, MEMORIZE_SOURCE_TYPE } from "./memorize-runner-state.js";
import { selectNextRoundQuestionIds } from "./memorize-round-selector.js";
import { validateRunIdentity } from "../test-set-runner/test-set-run-identity.js";
import { generateRunId } from "../common/id-utils.js";

let runState = createMemorizeRunnerState();

const START_ERROR_MESSAGE = "暗記モードを開始できませんでした。";
const RESTORE_ERROR_MESSAGE = "前回の暗記モードの続きを再開できませんでした。";
const NOT_ACTIVE_ERROR_MESSAGE = "暗記モードを実行していません。";

/**
 * 全要素が「空でない文字列」で重複が無い場合のみ配列のコピーを返す（それ以外はnull）。
 * start/restoreの入口検証専用（memorize-round-selector.js側の同種チェックとは
 * 対象データが異なるため、互いに独立して安全側へ倒す）。
 *
 * @param {unknown} ids
 * @returns {string[]|null}
 */
function toStrictQuestionIdList_(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;

  const seen = new Set();
  const result = [];

  for (const id of ids) {
    if (typeof id !== "string" || id === "") return null;
    if (seen.has(id)) return null;
    seen.add(id);
    result.push(id);
  }

  return result;
}

/**
 * Round番号として妥当な値のみを数値で返す（それ以外はnull）。
 * booleanやオブジェクトがNumber()経由で1に化けるのを防ぐため、number/数値文字列のみ許容する。
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toRoundNumber_(value) {
  let numeric = null;

  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    numeric = Number(value.trim());
  }

  if (numeric === null || !Number.isInteger(numeric) || numeric < 1) return null;
  return numeric;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toTrimmedString_(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 完了時・参照用に返すplain dataを組み立てる（外部から内部stateを直接触らせない）。
 * @returns {Object}
 */
function buildRunSummary_() {
  return {
    runId: runState.runId,
    fieldId: runState.fieldId,
    unit: runState.unit,
    roundCount: runState.roundResults.length,
    // restore由来（Round2以降からの再開）ではRound1の対象集合を復元できないためnullになる。
    initialQuestionCount: runState.initialQuestionIds ? runState.initialQuestionIds.length : null,
    roundResults: runState.roundResults.map((result) => ({ ...result }))
  };
}

/**
 * 新しい暗記runを開始する（Round1）。
 *
 * runIdは本runnerが1回だけ発行し（generateRunId、attemptId等と同じ生成方式の共通実装を再利用）、
 * getMemorizeRunId()経由でAttempt開始処理へ渡す。呼び出し側が別途runIdを生成することは
 * 想定しない（GASへ送るrunIdとrunner内部のrunIdが必ず同一になることを構造的に保証する）。
 *
 * 検証に失敗した場合はrunStateを一切変更しない（実行中の別runを壊さない）。
 *
 * @param {Object} params
 * @param {string} params.fieldId - 科目キー（必須。単一fieldIdのみ）
 * @param {string} [params.unit] - 単元（任意。未指定は空文字＝単元を限定していない）
 * @param {string[]} params.questionIds - Round1の対象（1件以上・空文字禁止・重複禁止）
 * @returns {{ok:true, runId:string, round:number, questionIds:string[]}|{ok:false, errorMessage:string}}
 */
export function startMemorizeRun({ fieldId, unit = "", questionIds } = {}) {
  const trimmedFieldId = toTrimmedString_(fieldId);
  if (!trimmedFieldId) {
    return { ok: false, errorMessage: START_ERROR_MESSAGE };
  }

  const ids = toStrictQuestionIdList_(questionIds);
  if (ids === null) {
    return { ok: false, errorMessage: START_ERROR_MESSAGE };
  }

  const runId = generateRunId();
  const identity = validateRunIdentity({
    sourceType: MEMORIZE_SOURCE_TYPE,
    runId,
    reviewRound: 1
  });

  if (!identity.ok) {
    // 通常到達しない（generateRunIdは常に非空文字列を返す）。暗記モード-0の契約と
    // 万一ずれた場合に、契約違反のAttemptを開始させないための安全弁。
    console.error("startMemorizeRun: run identity契約に違反しています:", identity.errorMessage);
    return { ok: false, errorMessage: START_ERROR_MESSAGE };
  }

  runState = {
    ...createMemorizeRunnerState(),
    active: true,
    runId,
    currentRound: 1,
    fieldId: trimmedFieldId,
    unit: toTrimmedString_(unit),
    initialQuestionIds: [...ids],
    currentQuestionIds: [...ids],
    roundResults: []
  };

  return { ok: true, runId, round: 1, questionIds: [...ids] };
}

/**
 * @returns {boolean} 暗記run実行中かどうか
 */
export function isMemorizeRunnerActive() {
  return runState.active;
}

/**
 * @returns {string} 実行中の暗記runのrunId（未実行時は空文字列）。
 *   Attempt生成箇所がsourceType="memorize"のAttemptへ渡すために使う。
 */
export function getMemorizeRunId() {
  return runState.runId;
}

/**
 * @returns {number} 現在のRound番号（=Attempt.reviewRound。未実行時は0）
 */
export function getCurrentMemorizeRound() {
  return runState.currentRound;
}

/**
 * @returns {string[]} 現在のRoundの対象questionId（コピー。未実行時は空配列）
 */
export function getCurrentMemorizeQuestionIds() {
  return [...runState.currentQuestionIds];
}

/**
 * runnerの現在状態をplain dataのコピーとして返す（表示・診断・テスト用）。
 * 返り値を書き換えても内部stateには影響しない。
 *
 * @returns {import("./memorize-runner-state.js").MemorizeRunnerState}
 */
export function getMemorizeRunnerState() {
  return {
    ...runState,
    initialQuestionIds: runState.initialQuestionIds ? [...runState.initialQuestionIds] : null,
    currentQuestionIds: [...runState.currentQuestionIds],
    roundResults: runState.roundResults.map((result) => ({ ...result }))
  };
}

/**
 * 現在のRoundを完了し、次Roundへ進めるか暗記完了かを決める。
 *
 * 次Round対象の判定はmemorize-round-selector.jsへ委譲する（本関数は判定基準を持たない）。
 * 検証に失敗した場合はrunStateを一切変更しない（中途半端に進んだ状態を作らない）。
 *
 * 次Round対象が0件のときは「次Round 0問のAttempt」を作らせないため、
 * completed:trueを返したうえでrunStateを完全にresetする（前runの情報を次runへ残さない、
 * 既存のfinishReviewRun()と同じreset契約）。完了画面に必要な情報はsummaryとして返す。
 *
 * @param {Object} params
 * @param {string[]} params.wrongQuestionIds - そのRoundで不正解／わからないだった問題
 *   （呼び出し元は既存のextractQuestionIds(state.quiz.wrongQuestions)をそのまま渡せる）
 * @returns {{ok:true, completed:true, summary:Object}
 *   |{ok:true, completed:false, round:number, questionIds:string[]}
 *   |{ok:false, errorMessage:string}}
 */
export function finishMemorizeRound({ wrongQuestionIds } = {}) {
  if (!runState.active) {
    return { ok: false, errorMessage: NOT_ACTIVE_ERROR_MESSAGE };
  }

  const selected = selectNextRoundQuestionIds({
    currentQuestionIds: runState.currentQuestionIds,
    wrongQuestionIds
  });

  if (!selected.ok) {
    return { ok: false, errorMessage: selected.errorMessage };
  }

  // ここから先は成功が確定してからのみstateを変更する。
  runState.roundResults.push({
    round: runState.currentRound,
    totalCount: runState.currentQuestionIds.length,
    wrongCount: selected.questionIds.length
  });

  if (selected.questionIds.length === 0) {
    const summary = buildRunSummary_();
    runState = createMemorizeRunnerState();
    return { ok: true, completed: true, summary };
  }

  runState.currentRound += 1;
  runState.currentQuestionIds = selected.questionIds;

  return {
    ok: true,
    completed: false,
    round: runState.currentRound,
    questionIds: [...runState.currentQuestionIds]
  };
}

/**
 * 中断（ブラウザ終了・タブレット終了等）から復帰した暗記runのrunner状態を復元する。
 *
 * 入力は将来attempt_progress（domain-model-v1.md 3.12.2節）から取得できる値のみで構成する
 * （runId・reviewRound・fieldId・unit・questionIds）。Web側のresume配線（app.jsの
 * showResumeCandidate/resumeQuiz分岐）はM1-1では実装せず、本関数の単体動作のみを対象とする。
 *
 * 想起ゲート（思い出した／わからない）の途中状態は復元しない。中断した問題は
 * 同じ問題のゲート先頭からやり直す仕様（M1-0設計Gateの結論。progressへの列追加を避ける）。
 *
 * Round2以降からの復元ではRound1の対象集合を復元できないため、initialQuestionIdsは
 * null（不明）とする。推測で現在Roundの集合を初回集合として扱うことはしない。
 *
 * @param {Object} params
 * @param {string} params.runId - progress.runId（必須・空文字不可）
 * @param {number} params.reviewRound - progress.reviewRound（1以上の整数）
 * @param {string} params.fieldId - progress.fieldId（必須）
 * @param {string} [params.unit] - progress.unit（任意）
 * @param {string[]} params.questionIds - progress.questionIds（1件以上・空文字禁止・重複禁止）
 * @returns {{ok:true, runId:string, round:number, questionIds:string[]}|{ok:false, errorMessage:string}}
 */
export function restoreMemorizeRun({ runId, reviewRound, fieldId, unit = "", questionIds } = {}) {
  const trimmedRunId = toTrimmedString_(runId);
  const round = toRoundNumber_(reviewRound);
  const trimmedFieldId = toTrimmedString_(fieldId);
  const ids = toStrictQuestionIdList_(questionIds);

  if (!trimmedRunId || round === null || !trimmedFieldId || ids === null) {
    return { ok: false, errorMessage: RESTORE_ERROR_MESSAGE };
  }

  const identity = validateRunIdentity({
    sourceType: MEMORIZE_SOURCE_TYPE,
    runId: trimmedRunId,
    reviewRound: round
  });

  if (!identity.ok) {
    return { ok: false, errorMessage: RESTORE_ERROR_MESSAGE };
  }

  runState = {
    ...createMemorizeRunnerState(),
    active: true,
    runId: trimmedRunId,
    currentRound: round,
    fieldId: trimmedFieldId,
    unit: toTrimmedString_(unit),
    // Round1からの復元に限り、現在の対象集合がそのままRound1の対象集合である。
    initialQuestionIds: round === 1 ? [...ids] : null,
    currentQuestionIds: [...ids],
    roundResults: []
  };

  return { ok: true, runId: trimmedRunId, round, questionIds: [...ids] };
}

/**
 * 暗記runを中断し、runStateを安全に破棄する（次runへ前runの情報を残さない）。
 * 完了時（finishMemorizeRound → completed:true）は内部で同じresetが行われるため、
 * 「中断」と「完了後の後片付け」で別々の関数を設けない（APIを増やさない方針）。
 */
export function abortMemorizeRun() {
  runState = createMemorizeRunnerState();
}
