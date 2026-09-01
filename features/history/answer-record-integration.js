// features/history/answer-record-integration.js
//
// Phase2 Task14-2: 既存アプリ（app.js）の回答確定処理から、新しいドメイン基盤
// （AnswerRecord）を「裏側で」生成・保存するための最小限の橋渡し関数。
//
// 既存の正誤判定ロジック（app.js の handleAnswer / judges/answer-judge.js）や
// GAS保存（services/student-service.js の saveAnswerRecord）は一切変更せず、
// 既に判定済みの結果を受け取ってAnswerRecordを生成・保存するだけの薄いラッパーとする。
//
// 使用するのは以下の1つのみ（Repository・Storageへは直接アクセスしない、というご指示どおり）:
//   - features/history/answer-record-service.js の createAnswerRecord() / saveAnswerRecord()
//     （internally MemoryStorageを使う。features/history/quiz-start-integration.js と同じ方針）

import { createAnswerRecord, saveAnswerRecord } from "./answer-record-service.js";
import { syncSaveAnswerRecord, syncAttemptProgress } from "./learning-record-sync-integration.js";

/**
 * 回答確定時に、裏側でAnswerRecordを生成・保存する。
 * 例外は投げず、失敗時はnullを返す（呼び出し側＝既存の回答フローを絶対に止めないため。
 * 呼び出し側でもtry/catchすることを推奨するが、本関数内でも二重に安全側へ倒す。
 * features/history/quiz-start-integration.js の startAttemptForQuiz() と同じ考え方）。
 *
 * @param {Object} params
 * @param {string} params.attemptId - Task14-1で発行済みのAttemptId（未発行の場合は空文字でも可）
 * @param {string} params.studentId
 * @param {string} params.questionId
 * @param {string} params.fieldId - 既存の科目キー（例: japan_geo）
 * @param {string} params.unit
 * @param {string} params.selectedChoice - 表示用に整形済みの選択・入力内容
 * @param {string} params.correctAnswer - 表示用に整形済みの正解
 * @param {boolean} params.isCorrect - 既存の正誤判定ロジックによる結果
 * @param {number} [params.currentQuestionIndex] - 「次に表示すべき問題のindex」（0-based、
 *   Phase3B-2）。呼び出し元（app.js）のstate.quiz.currentIndex+1をそのまま渡す想定。
 *   未指定の場合はprogress更新を送信しない。
 * @returns {import("./answer-record-model.js").AnswerRecord | null}
 */
export function recordAnswerForAttempt(params) {
  try {
    const answerRecord = createAnswerRecord({
      attemptId: params.attemptId,
      studentId: params.studentId,
      questionId: params.questionId,
      fieldId: params.fieldId,
      unit: params.unit,
      selectedChoice: params.selectedChoice,
      correctAnswer: params.correctAnswer,
      isCorrect: params.isCorrect,
      answeredAt: new Date().toISOString()
    });

    const savedAnswerRecord = saveAnswerRecord(answerRecord);

    // Phase5-3: MemoryStorage保存成功後、学習記録専用GASへも非同期送信する
    // （fire-and-forget、呼び出し元はawaitしない・失敗してもここでは影響しない）。
    syncSaveAnswerRecord(savedAnswerRecord);

    // Phase3B-2: 同一関数内・AnswerRecord送信の直後に呼ぶことで、
    // 学習記録GASへの送信順序（AnswerRecord→progress）を構造的に保証する
    // （両方とも同じattemptId単位の直列queueへ同期的にenqueueされるため）。
    if (params.currentQuestionIndex !== undefined) {
      syncAttemptProgress(params.attemptId, params.currentQuestionIndex);
    }

    return savedAnswerRecord;
  } catch (error) {
    console.error("recordAnswerForAttempt error（裏側の記録のみ失敗。既存の回答フローには影響しません）:", error);
    return null;
  }
}
