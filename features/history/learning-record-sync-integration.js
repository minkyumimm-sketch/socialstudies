// features/history/learning-record-sync-integration.js
//
// Phase5-3: MemoryStorageへの同期保存とは別に、学習記録専用GAS
// （config/learning-record-gas-config.js、services/learning-record-service.js）へ
// 非同期でAttempt/AnswerRecordを送信するための橋渡し層。
//
// 責務：
//   - MemoryStorageの代替にはならない（MemoryStorage保存は既存の各*-integration.jsが
//     従来どおり同期的に行う。本ファイルはその「後から」GASへ送るだけ）
//   - GAS通信の失敗を既存Quiz処理へ一切throwしない（呼び出し元はawaitしない前提）
//   - console.errorで診断可能にするのみ
//
// 順序保証（最小限、過剰なqueueシステムへは発展させない）：
//   - saveAnswerRecordは、対象attemptIdのstartAttempt送信が完了するまで待ってから送信する
//     （新GAS側saveAnswerRecordは対象attemptIdがattemptsに存在することを要求するため）
//   - completeAttemptも同様にstartAttempt完了を待ってから送信する
//   - AnswerRecord同士・AnswerRecordとcompleteAttemptの間の完全な直列queueは作らない
//   - startAttemptが失敗した場合、依存するsaveAnswerRecord/completeAttemptの送信は
//     行わない（GAS側で「該当attemptIdなし」エラーになることが分かっているため）
//
// sourceType/testSetIdはPhase5-6でstartAttempt payloadへ配線済み（attempt.sourceType/
// testSetIdをそのまま送るのみ、値の組み立てはfeatures/history/attempt-model.js・
// app.js側の責務でありこのファイルでは行わない）。
// getStudentHistoryはPhase5-4で実装済み（features/history/learning-record-restore-integration.js）。

import {
  startAttempt as sendStartAttempt,
  saveAnswerRecord as sendSaveAnswerRecord,
  completeAttempt as sendCompleteAttempt
} from "../../services/learning-record-service.js";

// attemptId -> startAttempt送信のPromise（成功/失敗いずれも解決済みの状態を保持する）。
// syncCompleteAttempt完了時に破棄するため、同時に進行中のAttempt数程度のサイズに収まり、
// 無制限に増え続けない。
const startAttemptPromises = new Map();

/**
 * Attempt開始を学習記録GASへ非同期送信する。呼び出し元はawaitしなくてよい
 * （UIをブロックしない、Quiz開始を止めない）。
 *
 * @param {import("./attempt-model.js").Attempt} attempt
 * @param {string} fieldId - startAttemptForQuiz()のsubject引数（クリーンなfieldId。
 *   旧saveRecordのbuildSavedSubjectName()による合成文字列とは別物であり、混同しない）
 */
export function syncStartAttempt(attempt, fieldId) {
  if (!attempt?.attemptId) return;

  const promise = sendStartAttempt({
    attemptId: attempt.attemptId,
    studentId: attempt.studentId,
    questionSetId: attempt.questionSetId,
    questionSetVersion: attempt.questionSetVersion,
    fieldId,
    startedAt: attempt.startedAt,
    // Phase5-6: attempt.sourceType/testSetIdがnullの場合、GAS側normalizeString_()が
    // 空文字列へ正規化するため、そのままJSON送信してよい（gas-api-contract-v1.md §5.1、
    // 既にGAS側で実装済みのvalidationと整合することをテストで確認する）。
    sourceType: attempt.sourceType,
    testSetId: attempt.testSetId
  }).catch((error) => {
    console.error("learning-record-service startAttempt error（MemoryStorageには影響しません）:", error);
    throw error; // rejected状態を保持し、依存するsaveAnswerRecord/completeAttempt側が判定できるようにする
  });

  // このPromiseを誰も待たない場合（例: 一度も回答せず離脱）でも
  // unhandled rejectionにならないようにする。
  promise.catch(() => {});

  startAttemptPromises.set(attempt.attemptId, promise);
}

async function waitForStartAttempt_(attemptId) {
  const promise = startAttemptPromises.get(attemptId);
  if (!promise) return true; // 追跡対象外(既に完了・破棄済み、または元々未追跡)は送信を許可する

  try {
    await promise;
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * AnswerRecordを学習記録GASへ非同期送信する。呼び出し元はawaitしなくてよい。
 * 対象attemptIdのstartAttemptが完了するまで内部で待機し、startAttemptが失敗していた
 * 場合は送信自体を行わない。
 *
 * @param {import("./answer-record-model.js").AnswerRecord} answerRecord
 */
export async function syncSaveAnswerRecord(answerRecord) {
  if (!answerRecord?.attemptId || !answerRecord?.questionId) return;

  const started = await waitForStartAttempt_(answerRecord.attemptId);
  if (!started) {
    console.error(
      "learning-record-service saveAnswerRecord skipped（startAttemptが失敗したため送信しません）:",
      answerRecord.attemptId,
      answerRecord.questionId
    );
    return;
  }

  try {
    await sendSaveAnswerRecord({
      attemptId: answerRecord.attemptId,
      questionId: answerRecord.questionId,
      studentId: answerRecord.studentId,
      fieldId: answerRecord.fieldId,
      unit: answerRecord.unit,
      selectedChoice: answerRecord.selectedChoice,
      correctAnswer: answerRecord.correctAnswer,
      isCorrect: answerRecord.isCorrect,
      answeredAt: answerRecord.answeredAt
    });
  } catch (error) {
    console.error("learning-record-service saveAnswerRecord error（MemoryStorageには影響しません）:", error);
  }
}

/**
 * Attempt完了を学習記録GASへ非同期送信する。呼び出し元はawaitしなくてよい。
 * 対象attemptIdのstartAttemptが完了するまで内部で待機する（順序保証）。
 * AnswerRecord送信の完了までは待たない（新GAS側completeAttemptはanswer_recordsを
 * 参照せずクライアントから受け取ったscore/totalCountをそのまま保存するだけのため）。
 *
 * 送信結果に関わらず、追跡用Promiseはここで破棄する（Attemptのライフサイクル終了に
 * 合わせてMapのサイズを抑える）。
 *
 * @param {import("./attempt-model.js").Attempt} completedAttempt
 */
export async function syncCompleteAttempt(completedAttempt) {
  if (!completedAttempt?.attemptId) return;

  const attemptId = completedAttempt.attemptId;

  try {
    const started = await waitForStartAttempt_(attemptId);
    if (!started) {
      console.error(
        "learning-record-service completeAttempt skipped（startAttemptが失敗したため送信しません）:",
        attemptId
      );
      return;
    }

    await sendCompleteAttempt({
      attemptId,
      completedAt: completedAttempt.completedAt,
      score: completedAttempt.score,
      totalCount: completedAttempt.totalCount
    });
  } catch (error) {
    console.error("learning-record-service completeAttempt error（MemoryStorageには影響しません）:", error);
  } finally {
    startAttemptPromises.delete(attemptId);
  }
}
