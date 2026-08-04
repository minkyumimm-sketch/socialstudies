// features/history/history-service.js
//
// Phase2 Task16-1: QuestionSet・Attempt・AnswerRecordの「保存済みデータの取得」を
// 1箇所に統合するService（学習履歴取得サービス）。保存（save）は一切行わない、
// 取得（読み取り）専用のファサード。
//
// Repositoryへは一切直接アクセスしない。それぞれのドメインの既存Serviceが既に
// 「Repositoryへ直接アクセスするのはこのServiceだけ」という方針で作られているため
// （features/history/attempt-service.js・answer-record-service.js・
//  features/question-set/question-set-service.js）、本Serviceはそれらの読み取りAPIに
// そのまま委譲するだけとし、Repositoryアクセスの重複実装は一切行わない:
//   - attempt-service.js の loadAttempt() / loadAttemptsByStudent()
//   - answer-record-service.js の loadAnswerRecordsByAttempt()
//   - question-set/question-set-service.js の loadQuestionSet()
//
// これにより、UI（app.js）は各ドメインのServiceや、まして
// features/repository/配下・features/storage/配下を個別にimportする必要がなくなり、
// 学習履歴の取得はこのHistoryServiceだけを見れば済む構造にする
// （「UIやapp.jsはHistoryServiceだけを見る構造にする」というご指示のとおり）。
//
// 今回は取得のみ。保存処理（save系API）は一切追加しない。

import { loadAttempt, loadAttemptsByStudent } from "./attempt-service.js";
import { loadAnswerRecordsByAttempt } from "./answer-record-service.js";
import { loadQuestionSet } from "../question-set/question-set-service.js";

/**
 * 【取得】attemptIdでAttemptを1件取得する。
 * @param {string} attemptId
 * @returns {import("./attempt-model.js").Attempt|null}
 */
export function getAttempt(attemptId) {
  return loadAttempt(attemptId);
}

/**
 * 【取得】studentIdに紐づくAttempt一覧を取得する。
 * @param {string} studentId
 * @returns {Array<import("./attempt-model.js").Attempt>}
 */
export function getAttemptsByStudent(studentId) {
  return loadAttemptsByStudent(studentId);
}

/**
 * 【取得】attemptIdに紐づくAnswerRecord一覧を取得する。
 * @param {string} attemptId
 * @returns {Array<import("./answer-record-model.js").AnswerRecord>}
 */
export function getAnswerRecordsForAttempt(attemptId) {
  return loadAnswerRecordsByAttempt(attemptId);
}

/**
 * 【取得】Attemptが参照しているQuestionSetを取得する。
 * @param {import("./attempt-model.js").Attempt} attempt
 * @returns {import("../question-set/question-set-model.js").QuestionSet|null}
 */
export function getQuestionSetForAttempt(attempt) {
  if (!attempt?.questionSetId) return null;
  return loadQuestionSet(attempt.questionSetId);
}

/**
 * 【統合取得】1件のAttemptについて、QuestionSet・AnswerRecordを含めた詳細を取得する。
 * Attemptが存在しない場合はnullを返す。
 *
 * @param {string} attemptId
 * @returns {{
 *   attempt: import("./attempt-model.js").Attempt,
 *   questionSet: import("../question-set/question-set-model.js").QuestionSet|null,
 *   answerRecords: Array<import("./answer-record-model.js").AnswerRecord>
 * } | null}
 */
export function getAttemptDetail(attemptId) {
  const attempt = getAttempt(attemptId);
  if (!attempt) return null;

  return {
    attempt,
    questionSet: getQuestionSetForAttempt(attempt),
    answerRecords: getAnswerRecordsForAttempt(attemptId)
  };
}

/**
 * 【統合取得】studentIdに紐づく全Attemptについて、それぞれのQuestionSet・AnswerRecordを
 * 含めた学習履歴一覧を取得する。
 *
 * @param {string} studentId
 * @returns {Array<{
 *   attempt: import("./attempt-model.js").Attempt,
 *   questionSet: import("../question-set/question-set-model.js").QuestionSet|null,
 *   answerRecords: Array<import("./answer-record-model.js").AnswerRecord>
 * }>}
 */
export function getStudentHistory(studentId) {
  return getAttemptsByStudent(studentId).map((attempt) => ({
    attempt,
    questionSet: getQuestionSetForAttempt(attempt),
    answerRecords: getAnswerRecordsForAttempt(attempt.attemptId)
  }));
}
