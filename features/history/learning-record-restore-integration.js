// features/history/learning-record-restore-integration.js
//
// Phase5-4: 生徒選択時に、学習記録専用GAS（services/learning-record-service.jsの
// fetchStudentLearningRecords）から過去のAttempt/AnswerRecordを一括取得し、
// 既存のAttempt/AnswerRecord Repository（MemoryStorage）へ復元する。
//
// features/history/learning-record-sync-integration.js（Phase5-3、MemoryStorage→GASの
// 送信方向）とは責務・データの向きが逆であるため、別ファイルとして分離する
// （1ファイル1責務、CLAUDE.md ③）。
//
// 責務：
//   - fetchStudentLearningRecords(studentId)を呼び、レスポンスを確認する
//   - 取得したattempts/answerRecordsを、既存のcreateAttempt()/saveAttempt()・
//     createAnswerRecord()/saveAnswerRecord()（Repositoryのkeyベースupsert、
//     Attempt: attemptId、AnswerRecord: attemptId::questionId）へそのまま通す
//   - MemoryStorageのclear()は一切行わない（他生徒のデータ・同一生徒の新規データを
//     破壊しないため。Phase5-4investigationで確認済み：findByStudent/findByAttemptは
//     studentId/attemptId経由で正しく絞り込まれるため、他生徒データとの混在は起きない）
//   - GAS取得・validation失敗時は例外を投げず、console.errorのみでfailure resultを返す
//     （呼び出し元＝app.jsのHome表示・生徒選択そのものを失敗させないため）
//
// Phase5-6（sourceType/testSetIdの配線）は先取りしない。GASレスポンスのattemptsに
// sourceType/testSetIdが含まれていても、createAttempt()がそれらのプロパティを
// 認識しないため、復元後のAttemptオブジェクトには含まれない（既存モデルの実装状況が
// そのままPhase5-6非先取りのガードになる）。

import { fetchStudentLearningRecords } from "../../services/learning-record-service.js";
import { createAttempt, saveAttempt } from "./attempt-service.js";
import { createAnswerRecord, saveAnswerRecord } from "./answer-record-service.js";

/**
 * 生徒のAttempt/AnswerRecordを学習記録GASから取得し、MemoryStorageへ復元する。
 * 例外は投げず、失敗時は{ok:false}を返す（呼び出し元＝生徒選択・Home表示を
 * 止めないため）。
 *
 * @param {string} studentId
 * @returns {Promise<{ok:true, attemptCount:number, answerRecordCount:number} | {ok:false}>}
 */
export async function restoreStudentLearningRecords(studentId) {
  try {
    const { attempts, answerRecords } = await fetchStudentLearningRecords(studentId);

    attempts.forEach((gasAttempt) => {
      const attempt = createAttempt(gasAttempt);
      saveAttempt(attempt);
    });

    answerRecords.forEach((gasAnswerRecord) => {
      const answerRecord = createAnswerRecord(gasAnswerRecord);
      saveAnswerRecord(answerRecord);
    });

    return { ok: true, attemptCount: attempts.length, answerRecordCount: answerRecords.length };
  } catch (error) {
    console.error("restoreStudentLearningRecords error（MemoryStorageは現状維持されます）:", error);
    return { ok: false };
  }
}
