// features/memorize/memorize-progress-view.js
//
// 暗記モード-2 STEP M2-3: quiz-scoreへ表示する「習得：X / Y」文字列を組み立てる、
// DOM非依存のview-model層。既存M2-2 pure module（memorize-question-state.js、
// Git Freeze済み・無変更）を呼び出すだけで、state保存・GAS通信・DOM書き込みは
// 一切行わない（実際のDOM書き込みはapp.js側の責務のまま）。
//
// 【責務】
// - Run全体のinitial questionIds（分母Y）を解決する（Runner側の値が使えない場合のみ、
//   Attempt+AnswerRecordから復元する。M2-3 Research Gate確定方針）
// - deriveMemorizeQuestionStates()（M2-2）を呼び、mastered数（分子X）を集計する
// - 表示用文字列を組み立てて返す（DOMへは書き込まない）
//
// 【Source of Truthを増やさない】
// 本ファイル自身は何も保存しない。studentId/runId/attempts/answerRecordsは
// すべて呼び出し側（app.js）が既存の取得経路（state.session.studentId・
// getMemorizeRunnerState()・loadAttemptsByStudent()・loadAnswerRecordsByAttempt()）から
// 集めたものをそのまま渡す。

import { MEMORIZE_SOURCE_TYPE } from "./memorize-runner-state.js";
import { deriveMemorizeQuestionStates, MEMORIZE_QUESTION_STATE } from "./memorize-question-state.js";

/**
 * @param {unknown} value
 * @returns {string}
 */
function toTrimmedString_(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Round1（reviewRound===1）のAttemptに紐づくAnswerRecordから、initial questionIdsを
 * 復元する（重複除去・最初の出現順維持）。
 *
 * Round1はRound2へ進む前に必ず全問回答済みになる（M1確定仕様）ため、reviewRound===1の
 * Attemptに紐づくAnswerRecordのquestionId集合は、そのRunの初期母集団と一致する。
 * Round1のAttemptが見つからない、またはAnswerRecordが1件も無い場合はnullを返す
 * （呼び出し側でfail-softとして扱う）。
 *
 * @param {string} studentId
 * @param {string} runId
 * @param {Array<Object>} attempts
 * @param {Array<Object>} answerRecords
 * @returns {string[]|null}
 */
function reconstructInitialQuestionIdsFromRound1_(studentId, runId, attempts, answerRecords) {
  if (!Array.isArray(attempts) || !Array.isArray(answerRecords)) return null;

  const round1Attempt = attempts.find((attempt) => {
    return (
      attempt?.sourceType === MEMORIZE_SOURCE_TYPE &&
      toTrimmedString_(attempt?.studentId) === studentId &&
      toTrimmedString_(attempt?.runId) === runId &&
      Number(attempt?.reviewRound) === 1
    );
  });

  if (!round1Attempt) return null;

  const round1AttemptId = toTrimmedString_(round1Attempt.attemptId);
  if (!round1AttemptId) return null;

  const seen = new Set();
  const questionIds = [];

  for (const record of answerRecords) {
    if (toTrimmedString_(record?.attemptId) !== round1AttemptId) continue;
    const questionId = toTrimmedString_(record?.questionId);
    if (!questionId || seen.has(questionId)) continue;
    seen.add(questionId);
    questionIds.push(questionId);
  }

  return questionIds.length > 0 ? questionIds : null;
}

/**
 * 「習得：X / Y」表示に必要なテキストを組み立てる。
 *
 * @param {Object} params
 * @param {string} params.studentId
 * @param {string} params.runId
 * @param {string[]|null} [params.runnerInitialQuestionIds] - 呼び出し側が
 *   getMemorizeRunnerState().initialQuestionIdsから渡す（Round2以降からのreload直後はnull）。
 * @param {Array<Object>} params.attempts - loadAttemptsByStudent(studentId)の結果
 * @param {Array<Object>} params.answerRecords - 対象Attempt群のAnswerRecordをまとめたもの
 * @returns {{ok:true, text:string}|{ok:false}}
 */
export function buildMemorizeMasteryDisplayText({
  studentId,
  runId,
  runnerInitialQuestionIds,
  attempts,
  answerRecords
} = {}) {
  const trimmedStudentId = toTrimmedString_(studentId);
  const trimmedRunId = toTrimmedString_(runId);
  if (!trimmedStudentId || !trimmedRunId) return { ok: false };

  const questionIds =
    Array.isArray(runnerInitialQuestionIds) && runnerInitialQuestionIds.length > 0
      ? runnerInitialQuestionIds
      : reconstructInitialQuestionIdsFromRound1_(trimmedStudentId, trimmedRunId, attempts, answerRecords);

  if (!questionIds) return { ok: false };

  const result = deriveMemorizeQuestionStates({
    studentId: trimmedStudentId,
    runId: trimmedRunId,
    questionIds,
    attempts,
    answerRecords
  });

  if (!result.ok) return { ok: false };

  const masteredCount = result.states.filter(
    (entry) => entry.state === MEMORIZE_QUESTION_STATE.MASTERED
  ).length;
  const totalCount = result.states.length;

  return { ok: true, text: `習得：${masteredCount} / ${totalCount}` };
}
