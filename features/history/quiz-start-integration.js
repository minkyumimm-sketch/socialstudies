// features/history/quiz-start-integration.js
//
// Phase2 Task14-1で作成、Task15-2でQuestionSetServiceへ配線を差し替え、
// Task15-3でQuestionSetVersion生成・検証を追加。
// 既存アプリ（app.js）の出題開始処理から、新しいドメイン基盤
// （QuestionSet / QuestionSetVersion / Attempt）を「裏側で」生成・保存するための
// 最小限の橋渡し関数。
//
// 既存の出題ロジック（core/quiz-controller.js の prepareQuizStart 等）は一切変更せず、
// 既に選定済みの出題（state.quiz.quizQuestions）を受け取ってQuestionSet化するだけの
// 薄いラッパーとする。AnswerRecord保存・GAS連携・ランキング等は今回一切行わない。
//
// 使用するのは以下の3つのみ（Repositoryへは直接アクセスしない、というご指示どおり）:
//   - features/question-set/question-set-service.js の createQuestionSet() / saveQuestionSet()
//     （Task15-1で作成済み。内部でQuestionSetLoader・QuestionSetRepository・既定のMemoryStorageを
//     使う。QuestionSetLoaderを直接呼ばず、必ずこのServiceを経由する。無変更）
//   - features/question-set/question-set-version.js の
//     createQuestionSetVersionFromQuestionSet() / validateQuestionSetVersion()
//     （Task10で作成済み。無変更。QuestionSetVersionはRepositoryへ保存しない
//     ＝Task15-3の指示どおり「生成・検証」のみを行い、検証ゲートとしてのみ使う）
//   - features/history/attempt-service.js の createAttempt() / saveAttempt()
//     （Task12で作成済み。内部でAttemptRepository・既定のMemoryStorageを使う。無変更）
//
// 【Task15-2でのフロー変更】
// これまでcreateQuestionSetFromQuestions()（同期・CSV再取得なし）で既存フローが
// 選定済みの問題配列からその場でQuestionSetを組み立てていたが、QuestionSetServiceの
// createQuestionSet()はLoader経由でCSVを読み直す非同期関数のため、既存フローが選定した
// 問題のquestionIdだけを引き継ぎ、そのquestionIdsで絞り込んだQuestionSetをServiceに
// 生成させる（CSVの内容そのものは既存フローと同じ問題集合を指す）。
// これに伴い本関数はasyncとなり、QuestionSet保存 → Attempt生成 → Attempt保存の順序を
// 維持したまま呼び出し側でawaitする前提に変わる（呼び出し側=app.jsの対応はTask15-2の範囲）。
//
// 【Task15-3でのフロー変更】
// QuestionSet生成の直後にcreateQuestionSetVersionFromQuestionSet()でQuestionSetVersionの
// スナップショットを生成し、validateQuestionSetVersion()で整合性（questionSetId/version/
// questionIdsの形式）を検証する。検証に失敗した場合はQuestionSetを保存せず、例外を投げて
// 以降の処理（Attempt生成含む）も行わない（＝この裏側の記録全体を諦めてnullを返す。
// 既存の出題フロー自体は止めない、という既存の安全方針を維持したまま）。

import { createQuestionSet, saveQuestionSet } from "../question-set/question-set-service.js";
import {
  createQuestionSetVersionFromQuestionSet,
  validateQuestionSetVersion
} from "../question-set/question-set-version.js";
import { createAttempt, saveAttempt } from "./attempt-service.js";
import { syncStartAttempt } from "./learning-record-sync-integration.js";

const TEMPORARY_DEFAULT_COURSE_PURPOSE_ID = "regular_exam";

/**
 * 出題開始時に、裏側でQuestionSetを生成し、QuestionSetVersionで整合性を検証したうえで
 * QuestionSetを保存、続けてAttemptを生成・保存する。
 * 例外は投げず、失敗時はnullを返す（呼び出し側＝既存の出題フローを絶対に止めないため。
 * 呼び出し側でもtry/catchすることを推奨するが、本関数内でも二重に安全側へ倒す）。
 *
 * @param {Object} params
 * @param {Array<Object>} params.quizQuestions - 既存フローで既に選定済みの出題（state.quiz.quizQuestions）
 * @param {string} params.subject - 既存の科目キー（fieldIdとして使う。例: japan_geo）
 * @param {string} params.studentId
 * @param {string|null} [params.sourceType] - Attemptの起点（Phase5-6、`normal`/`weak_review`/
 *   `dormant_review`/`testset`）。呼び出し元（app.js）が明示的に渡す。省略時はcreateAttempt()の
 *   デフォルト（null＝起点不明）に委ねる（勝手にnormalへfallbackしない）。
 * @param {string|null} [params.testSetId] - `sourceType==="testset"`のときのみ値を持つ
 * @returns {Promise<{ questionSet: import("../question-set/question-set-model.js").QuestionSet, attempt: import("./attempt-model.js").Attempt } | null>}
 */
export async function startAttemptForQuiz({ quizQuestions, subject, studentId, sourceType, testSetId }) {
  try {
    const questionIds = (Array.isArray(quizQuestions) ? quizQuestions : [])
      .map((question) => question?.questionId)
      .filter(Boolean);

    const questionSet = await createQuestionSet({
      fieldId: subject,
      coursePurposeId: TEMPORARY_DEFAULT_COURSE_PURPOSE_ID,
      questionIds,
      slug: `session-${Date.now()}`
    });

    const questionSetVersion = createQuestionSetVersionFromQuestionSet(questionSet);
    const { valid, errors } = validateQuestionSetVersion(questionSetVersion);

    if (!valid) {
      throw new Error(`QuestionSetVersionの検証に失敗しました: ${errors.join(" / ")}`);
    }

    saveQuestionSet(questionSet);

    const attempt = createAttempt({
      studentId,
      questionSetId: questionSet.questionSetId,
      questionSetVersion: questionSet.version,
      totalCount: questionSet.questionIds.length,
      startedAt: new Date().toISOString(),
      sourceType,
      testSetId
    });

    saveAttempt(attempt);

    // Phase5-3: MemoryStorage保存成功後、学習記録専用GASへも非同期送信する
    // （fire-and-forget、呼び出し元はawaitしない・失敗してもここでは影響しない）。
    // subjectはこの関数の引数そのもの＝クリーンなfieldId（旧saveRecordの合成subjectとは別物）。
    syncStartAttempt(attempt, subject);

    return { questionSet, attempt };
  } catch (error) {
    console.error("startAttemptForQuiz error（裏側の記録のみ失敗。既存の出題フローには影響しません）:", error);
    return null;
  }
}
