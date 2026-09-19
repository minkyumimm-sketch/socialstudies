// features/memorize/memorize-session-controller.js
//
// 暗記モード-1 STEP M1-3: memorize Round開始前の問題集合解決・検証専用の薄いヘルパー。
//
// 【責務】
// - questionId配列を、実際に利用可能なQuestion object配列へ解決する
// - 解決時に、以下をfail-closedで検証する：
//   - questionIdに対応するQuestionが実在すること（存在しなければ開始拒否）
//   - 解決したQuestionがすべてchoice modeであること（暗記モードVer.1はchoiceのみ対応）
//
// 【このファイルが知らないもの】
// - DOM・画面遷移・GAS通信・Attempt生成（app.js側の責務）
// - runnerのRound進行state（features/memorize/memorize-runner.jsが正本のまま）
// - questionId自体の空文字・重複チェック（features/memorize/memorize-runner.jsの
//   startMemorizeRun/restoreMemorizeRunが既に保証済みのため、ここでは二重実装しない）
//
// pure function（DOM非依存）。既存のcore/quiz-controller.jsのassembleFixedQuestionSession()
// と同じ「questionId→Question解決＋不足idをfail-closedで検出する」設計思想を踏襲する。

/**
 * @param {string[]} questionIds - 解決したいquestionId（順序を維持する）
 * @param {Array<Object>} availableQuestions - 検索対象のQuestion object配列
 *   （fieldIdに対応する、既にnormalize済みの問題一覧。呼び出し元が
 *   filterManager.getNormalizedQuestionsForSubject(fieldId)等で用意する）
 * @returns {{ok:true, questions:Array<Object>}|{ok:false, errorMessage:string}}
 */
export function resolveMemorizeQuestions(questionIds, availableQuestions) {
  const ids = Array.isArray(questionIds) ? questionIds : [];
  const pool = Array.isArray(availableQuestions) ? availableQuestions : [];

  const byId = new Map(pool.map((question) => [question.questionId, question]));

  const resolved = [];
  const missingIds = [];

  ids.forEach((id) => {
    const question = byId.get(id);
    if (question) {
      resolved.push(question);
    } else {
      missingIds.push(id);
    }
  });

  if (missingIds.length > 0) {
    return {
      ok: false,
      errorMessage: `存在しない問題が含まれています: ${missingIds.join(", ")}`
    };
  }

  const nonChoiceIds = resolved
    .filter((question) => question.mode !== "choice")
    .map((question) => question.questionId);

  if (nonChoiceIds.length > 0) {
    return {
      ok: false,
      errorMessage: `暗記モードVer.1はchoice形式の問題のみ対応しています（非対応の問題: ${nonChoiceIds.join(", ")}）`
    };
  }

  return { ok: true, questions: resolved };
}
