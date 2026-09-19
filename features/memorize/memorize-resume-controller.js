// features/memorize/memorize-resume-controller.js
//
// 暗記モード-1 STEP M1-4: AttemptProgressからのmemorize Resume専用、
// pure/DOM非依存のvalidation・復元payload構築ヘルパー。
//
// 【責務】
// - AttemptProgress（＋対応するAttempt）が、memorize Resumeとして有効かを
//   fail-closedで検証する（questionId自体の実在性・choice mode検証は行わない。
//   それはfeatures/memorize/memorize-session-controller.jsのresolveMemorizeQuestions()の
//   責務のまま、呼び出し元＝app.jsがこの関数の後に別途呼ぶ想定）
// - 検証済みProgressから、Round再開に必要な復元用データ（表示順を保った
//   Question配列・currentIndex・wrongQuestions用Question配列）を構築する
//
// 【このファイルが知らないもの】
// - DOM・画面遷移・GAS通信・fetch（app.js側の責務）
// - runnerの実行時state（features/memorize/memorize-runner.jsが正本のまま。
//   restoreMemorizeRun()自体はこのファイルから呼ばない）
// - questionId→Question解決（features/memorize/memorize-session-controller.jsの
//   resolveMemorizeQuestions()の責務、二重実装しない）
//
// pure function（DOM非依存）。

/**
 * AttemptProgress（＋対応Attempt）がmemorize Resumeとして有効かをfail-closedで検証する。
 *
 * @param {Object} progress - getAttemptProgress()のprogress部分
 * @param {Object|null} attempt - loadAttempt(progress.attemptId)の結果（ローカルMemoryStorage）
 * @returns {{ok:true}|{ok:false, errorMessage:string}}
 */
export function validateMemorizeResumeProgress(progress, attempt) {
  if (!progress || typeof progress !== "object") {
    return { ok: false, errorMessage: "再開情報が不正です。" };
  }

  if (progress.sourceType !== "memorize") {
    return { ok: false, errorMessage: "暗記モードの再開情報ではありません。" };
  }

  const runId = String(progress.runId || "").trim();
  if (!runId) {
    return { ok: false, errorMessage: "runIdが不正です。" };
  }

  const reviewRound = Number(progress.reviewRound);
  if (!Number.isInteger(reviewRound) || reviewRound < 1) {
    return { ok: false, errorMessage: "reviewRoundが不正です。" };
  }

  const questionIds = Array.isArray(progress.questionIds) ? progress.questionIds : null;
  if (!questionIds || questionIds.length === 0) {
    return { ok: false, errorMessage: "再開対象の問題が空です。" };
  }
  if (questionIds.some((id) => typeof id !== "string" || !id.trim())) {
    return { ok: false, errorMessage: "再開対象の問題idが不正です。" };
  }
  if (new Set(questionIds).size !== questionIds.length) {
    return { ok: false, errorMessage: "再開対象の問題に重複があります。" };
  }

  const currentQuestionIndex = Number(progress.currentQuestionIndex);
  if (
    !Number.isInteger(currentQuestionIndex) ||
    currentQuestionIndex < 0 ||
    currentQuestionIndex > questionIds.length
  ) {
    return { ok: false, errorMessage: "再開位置が不正です。" };
  }

  const wrongQuestionIds = Array.isArray(progress.wrongQuestionIds) ? progress.wrongQuestionIds : null;
  if (!wrongQuestionIds) {
    return { ok: false, errorMessage: "誤答一覧が不正です。" };
  }
  if (new Set(wrongQuestionIds).size !== wrongQuestionIds.length) {
    return { ok: false, errorMessage: "誤答一覧に重複があります。" };
  }
  const questionIdSet = new Set(questionIds);
  if (wrongQuestionIds.some((id) => !questionIdSet.has(id))) {
    return { ok: false, errorMessage: "誤答一覧に対象外の問題が含まれています。" };
  }

  if (!attempt) {
    return { ok: false, errorMessage: "対応するAttemptが見つかりません。" };
  }
  if (attempt.completed === true) {
    return { ok: false, errorMessage: "既に完了したRoundです。" };
  }
  if (attempt.sourceType !== "memorize") {
    return { ok: false, errorMessage: "Attemptのsource Typeが一致しません。" };
  }
  if (String(attempt.runId || "") !== runId) {
    return { ok: false, errorMessage: "AttemptとProgressのrunIdが一致しません。" };
  }
  if (Number(attempt.reviewRound) !== reviewRound) {
    return { ok: false, errorMessage: "AttemptとProgressのreviewRoundが一致しません。" };
  }

  return { ok: true };
}

/**
 * 検証済みProgressと、既に解決済みのQuestion配列（resolveMemorizeQuestions()の結果、
 * progress.questionIds順）から、Round再開に必要な状態データを組み立てる。
 *
 * @param {Object} progress - getAttemptProgress()のprogress部分（validateMemorizeResumeProgress済み）
 * @param {Array<Object>} resolvedQuestions - progress.questionIds順に解決済みのQuestion配列
 * @returns {{quizQuestions:Array<Object>, currentIndex:number, wrongQuestions:Array<Object>}}
 */
export function buildMemorizeResumeQuestionState(progress, resolvedQuestions) {
  const wrongIdSet = new Set(Array.isArray(progress.wrongQuestionIds) ? progress.wrongQuestionIds : []);
  const wrongQuestions = resolvedQuestions.filter((question) => wrongIdSet.has(question.questionId));

  return {
    quizQuestions: [...resolvedQuestions],
    currentIndex: Number(progress.currentQuestionIndex),
    wrongQuestions
  };
}
