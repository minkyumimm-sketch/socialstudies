// features/weakness/weakness-quiz-bridge.js
//
// Phase2 Task21-2: WeaknessServiceが返すquestionId群を、既存QuizEngine（core/quiz-controller.js等）
// が扱える問題オブジェクト配列へ変換するだけの薄いBridge。
//
// 責務は「questionId群 ⇔ 現在利用可能な問題データの突き合わせ」のみ。
// 苦手判定・履歴集計・DOM操作・画面遷移・Attempt保存・AnswerRecord保存は一切行わない
// （それぞれweakness-rules.js・weakness-service.js・app.js・features/history/配下の
// 各integrationファイルの責務のまま）。
//
// 使用するのは features/weakness/weakness-service.js の公開API
// （getWeakQuestionsByField / getDormantQuestions）のみ。
// Repository・Storage・HistoryServiceへは一切直接アクセスしない
// （HistoryServiceのデータはWeaknessService経由でのみ間接的に利用する）。
//
// 「現在利用可能な問題データ」（availableQuestions）は、呼び出し側（app.js）が
// 既存のfilterManager.getNormalizedQuestionsForSubject(fieldId)で取得済みの、
// 正規化済み・active状態のみのQuestion配列をそのまま渡す前提とする（本ファイルでは
// CSV読込・正規化を一切行わない＝既存のCSV読込経路を複製しない）。
//
// questionId不一致（WeaknessServiceが返したquestionIdが、現在のavailableQuestionsに
// 存在しない場合）は、他の問題へ勝手に置換せず、その1件を除外するだけに留める
// （呼び出し側でrequestedCount/matchedCount/missingQuestionIdsを見て、0件ならクイズを
// 開始しない、という判断を行う前提）。

import { getWeakQuestionsByField, getDormantQuestions } from "./weakness-service.js";

/**
 * @typedef {Object} WeaknessQuizBridgeResult
 * @property {Array<Object>} questions - 既存QuizEngineがそのまま扱える問題オブジェクト配列（questionIdが一致したもののみ）
 * @property {number} requestedCount - WeaknessServiceが返したquestionId件数
 * @property {number} matchedCount - 現在の問題データと一致した件数（questions.length と同じ）
 * @property {string[]} missingQuestionIds - 現在の問題データに存在しなかったquestionId一覧
 */

/**
 * 【非公開】questionId群を、現在利用可能な問題データと突き合わせる共通処理。
 * getWeakQuestionsByField()由来・getDormantQuestions()由来のいずれの入力でも同じ突き合わせ
 * ロジックを再利用する（Task21-4での重複実装を避けるための共通化）。
 *
 * @param {Array<{ questionId: string }>} entries
 * @param {Array<Object>} availableQuestions
 * @returns {WeaknessQuizBridgeResult}
 */
function matchQuestions(entries, availableQuestions) {
  const availableById = new Map(
    (Array.isArray(availableQuestions) ? availableQuestions : [])
      .filter((question) => question?.questionId)
      .map((question) => [question.questionId, question])
  );

  const questions = [];
  const missingQuestionIds = [];

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const question = availableById.get(entry?.questionId);
    if (question) {
      questions.push(question);
    } else if (entry?.questionId) {
      missingQuestionIds.push(entry.questionId);
    }
  });

  return {
    questions,
    requestedCount: Array.isArray(entries) ? entries.length : 0,
    matchedCount: questions.length,
    missingQuestionIds
  };
}

/**
 * 【入口】studentId・fieldIdに紐づく苦手問題（getWeakQuestionsByField）を、
 * 既存QuizEngineが扱える問題オブジェクト配列へ変換する。
 *
 * @param {Object} params
 * @param {string} params.studentId
 * @param {string} params.fieldId
 * @param {Array<Object>} params.availableQuestions - 現在利用可能な正規化済み問題データ
 *   （filterManager.getNormalizedQuestionsForSubject(fieldId)の結果をそのまま渡す）
 * @returns {WeaknessQuizBridgeResult}
 */
export function buildWeakQuestionQuiz({ studentId, fieldId, availableQuestions }) {
  const entries = getWeakQuestionsByField(studentId, fieldId);
  return matchQuestions(entries, availableQuestions);
}

/**
 * 【入口】studentId・fieldIdに紐づく復習推奨問題（getDormantQuestions）を、
 * 既存QuizEngineが扱える問題オブジェクト配列へ変換する。
 *
 * getDormantQuestions()にはfieldId絞り込み版が存在しないため、ここでfieldId一致のみを
 * 抽出する（weakness-service.jsのgetWeakQuestionsByField()と同じ単純なfieldId一致
 * フィルタであり、新しい苦手・復習推奨の判定ロジックではない）。weakness-service.js自体は
 * 変更しない。
 *
 * @param {Object} params
 * @param {string} params.studentId
 * @param {string} params.fieldId
 * @param {Array<Object>} params.availableQuestions
 * @returns {WeaknessQuizBridgeResult}
 */
export function buildDormantQuestionQuiz({ studentId, fieldId, availableQuestions }) {
  const entries = getDormantQuestions(studentId).filter((entry) => entry.fieldId === fieldId);
  return matchQuestions(entries, availableQuestions);
}
