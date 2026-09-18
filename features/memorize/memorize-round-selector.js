// features/memorize/memorize-round-selector.js
//
// 暗記モードの「次Roundに出題するquestionIdを決める」判定だけを担う純粋関数。
// DOM・GAS通信・runnerState（features/memorize/memorize-runner.jsのモジュール内
// シングルトン）・Attempt生成のいずれにも依存しない（plain dataのみを受け取り返す、
// features/test-set-runner/test-set-review-model.jsと同じ設計方針）。
//
// 【なぜrunner本体から分離するか（M1-1の最重要要件）】
// Ver.1の判定は「そのRoundでisCorrect=falseだった問題（＝不正解＋わからない）」のみだが、
// 将来は以下も再出題の判断材料にしたい：
//   - 解答速度が遅かった正解（recallTimeMs/answerTimeMs、暗記モード-1では記録のみ）
//   - 一度×/わからないだった後に○になった問題（1 Round空けての再確認）
//   - 最後の学習からの経過時間・累積誤答回数（既存AnswerRecord集計から導出可能）
// これらを追加する際に触る場所を本ファイル1つへ閉じ込めるため、runner本体には
// 判定ロジックを一切書かない。将来は selectNextRoundQuestionIds(roundResult, history)
// のように第2引数を増やす想定だが、今回はhistory依存を一切実装しない。
//
// 【「わからない」の扱い】
// 既存実装では「わからない」（config/unknown-answer.jsのUNKNOWN_ANSWER_VALUE）は
// judgeAnswer()を通さず常にisCorrect=falseとして扱われ、core/answer-controller.jsの
// applyAnswerResultがstate.quiz.wrongQuestionsへpushする。したがってVer.1では
// 不正解とわからないをrunnerへ別々に渡す必要はなく、呼び出し元は既存の
// wrongQuestions（＝extractQuestionIds(state.quiz.wrongQuestions)）をそのまま渡せばよい。
// 両者の区別は将来の分析用にAnswerRecord.selectedChoiceへ残る（列追加は不要）。
//
// 【戻り値を配列ではなく結果オブジェクトにした理由】
// 空配列[]は「次Round対象なし＝暗記完了」という正常系の意味を持つため、異常データ時に
// []を返すと「完了」と区別できなくなる。fail-closedを優先し、異常は{ok:false}で返す
// （既存のbuildTestSetReviewGroups()/validateRunIdentity()と同じ結果オブジェクト方式）。

/**
 * 全要素が「空でない文字列」で、かつ重複が無い場合のみ配列のコピーを返す（それ以外はnull）。
 * 正規化・補完・推測は一切行わない（異常データは呼び出し側でrejectさせる）。
 *
 * @param {unknown} ids
 * @returns {string[]|null}
 */
function toStrictQuestionIdList_(ids) {
  if (!Array.isArray(ids)) return null;

  const seen = new Set();
  const result = [];

  for (const id of ids) {
    if (typeof id !== "string" || id === "") return null;
    if (seen.has(id)) return null;
    seen.add(id);
    result.push(id);
  }

  return result;
}

/**
 * 「そのRoundで次Round対象になった問題」の入力を、順序を保ったまま重複排除する。
 * 呼び出し元（UI経路）の積み方次第で同一questionIdが複数回現れ得るため、
 * currentQuestionIdsと異なりduplicateはrejectせず先勝ちで畳み込む
 * （同一集合であると安全に解釈できるため）。空文字・非stringはnullでrejectする。
 *
 * @param {unknown} ids
 * @returns {string[]|null}
 */
function toDedupedQuestionIdList_(ids) {
  if (!Array.isArray(ids)) return null;

  const seen = new Set();
  const result = [];

  for (const id of ids) {
    if (typeof id !== "string" || id === "") return null;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

/**
 * 次Roundに出題するquestionIdを決める（暗記モードVer.1）。
 *
 * Ver.1の規則: 「そのRoundで不正解／わからないだった問題」だけを次Roundへ送る。
 * 即答正解は次Roundから除外する（M1-0設計Gateの案C＝初期版はA、将来Bへ拡張）。
 *
 * 【順序】wrongQuestionIdsの入力順（＝そのRoundで実際に誤答した順）をそのまま維持する。
 * 実際の出題順はquiz/data層がRound開始時に決める（既存pickQuestions()でのシャッフル）ため、
 * 本関数はMath.random()を一切使わない（Nodeテストの決定性を保つ）。
 *
 * 【破壊しない】入力配列・入力要素はいずれも変更せず、新しい配列を返す。
 *
 * @param {Object} params
 * @param {string[]} params.currentQuestionIds - そのRoundの出題集合（1件以上・重複禁止）
 * @param {string[]} params.wrongQuestionIds - そのRoundで次Round対象になった問題
 *   （不正解＋わからない。0件可＝全問正解でRun完了）
 * @returns {{ok:true, questionIds:string[]}|{ok:false, errorMessage:string}}
 *   ok:true かつ questionIds.length===0 は「暗記完了」を意味する正常系。
 */
export function selectNextRoundQuestionIds({ currentQuestionIds, wrongQuestionIds } = {}) {
  const current = toStrictQuestionIdList_(currentQuestionIds);

  if (current === null || current.length === 0) {
    return { ok: false, errorMessage: "現在のRoundの出題データが不正です。" };
  }

  const wrong = toDedupedQuestionIdList_(wrongQuestionIds);

  if (wrong === null) {
    return { ok: false, errorMessage: "次のRoundの対象データが不正です。" };
  }

  // 現在のRoundに含まれないquestionIdが混入している場合は、推測で除外せずfail-closedとする
  // （別Round・別科目の問題が紛れ込んだ状態でRoundを継続させない）。
  const currentSet = new Set(current);
  if (wrong.some((id) => !currentSet.has(id))) {
    return { ok: false, errorMessage: "次のRoundの対象データが現在のRoundと一致しません。" };
  }

  return { ok: true, questionIds: wrong };
}
