// features/history/memorize-run-group-model.js
//
// 暗記モード-1 STEP M1-12: 生徒Historyの「最近の学習履歴」で、memorize Attempt群を
// runId単位でグルーピングするための純粋関数群（DOM非依存、GAS通信・保存を一切行わない）。
//
// 保存構造（1 Round = 1 Attempt）は変更しない。ここで返すグループは表示専用のview data
// 組み立てに使われるだけで、Repository/Serviceへ書き戻すことはない
// （M1-10 Research Gate・M1-11 Design Gateで確定済みの方針）。
// features/history/history-service.js・features/weakness/*・features/history/history-renderer.js
// のいずれへも依存しない（history-renderer.js側がこのファイルを利用する一方向のみ）。

const MEMORIZE_SOURCE_TYPE = "memorize";

/**
 * @param {import("./attempt-model.js").Attempt} attempt
 * @returns {boolean}
 */
export function isMemorizeAttempt(attempt) {
  return attempt?.sourceType === MEMORIZE_SOURCE_TYPE;
}

/**
 * memorize AttemptがRun grouping対象として安全かどうかを判定する
 * （runIdが空でない文字列・reviewRoundが1以上の整数）。weakness-service.jsの
 * hasValidRunIdentity判定と同じ条件だが、責務が異なるため独立して持つ
 * （Weakness側はfail-closedで除外、History側はAttempt単位表示へfallbackする）。
 *
 * @param {import("./attempt-model.js").Attempt} attempt
 * @returns {boolean}
 */
function isValidMemorizeRunIdentity(attempt) {
  const runId = typeof attempt?.runId === "string" ? attempt.runId.trim() : "";
  const reviewRound = attempt?.reviewRound;
  return runId !== "" && Number.isInteger(reviewRound) && reviewRound >= 1;
}

/**
 * 同一runId内でreviewRoundが重複していないかを確認する。
 * 欠番（例: 1,3）はここでは弾かない（M1-11確定方針：連続性までは厳格に求めない。
 * 欠番だけを理由にRun grouping自体を拒否しない）。
 *
 * @param {Array<{attempt: import("./attempt-model.js").Attempt}>} groupEntries
 * @returns {boolean}
 */
function hasDuplicateReviewRound(groupEntries) {
  const seen = new Set();
  return groupEntries.some((entry) => {
    const round = entry.attempt.reviewRound;
    if (seen.has(round)) return true;
    seen.add(round);
    return false;
  });
}

/**
 * Run最終Attempt（reviewRound最大）から、Runを安全にcard化できるか・完了済みかを判定する。
 * completed===trueかつscore!==totalCount（現行正常フローでは発生しないはずの異常/legacy）は
 * ok:falseを返し、呼び出し側がRun card化を諦めてAttempt単位表示へfallbackする
 * （M1-11確定方針：「未習得」等の新しいstatusは作らない）。
 *
 * @param {import("./attempt-model.js").Attempt} lastAttempt
 * @returns {{ok:true, completed:boolean}|{ok:false}}
 */
function resolveMemorizeRunCompletion(lastAttempt) {
  if (lastAttempt.completed !== true) {
    return { ok: true, completed: false };
  }
  if (lastAttempt.score === lastAttempt.totalCount) {
    return { ok: true, completed: true };
  }
  return { ok: false };
}

/**
 * @typedef {Object} MemorizeRunGroup
 * @property {Array<{attempt:Object, questionSet:Object|null, answerRecords:Array<Object>}>} entries - reviewRound昇順
 * @property {Object} firstAttempt - Run先頭（reviewRound最小）Attempt
 * @property {Object} lastAttempt - Run末尾（reviewRound最大）Attempt
 * @property {number} roundCount - Run内の実Attempt件数（最大reviewRoundではない、M1-11確定仕様。
 *   reviewRoundに欠番があっても実際にgroupingされたAttempt件数をそのまま使う）
 * @property {boolean} completed - true=全問習得、false=学習中
 */

/**
 * memorize Attemptのentry群を、安全にRun grouping可能なグループと、
 * 個別のAttempt単位表示へfallbackすべきentryへ仕分ける。
 *
 * 1件でもreviewRound不正／重複が見つかったrunIdグループは、部分統合せず
 * グループ全体をfallbackEntriesへ回す（M1-12確定方針：データを消さない、
 * History全体をerrorにしない）。
 *
 * @param {Array<{attempt:Object, questionSet:Object|null, answerRecords:Array<Object>}>} memorizeEntries
 * @returns {{validRunGroups: MemorizeRunGroup[], fallbackEntries: Array<Object>}}
 */
export function groupMemorizeHistoryEntries(memorizeEntries) {
  const groupsByRunId = new Map();
  const fallbackEntries = [];

  memorizeEntries.forEach((entry) => {
    if (!isValidMemorizeRunIdentity(entry.attempt)) {
      fallbackEntries.push(entry);
      return;
    }
    const runId = entry.attempt.runId.trim();
    if (!groupsByRunId.has(runId)) groupsByRunId.set(runId, []);
    groupsByRunId.get(runId).push(entry);
  });

  const validRunGroups = [];
  groupsByRunId.forEach((groupEntries) => {
    if (hasDuplicateReviewRound(groupEntries)) {
      fallbackEntries.push(...groupEntries);
      return;
    }

    const sorted = [...groupEntries].sort((a, b) => a.attempt.reviewRound - b.attempt.reviewRound);
    const firstAttempt = sorted[0].attempt;
    const lastAttempt = sorted[sorted.length - 1].attempt;

    const completion = resolveMemorizeRunCompletion(lastAttempt);
    if (!completion.ok) {
      fallbackEntries.push(...groupEntries);
      return;
    }

    validRunGroups.push({
      entries: sorted,
      firstAttempt,
      lastAttempt,
      roundCount: sorted.length,
      completed: completion.completed
    });
  });

  return { validRunGroups, fallbackEntries };
}

/**
 * recencyKey（ISO文字列またはnull）2件を新しい順（desc）に比較する。
 * nullは最も古いものとして扱う（history-service.jsのcompareTimestamps()と同じ前提だが、
 * 非公開のためimportできず、本ファイル専用の最小限の比較を独立して持つ）。
 *
 * @param {string|null} a
 * @param {string|null} b
 * @returns {number}
 */
export function compareRecencyKeysDesc(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}
