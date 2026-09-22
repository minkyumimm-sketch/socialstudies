// features/memorize/memorize-review-run-controller.js
//
// 暗記モード-3 STEP M3-5: 生徒の学習履歴（Attempt/AnswerRecord）から、
// M3-2 → M3-2B → M3-3 → M3-4 を順番に呼び出し、指定studentId・指定fieldIdについて
// 「今日、長期復習対象として開始すべきquestionId」を1回のfresh deriveでまとめて
// 導出するだけのpure module。DOM・GAS通信・Repository・Service・Runner singleton・
// runId生成のいずれにも依存しない（同じ入力なら必ず同じ出力、副作用なし）。
// current time取得も行わない（todayは呼び出し側が生成し渡す）。
//
// 【責務（M3-5 Research / Design Gate確定）】
// - M3-2/M3-2B/M3-3/M3-4それぞれのvalidation・ordering・due predicateを一切
//   複製しない。各moduleの{ok:false, errorMessage}をそのまま呼び出し側へ伝播する。
// - 入力historyは、features/history/history-service.jsのgetStudentHistory()が返す
//   実際の形（{attempt, answerRecords, ...}の配列）を前提とし、そこから
//   attempts/answerRecordsへ展開するだけ（null/malformedを推測で補完しない）。
// - 実際にReview Runを開始する処理（question解決・Runner初期化・Attempt開始・
//   unfinished Run確認）は一切行わない。それらはapp.js側の呼び出し元（M3-5の
//   app.js入口）の責務。

import { deriveMemorizeLongTermEvents } from "./memorize-long-term-event-model.js";
import { deriveMemorizeRunCompletionEvents } from "./memorize-run-completion-model.js";
import { deriveMemorizeReviewSchedules } from "./memorize-review-schedule-model.js";
import { selectTodaysMemorizeReviewQuestionIds } from "./memorize-todays-review-selector.js";

const ERROR_MESSAGE = "今日の復習対象を計算できませんでした。";

/**
 * getStudentHistory()の出力形（{attempt, answerRecords, ...}の配列）から、
 * M3-2/M3-2Bへそのまま渡せるattempts/answerRecords配列を組み立てる。
 * 各entryの構造検証はしない（malformedなAttempt/AnswerRecordはM3-2/M3-2B自身の
 * fail-closedがそのまま機能するため、ここで二重に検証しない）。historyそのものの
 * 形（配列か、各entryがanswerRecords配列を持つか）だけを確認する。
 *
 * @param {unknown} history
 * @returns {{attempts:Array<Object>, answerRecords:Array<Object>}|null}
 */
function flattenHistory_(history) {
  if (!Array.isArray(history)) return null;

  const attempts = [];
  const answerRecords = [];

  for (const entry of history) {
    if (!entry || typeof entry !== "object") return null;
    if (!Array.isArray(entry.answerRecords)) return null;

    attempts.push(entry.attempt);
    for (const record of entry.answerRecords) {
      answerRecords.push(record);
    }
  }

  return { attempts, answerRecords };
}

/**
 * 生徒の学習履歴（getStudentHistory()の出力）から、指定fieldIdについて
 * 「今日、長期復習対象として開始すべきquestionId」をfresh deriveする。
 *
 * 【処理順序】
 * history → attempts/answerRecords展開
 *   → deriveMemorizeLongTermEvents（M3-2）
 *   → deriveMemorizeRunCompletionEvents（M3-2B）
 *   → deriveMemorizeReviewSchedules（M3-3）
 *   → selectTodaysMemorizeReviewQuestionIds（M3-4）
 *
 * いずれかの段階で{ok:false}が返れば、その時点でwhole-callとしてfail-closedし、
 * 後続の段階は呼ばない。
 *
 * 【入力契約】
 * - history: features/history/history-service.jsのgetStudentHistory(studentId)が
 *   返す配列をそのまま渡す（{attempt, answerRecords, ...}の配列。questionSet等の
 *   余分なfieldは無視する）。入力は変更しない。
 * - today: "YYYY-MM-DD"（JST calendar date、呼び出し側が生成する）。本関数自身は
 *   現在時刻を一切取得しない。
 *
 * @param {Object} params
 * @param {string} params.studentId
 * @param {string} params.fieldId
 * @param {Array<Object>} [params.history] - getStudentHistory()の出力配列
 * @param {string} params.today - "YYYY-MM-DD"
 * @returns {{ok:true, studentId:string, fieldId:string, questionIds:string[]}|{ok:false, errorMessage:string}}
 */
export function deriveTodaysMemorizeReview({ studentId, fieldId, history, today } = {}) {
  const flattened = flattenHistory_(history);
  if (flattened === null) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }
  const { attempts, answerRecords } = flattened;

  const eventsResult = deriveMemorizeLongTermEvents({ studentId, attempts, answerRecords });
  if (!eventsResult.ok) {
    return { ok: false, errorMessage: eventsResult.errorMessage };
  }

  const completionsResult = deriveMemorizeRunCompletionEvents({ studentId, attempts, answerRecords });
  if (!completionsResult.ok) {
    return { ok: false, errorMessage: completionsResult.errorMessage };
  }

  const schedulesResult = deriveMemorizeReviewSchedules({
    longTermQuestions: eventsResult.questions,
    completionQuestions: completionsResult.questions
  });
  if (!schedulesResult.ok) {
    return { ok: false, errorMessage: schedulesResult.errorMessage };
  }

  const selection = selectTodaysMemorizeReviewQuestionIds({
    studentId,
    fieldId,
    schedules: schedulesResult.schedules,
    today
  });
  if (!selection.ok) {
    return { ok: false, errorMessage: selection.errorMessage };
  }

  return {
    ok: true,
    studentId: selection.studentId,
    fieldId: selection.fieldId,
    questionIds: selection.questionIds
  };
}
