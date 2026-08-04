// features/history/quiz-start-integration.js
//
// Phase2 Task14-1: 既存アプリ（app.js）の出題開始処理から、新しいドメイン基盤
// （QuestionSet / Attempt）を「裏側で」生成・保存するための最小限の橋渡し関数。
//
// 既存の出題ロジック（core/quiz-controller.js の prepareQuizStart 等）は一切変更せず、
// 既に選定済みの出題（state.quiz.quizQuestions）を受け取ってQuestionSet化するだけの
// 薄いラッパーとする。AnswerRecord保存・GAS連携・ランキング等は今回一切行わない。
//
// 使用するのは以下の2つのみ（Repositoryへは直接アクセスしない、というご指示どおり）:
//   - features/question-set/question-set-loader.js の createQuestionSetFromQuestions()
//     （CSVを再取得しない同期関数。既存フローが既に読み込み・選定した問題配列をそのまま渡す）
//   - features/history/attempt-service.js の createAttempt() / saveAttempt()
//     （内部でAttemptRepository・既定のMemoryStorageを使う）
//
// coursePurposeId（Task11で必須項目化済み）は、既存アプリにまだ
// 「定期テスト対策 / 都立入試対策」を選ぶUIが無いため、暫定的な固定値を使う。
// UIで選択できるようになった時点で、この固定値の受け渡し方法を見直す想定
// （今回はUI変更を行わないため、暫定値での対応に留める）。

import { createQuestionSetFromQuestions } from "../question-set/question-set-loader.js";
import { createAttempt, saveAttempt } from "./attempt-service.js";

const TEMPORARY_DEFAULT_COURSE_PURPOSE_ID = "regular_exam";

/**
 * 出題開始時に、裏側でQuestionSetとAttemptを生成し、Attemptを保存する。
 * 例外は投げず、失敗時はnullを返す（呼び出し側＝既存の出題フローを絶対に止めないため。
 * 呼び出し側でもtry/catchすることを推奨するが、本関数内でも二重に安全側へ倒す）。
 *
 * @param {Object} params
 * @param {Array<Object>} params.quizQuestions - 既存フローで既に選定済みの出題（state.quiz.quizQuestions）
 * @param {string} params.subject - 既存の科目キー（fieldIdとして使う。例: japan_geo）
 * @param {string} params.studentId
 * @returns {{ questionSet: import("../question-set/question-set-model.js").QuestionSet, attempt: import("./attempt-model.js").Attempt } | null}
 */
export function startAttemptForQuiz({ quizQuestions, subject, studentId }) {
  try {
    const questionSet = createQuestionSetFromQuestions(quizQuestions, {
      fieldId: subject,
      coursePurposeId: TEMPORARY_DEFAULT_COURSE_PURPOSE_ID,
      slug: `session-${Date.now()}`
    });

    const attempt = createAttempt({
      studentId,
      questionSetId: questionSet.questionSetId,
      questionSetVersion: questionSet.version,
      totalCount: questionSet.questionIds.length
    });

    saveAttempt(attempt);

    return { questionSet, attempt };
  } catch (error) {
    console.error("startAttemptForQuiz error（裏側の記録のみ失敗。既存の出題フローには影響しません）:", error);
    return null;
  }
}
