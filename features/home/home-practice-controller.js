// features/home/home-practice-controller.js
//
// Phase2 Task22-1: ホーム画面発の「苦手を復習」「復習する」が、どのBridge
// （features/weakness/weakness-quiz-bridge.js の buildWeakQuestionQuiz /
// buildDormantQuestionQuiz）を使うかを決めるだけの薄いController。
//
// 責務は「practiceType（"weak"/"dormant"）に応じてBridgeを選び、その結果
// （questions/missingQuestionIds等）をそのまま返す」ことのみ。
//
// 担当しないもの（すべて呼び出し側=app.jsの責務のまま）:
//   - DOM操作・document/window参照
//   - state（core/state.js）の読み書き
//   - filterManager.getNormalizedQuestionsForSubject()の呼び出し
//     （availableQuestionsは呼び出し側が取得済みのものを渡す）
//   - showQuizScreen/renderQuestion等の画面遷移・描画
//   - Attempt/AnswerRecordの保存・完了処理
//   - 苦手判定・履歴集計（weakness-rules.js/weakness-service.jsの責務のまま）
//
// questionId突き合わせロジック（matchQuestions相当）はweakness-quiz-bridge.js側の
// 非公開実装のみを利用し、本ファイルにはコピーしない。

import { buildWeakQuestionQuiz, buildDormantQuestionQuiz } from "../weakness/weakness-quiz-bridge.js";

const PRACTICE_TYPE_BUILDERS = {
  weak: buildWeakQuestionQuiz,
  dormant: buildDormantQuestionQuiz
};

const EMPTY_RESULT = {
  questions: [],
  requestedCount: 0,
  matchedCount: 0,
  missingQuestionIds: []
};

/**
 * 【入口】ホーム画面の練習開始ボタン用に、practiceTypeに応じたBridgeを選んで呼び出す。
 * 不正なpracticeType（"weak"/"dormant"以外）の場合は、Bridgeを呼ばず空の結果を返す
 * （既存クイズを開始しない、という安全側の挙動）。
 *
 * @param {Object} params
 * @param {string} params.studentId
 * @param {string} params.fieldId
 * @param {"weak"|"dormant"} params.practiceType
 * @param {Array<Object>} params.availableQuestions - 呼び出し側が取得済みの、現在利用可能な正規化済み問題データ
 * @returns {{ questions: Array<Object>, requestedCount: number, matchedCount: number, missingQuestionIds: string[] }}
 */
export function buildHomePracticeQuiz({ studentId, fieldId, practiceType, availableQuestions }) {
  const buildQuizFn = PRACTICE_TYPE_BUILDERS[practiceType];

  if (!buildQuizFn) {
    return EMPTY_RESULT;
  }

  return buildQuizFn({ studentId, fieldId, availableQuestions });
}
