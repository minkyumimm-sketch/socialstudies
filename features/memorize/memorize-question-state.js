// features/memorize/memorize-question-state.js
//
// 暗記モード-2 STEP M2-2: questionId単位の「記憶状態」を、既存のAttempt/AnswerRecordから
// 派生計算するだけのpure module。DOM・GAS通信・Repository・Service・Runner singletonの
// いずれにも依存しない（同じ入力なら必ず同じ出力、副作用なし）。
//
// 【Source of Truth（M2-1確定）】
// 専用の永続stateは一切持たない。正本はAttempt（reviewRound・runId・sourceType等）と
// AnswerRecord（selectedChoice・isCorrect等）のみ。本moduleはそれらをjoinして
// 3-state（unseen/learning/mastered）を都度導出するだけの読み取り専用の下流レイヤーであり、
// M1のRecall Gate・Round選別・Run完了条件・Runner/Resume lifecycle・Weakness・Historyの
// いずれも一切変更・参照しない（責務は完全に独立）。
//
// 【scope（M2-1確定）】
// runIdだけでは理論上の別生徒間衝突を排除できないため、studentId + runIdを
// 正式scope keyとする（安全側を優先）。

import { UNKNOWN_ANSWER_VALUE } from "../../config/unknown-answer.js";
import { MEMORIZE_SOURCE_TYPE } from "./memorize-runner-state.js";

/**
 * 3-stateの正式な内部値（M2-1確定）。
 * unseen: 対象questionIdだが、有効AnswerRecordがまだ0件。
 * learning: 1件以上の有効イベントがあるが、correctイベントがまだ無い。
 * mastered: 1件以上のcorrectイベントがある（一度masteredになったら、
 *   このRun内では後続の異常イベントが混ざってもlearningへは戻さない）。
 */
export const MEMORIZE_QUESTION_STATE = {
  UNSEEN: "unseen",
  LEARNING: "learning",
  MASTERED: "mastered"
};

const ERROR_MESSAGE = "暗記モードの記憶状態を計算できませんでした。";

/**
 * @param {unknown} value
 * @returns {string}
 */
function toTrimmedString_(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Round番号として妥当な値のみを数値で返す（それ以外はnull）。
 * memorize-runner.jsのtoRoundNumber_と同じ検証方針（booleanやオブジェクトが
 * Number()経由で1に化けるのを防ぐため、number/数値文字列のみ許容する）。
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toRoundNumber_(value) {
  let numeric = null;

  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    numeric = Number(value.trim());
  }

  if (numeric === null || !Number.isInteger(numeric) || numeric < 1) return null;
  return numeric;
}

/**
 * 全要素が「空でない文字列」で重複が無い場合のみ配列のコピーを返す（それ以外はnull）。
 * memorize-runner.js/memorize-round-selector.jsのtoStrictQuestionIdList_と同じ検証方針だが、
 * 本APIでは空配列（0問対象）を正常な入力として許容する点だけが異なる
 * （0問Run自体はM1側で開始されないため、pure functionとしては安全に空結果を返せばよい）。
 *
 * @param {unknown} ids
 * @returns {string[]|null}
 */
function toOrderedUniqueQuestionIdList_(ids) {
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
 * 指定したstudentId・runIdの範囲に属する、有効なmemorize Attemptだけを抽出する。
 *
 * 範囲外（sourceType不一致・studentId不一致・runId不一致）のAttemptは単純に除外する
 * （呼び出し側が生徒の全履歴をそのまま渡せるようにするため、features/weakness/
 * weakness-service.jsのcollectWeaknessAnswerRecords()と同じ「join前にscopeで絞る」方針）。
 *
 * 一方、範囲内と判定されたAttemptの中にreviewRound不正・attemptId欠落・reviewRound重複が
 * 1件でもあれば、そのRun全体を安全に判定できないためfail-closedで{ok:false}を返す
 * （features/history/memorize-run-group-model.jsの「1件でも不正ならグループ全体をfallback」と
 * 同じ考え方を、本APIでは「呼び出し単位の結果全体をng扱いにする」形で踏襲する）。
 *
 * @param {unknown} attempts
 * @param {string} studentId
 * @param {string} runId
 * @returns {{ok:true, attemptIdToReviewRound:Map<string, number>}|{ok:false}}
 */
function selectValidAttemptsInScope_(attempts, studentId, runId) {
  if (!Array.isArray(attempts)) return { ok: false };

  const inScope = attempts.filter((attempt) => {
    return (
      attempt?.sourceType === MEMORIZE_SOURCE_TYPE &&
      toTrimmedString_(attempt?.studentId) === studentId &&
      toTrimmedString_(attempt?.runId) === runId
    );
  });

  const attemptIdToReviewRound = new Map();
  const seenReviewRounds = new Set();

  for (const attempt of inScope) {
    const attemptId = toTrimmedString_(attempt?.attemptId);
    const reviewRound = toRoundNumber_(attempt?.reviewRound);

    if (!attemptId || reviewRound === null) return { ok: false };
    if (attemptIdToReviewRound.has(attemptId)) return { ok: false };
    if (seenReviewRounds.has(reviewRound)) return { ok: false };

    seenReviewRounds.add(reviewRound);
    attemptIdToReviewRound.set(attemptId, reviewRound);
  }

  return { ok: true, attemptIdToReviewRound };
}

/**
 * 1件のAnswerRecordを、unknown/correct/incorrectのいずれかへ正規化する。
 *
 * M1の正式契約（config/unknown-answer.js）どおり、selectedChoiceが
 * UNKNOWN_ANSWER_VALUEのときisCorrectは常にfalseのはず。この契約に反する入力
 * （selectedChoice=UNKNOWN_ANSWER_VALUE かつ isCorrect=true）が来た場合は、
 * 黙ってcorrectと解釈せずfail-closedで{ok:false}を返す。
 *
 * @param {unknown} record
 * @returns {{ok:true, outcome:"unknown"|"correct"|"incorrect"}|{ok:false}}
 */
function normalizeOutcome_(record) {
  const selectedChoice = record?.selectedChoice;
  const isCorrect = record?.isCorrect;

  if (typeof selectedChoice !== "string" || selectedChoice === "") return { ok: false };
  if (typeof isCorrect !== "boolean") return { ok: false };

  if (selectedChoice === UNKNOWN_ANSWER_VALUE) {
    if (isCorrect !== false) return { ok: false };
    return { ok: true, outcome: "unknown" };
  }

  return { ok: true, outcome: isCorrect ? "correct" : "incorrect" };
}

/**
 * 指定したstudentId・runIdの範囲について、questionId単位の3-state
 * （unseen/learning/mastered）を、既存のAttempt/AnswerRecordだけから導出する。
 *
 * 【入力契約】
 * - questionIds: 対象questionIdの母集団を呼び出し側が明示的に渡す（本関数はRunner
 *   singleton・Progress repositoryへ一切アクセスしないため、「一度も回答されていない
 *   questionId」の存在を知る手段が無い。母集団を引数で受け取ることでこれを解決する）。
 * - attempts/answerRecords: 呼び出し側が保持する配列をそのまま渡してよい（生徒の
 *   全履歴でも構わない。本関数側でstudentId・runIdの範囲へ絞り込む）。
 * - 入力配列はいずれも変更しない（複製してから扱う）。
 *
 * 【出力】
 * questionIdsの入力順を維持したまま、{questionId, state}の配列を返す。
 *
 * 【fail-closedの方針】
 * 範囲内データに矛盾（reviewRound不正・重複、AnswerRecordの型不正、UNKNOWN契約違反等）が
 * あれば、部分的な結果を返さず{ok:false, errorMessage}を返す。
 * 範囲外のquestionId・範囲外のAttempt/AnswerRecordは単に無視する（呼び出し側が
 * 未フィルタのデータをそのまま渡せるようにするため）。
 *
 * @param {Object} params
 * @param {string} params.studentId
 * @param {string} params.runId
 * @param {string[]} params.questionIds - 対象questionIdの母集団（重複禁止、空配列可）
 * @param {Array<Object>} [params.attempts] - 生徒のAttempt群（範囲外は無視される）
 * @param {Array<Object>} [params.answerRecords] - 生徒のAnswerRecord群（範囲外は無視される）
 * @returns {{ok:true, states:Array<{questionId:string, state:string}>}|{ok:false, errorMessage:string}}
 */
export function deriveMemorizeQuestionStates({
  studentId,
  runId,
  questionIds,
  attempts = [],
  answerRecords = []
} = {}) {
  const trimmedStudentId = toTrimmedString_(studentId);
  const trimmedRunId = toTrimmedString_(runId);

  if (!trimmedStudentId || !trimmedRunId) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }

  const orderedQuestionIds = toOrderedUniqueQuestionIdList_(questionIds);
  if (orderedQuestionIds === null) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }

  const attemptsResult = selectValidAttemptsInScope_(attempts, trimmedStudentId, trimmedRunId);
  if (!attemptsResult.ok) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }

  const { attemptIdToReviewRound } = attemptsResult;
  const questionIdSet = new Set(orderedQuestionIds);

  if (!Array.isArray(answerRecords)) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }

  // questionIdごとに、そのRun内のイベント（reviewRound + outcome）を集める。
  const eventsByQuestionId = new Map();
  const seenAttemptQuestionKeys = new Set();

  for (const record of answerRecords) {
    const attemptId = toTrimmedString_(record?.attemptId);
    if (!attemptIdToReviewRound.has(attemptId)) continue; // 範囲外Attempt由来は無視する

    const questionId = toTrimmedString_(record?.questionId);
    if (!questionId || !questionIdSet.has(questionId)) continue; // 対象外questionIdは無視する

    const attemptQuestionKey = `${attemptId}::${questionId}`;
    if (seenAttemptQuestionKeys.has(attemptQuestionKey)) {
      // 同一Attempt内で同一questionIdの解答が複数存在するのは、既存の複合キー契約
      // （attemptId::questionId）に反する異常入力のため、fail-closedとする。
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }
    seenAttemptQuestionKeys.add(attemptQuestionKey);

    const outcomeResult = normalizeOutcome_(record);
    if (!outcomeResult.ok) {
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }

    const reviewRound = attemptIdToReviewRound.get(attemptId);
    if (!eventsByQuestionId.has(questionId)) eventsByQuestionId.set(questionId, []);
    eventsByQuestionId.get(questionId).push({ reviewRound, outcome: outcomeResult.outcome });
  }

  const states = orderedQuestionIds.map((questionId) => {
    const events = eventsByQuestionId.get(questionId);

    if (!events || events.length === 0) {
      return { questionId, state: MEMORIZE_QUESTION_STATE.UNSEEN };
    }

    // 一度でもcorrectイベントがあれば、入力順序に関わらずmasteredとする
    // （M1確定仕様「1回正解＝そのRunでは習得」、M2-1確定方針「masteredは後戻りさせない」）。
    const hasMastered = events.some((event) => event.outcome === "correct");
    return {
      questionId,
      state: hasMastered ? MEMORIZE_QUESTION_STATE.MASTERED : MEMORIZE_QUESTION_STATE.LEARNING
    };
  });

  return { ok: true, states };
}
