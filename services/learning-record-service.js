// services/learning-record-service.js
//
// Attempt/AnswerRecord専用GAS（config/learning-record-gas-config.js）との通信のみを
// 担う（Phase5-3）。既存services/gas-service.js・services/test-set-service.jsとは
// 別プロジェクトのため、独立した実装として持つ（既存student-service.js/gas-service.js/
// test-set-service.jsは一切変更しない）。
//
// 通信方式は既存の2つのGAS通信（gas-service.jsのpostToGas、test-set-service.jsの
// saveTestSet等）と同じパターン（POST・Content-Type: text/plain;charset=utf-8で
// JSON文字列を送る）を踏襲する。CORSプリフライトを避けるためのGAS Web App特有の
// 実践的な回避策であり、Phase5-0/Phase5-2で確定済みの方式。
//
// Phase5-3ではstartAttempt/saveAnswerRecord/completeAttemptの3つ（POST）を実装した。
// Phase5-4でfetchStudentLearningRecords（GET）を追加する。
//
// 各関数は、HTTPレベルの失敗（response.ok===false）だけでなく、GASレスポンスの
// {ok:false, error} も同様にthrowする。呼び出し側（features/history/
// learning-record-sync-integration.js・learning-record-restore-integration.js）は
// try/catchのみで両方の失敗を一律に扱える。

import { LEARNING_RECORD_GAS_WEB_APP_URL } from "../config/learning-record-gas-config.js";

async function postToLearningRecordGas_(action, payload) {
  const response = await fetch(LEARNING_RECORD_GAS_WEB_APP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      ...payload
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error || `${action} failed`);
  }

  return result;
}

/**
 * Attemptの開始を学習記録GASへ記録する。
 * gas-api-contract-v1.md §5.1のとおり、sourceType/testSetIdは任意項目
 * （Phase5-3では送信しない、Phase5-6で配線）。
 *
 * @param {{attemptId:string, studentId:string, questionSetId:string, questionSetVersion:number, fieldId:string, startedAt:string}} payload
 * @returns {Promise<{ok:true}>}
 */
export async function startAttempt(payload) {
  return postToLearningRecordGas_("startAttempt", payload);
}

/**
 * 1問分の解答結果を学習記録GASへ記録する（既存legacy saveRecordとは別経路）。
 *
 * @param {{attemptId:string, questionId:string, studentId:string, fieldId:string, unit:string, selectedChoice:string, correctAnswer:string, isCorrect:boolean, answeredAt:string}} payload
 * @returns {Promise<{ok:true}>}
 */
export async function saveAnswerRecord(payload) {
  return postToLearningRecordGas_("saveAnswerRecord", payload);
}

/**
 * Attemptを完了状態として学習記録GASへ記録する。
 *
 * @param {{attemptId:string, completedAt:string, score:number, totalCount:number}} payload
 * @returns {Promise<{ok:true}>}
 */
export async function completeAttempt(payload) {
  return postToLearningRecordGas_("completeAttempt", payload);
}

/**
 * 生徒のAttempt/AnswerRecordを学習記録GASから一括取得する（Phase5-4、GET）。
 * gas-api-contract-v1.md §5.4のとおり、GAS側では集計しない生データをそのまま返す。
 * 関数名はfetchStudentLearningRecordsとし、既存features/history/history-service.jsの
 * getStudentHistory()（別モジュール・別シグネチャの既存クライアント集計関数）との
 * 混同を避ける（GAS側のaction名は契約どおりgetStudentHistoryのまま）。
 *
 * @param {string} studentId
 * @returns {Promise<{ok:true, attempts:Array<Object>, answerRecords:Array<Object>}>}
 */
export async function fetchStudentLearningRecords(studentId) {
  const trimmedStudentId = String(studentId || "").trim();

  if (!trimmedStudentId) {
    throw new Error("fetchStudentLearningRecords: studentIdが空です。");
  }

  const query = new URLSearchParams({ action: "getStudentHistory", studentId: trimmedStudentId });
  const response = await fetch(`${LEARNING_RECORD_GAS_WEB_APP_URL}?${query.toString()}`);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error || "getStudentHistory failed");
  }

  if (!Array.isArray(result.attempts) || !Array.isArray(result.answerRecords)) {
    throw new Error("getStudentHistory: attempts/answerRecordsが配列ではありません。");
  }

  return result;
}
