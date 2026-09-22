// features/memorize/memorize-run-completion-model.js
//
// 暗記モード-3 STEP M3-2B: M3-3 Research Gateで判明した不足（M3-2 eventはRound1の
// 初回recallしか保持せず、各Run・各questionが最終的にいつ初めてcorrectになったかを
// 表せない）を埋める、独立したpure module。DOM・GAS通信・Repository・Service・
// Runner singleton・M2-2/M3-2 moduleのいずれにも依存しない
// （同じ入力なら必ず同じ出力、副作用なし）。
//
// 【責務】
// 「このRunのこのquestionが、reviewRoundを問わず、いつ初めてcorrectになったか」
// だけを、既存Attempt+AnswerRecordから再構築する。schedule計算（stage/nextDue/
// retained/isDue/same-day collapse/early/overdue）は一切行わない。それらは
// すべてM3-3以降の責務（M3-2Bはその入力の一つを提供するだけ）。
//
// 【M3-2との違い】
// M3-2はreviewRound===1のみを見る（「その日最初に思い出せたか」という
// review success/failureシグナル）。M3-2Bは逆に、reviewRoundを問わず全Roundを
// 横断して「そのRunで対象questionが最終的に習得（mastered）されたか、
// されたなら実際の観測時刻」だけを見る（Attempt.completed===trueという意味ではなく、
// isCorrect===trueのAnswerRecordが最初に現れた瞬間を指す）。両moduleは独立しており、
// 互いに依存しない。M3-3がfieldId+questionId・runIdで両方をjoinして使う。

import { UNKNOWN_ANSWER_VALUE } from "../../config/unknown-answer.js";
import { MEMORIZE_SOURCE_TYPE } from "./memorize-runner-state.js";

const ERROR_MESSAGE = "暗記モードの長期学習履歴を計算できませんでした。";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
// production正本のtimestampは常にnew Date().toISOString()形式（UTC・Z終端）。
// M3-2と同じ厳密さで、曖昧な形式を許容しない（独自の緩いparseをしない）。
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * @param {unknown} value
 * @returns {string}
 */
function toTrimmedString_(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Round番号として妥当な値のみを数値で返す（それ以外はnull）。
 * memorize-long-term-event-model.js/memorize-question-state.jsと同じ検証方針。
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
 * production正本のtimestamp形式（UTC ISO8601、Z終端、ミリ秒必須）に厳密一致し、
 * かつ有限timestampとして解釈できる場合のみ、そのミリ秒値を返す（それ以外はnull）。
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toValidUtcTimestampMs_(value) {
  if (typeof value !== "string" || !ISO_UTC_PATTERN.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {number} n
 * @param {number} width
 * @returns {string}
 */
function padZero_(n, width) {
  return String(n).padStart(width, "0");
}

/**
 * UTC timestamp（ミリ秒）を、日本標準時（Asia/Tokyo、UTC+9固定・DSTなし）基準の
 * "YYYY-MM-DD"へ変換する。環境のローカルタイムゾーンに一切依存しない
 * （UTC msへ+9時間した上でUTC getterを読むだけの純粋な数値計算）。
 * memorize-long-term-event-model.jsの同名privateヘルパーと同一ロジックだが、
 * M3-2Bはpure moduleとして独立させるため意図的に複製する（共通utilityへの
 * リファクタは行わない）。
 *
 * @param {number} utcMs
 * @returns {string}
 */
function toJstCalendarDate_(utcMs) {
  const jst = new Date(utcMs + JST_OFFSET_MS);
  return (
    jst.getUTCFullYear() +
    "-" +
    padZero_(jst.getUTCMonth() + 1, 2) +
    "-" +
    padZero_(jst.getUTCDate(), 2)
  );
}

/**
 * 1件のAnswerRecordを、unknown/correct/incorrectのいずれかへ正規化する。
 * memorize-long-term-event-model.jsのnormalizeOutcome_と同じ判定方針を独立実装する
 * （M3-2/M3-2Bとも互いのmoduleに直接依存しない設計方針のため意図的に複製する）。
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
 * 指定studentIdの範囲に属する、有効なmemorize Attemptだけを抽出し、
 * attemptId -> {runId, reviewRound} の対応を作る。
 * memorize-long-term-event-model.jsのselectValidAttemptsInScope_と同一ロジック
 * （reviewRound===1に限定しない全Round対象、という点も同じ——M3-2はここで作った
 * mapのうちreviewRound===1のものだけを後段で使うが、M3-2Bは全reviewRoundを使う）。
 *
 * 範囲外（sourceType不一致・studentId不一致）のAttemptは単純に除外する。
 * 範囲内と判定されたAttemptにattemptId欠落・runId欠落・reviewRound不正・
 * 同一runId内のreviewRound重複が1件でもあれば、その生徒のmemorize履歴全体を
 * 安全に判定できないためfail-closedで{ok:false}を返す（whole-call fail-closed）。
 *
 * @param {unknown} attempts
 * @param {string} studentId
 * @returns {{ok:true, attemptIdToInfo:Map<string, {runId:string, reviewRound:number}>}|{ok:false}}
 */
function selectValidAttemptsInScope_(attempts, studentId) {
  if (!Array.isArray(attempts)) return { ok: false };

  const inScope = attempts.filter((attempt) => {
    return (
      attempt?.sourceType === MEMORIZE_SOURCE_TYPE &&
      toTrimmedString_(attempt?.studentId) === studentId
    );
  });

  const attemptIdToInfo = new Map();
  const seenRunReviewRoundKeys = new Set();

  for (const attempt of inScope) {
    const attemptId = toTrimmedString_(attempt?.attemptId);
    const runId = toTrimmedString_(attempt?.runId);
    const reviewRound = toRoundNumber_(attempt?.reviewRound);

    if (!attemptId || !runId || reviewRound === null) return { ok: false };
    if (attemptIdToInfo.has(attemptId)) return { ok: false };

    const runReviewRoundKey = `${runId}::${reviewRound}`;
    if (seenRunReviewRoundKeys.has(runReviewRoundKey)) return { ok: false };

    seenRunReviewRoundKeys.add(runReviewRoundKey);
    attemptIdToInfo.set(attemptId, { runId, reviewRound });
  }

  return { ok: true, attemptIdToInfo };
}

/**
 * question group（{fieldId, questionId, ...}）2件を、fieldId昇順→questionId昇順で
 * 比較する。M3-2/M3-2B共通の正式ordering contract（2026-09-22確定）。
 * OS locale・localeCompare()に依存しない、単純なcode-unit順の文字列比較のみを使う
 * （input配列の走査順に依存しないdeterministic outputを保証するため）。
 * memorize-long-term-event-model.jsの同名関数と同一ロジックだが、M3-2/M3-2Bとも
 * 互いのmoduleに直接依存しない設計方針のため意図的に複製する。
 *
 * @param {{fieldId:string, questionId:string}} a
 * @param {{fieldId:string, questionId:string}} b
 * @returns {number}
 */
function compareQuestionGroups_(a, b) {
  if (a.fieldId < b.fieldId) return -1;
  if (a.fieldId > b.fieldId) return 1;
  if (a.questionId < b.questionId) return -1;
  if (a.questionId > b.questionId) return 1;
  return 0;
}

/**
 * 生徒の複数runIdにまたがるmemorize Attempt/AnswerRecordから、
 * studentId + fieldId + questionId単位で「各Runでそのquestionが、reviewRoundを
 * 問わず初めてcorrectになった瞬間（completion）」を再構築する。
 *
 * 【completionの正式定義】
 * 同一studentId + fieldId + questionId + runIdについて、reviewRound 1,2,3…を
 * 横断し、isCorrect===trueとなったAnswerRecordを探す。M1の既存Round選別
 * （一度correctになったquestionは次Round対象から外れる）により、正常データでは
 * 同一Run・同一questionのcorrectは高々1件しか存在しない。万一2件以上存在した場合は
 * 構造矛盾とみなしwhole-callでfail-closedする（「どちらが正しい初回か」を推測しない）。
 * 「最初」の判定基準はreviewRound（Round進行上の順序）であり、answeredAtの前後関係
 * では決めない——ただし正常データでは候補が高々1件のため、この基準は主に
 * 「2件以上あった場合はfail-closedする」という判断のための設計原則として機能する
 * （実際の選択ロジックとしては使われない）。
 *
 * completionが1件も無いquestion（Round1 unknown/incorrectのみで終わった、
 * または未完了のまま一度もcorrectに到達していない）は、questions配列へ出さない
 * （M3-3側がfieldId+questionIdでjoinする際、「completion groupが存在しない」＝
 * 「まだ一度も習得していない」とシンプルに判定できるようにするため）。
 *
 * Attempt.completed===trueかどうかは一切参照しない（Attempt全体の完了状態と、
 * 個別questionの初回correct到達は別概念のため）。
 *
 * 【入力契約】
 * - attempts/answerRecords: 生徒の全履歴でも構わない（本関数側でstudentId・
 *   sourceType="memorize"の範囲へ絞り込む）。入力配列はいずれも変更しない。
 * - bulk API（1 questionずつではなく、生徒の全questionを一度に処理する）。
 *   O(attempts数 + answerRecords数)で完結する（M3-2と同じ設計方針）。
 *
 * 【出力】
 * { studentId, fieldId, questionId, completions } の配列。questions配列自体は
 * fieldId昇順→questionId昇順（compareQuestionGroups_、2026-09-22確定の正式
 * ordering contract。memorize-long-term-event-model.jsと共通）で並べる。入力
 * attempts/answerRecordsの走査順には一切依存しない（複数question groupを跨ぐ
 * 入力shuffleでもJSON全体が完全に一致するdeterministic output）。completions内は
 * completedAt昇順（同時刻はrunId昇順でtie-break、こちらも入力順に依存しない）。
 * 各completionは { runId, completedAt, calendarDate } のみ
 * （stage/nextDueDate/retained/isDue/firstRecallOutcome等、M3-3以降の責務に
 * 属するfieldは一切含めない）。同一questionを複数runIdで学習した場合、
 * すべてのRunのcompletionを保持する（圧縮しない。同日collapseはM3-3の責務）。
 *
 * 【fail-closedの方針】
 * 対象生徒のmemorize履歴内での構造矛盾（Attempt側の不正・AnswerRecordの型不正・
 * UNKNOWN契約違反・同一Attempt内の重複・同一Run/questionでの複数correct等）が
 * あれば、部分的な結果を返さずwhole-callで{ok:false, errorMessage}を返す。
 * 範囲外（別student・memorize以外のsourceType・対象外のattemptId由来）は無視する。
 *
 * @param {Object} params
 * @param {string} params.studentId
 * @param {Array<Object>} [params.attempts] - 生徒のAttempt群（範囲外は無視される）
 * @param {Array<Object>} [params.answerRecords] - 生徒のAnswerRecord群（範囲外は無視される）
 * @returns {{ok:true, questions:Array<{studentId:string, fieldId:string, questionId:string,
 *   completions:Array<{runId:string, completedAt:string, calendarDate:string}>}>}
 *   |{ok:false, errorMessage:string}}
 */
export function deriveMemorizeRunCompletionEvents({ studentId, attempts = [], answerRecords = [] } = {}) {
  const trimmedStudentId = toTrimmedString_(studentId);
  if (!trimmedStudentId) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }

  const attemptsResult = selectValidAttemptsInScope_(attempts, trimmedStudentId);
  if (!attemptsResult.ok) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }
  const { attemptIdToInfo } = attemptsResult;

  if (!Array.isArray(answerRecords)) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }

  // groupKey(fieldId::questionId) -> runId -> [{reviewRound, completedAt, completedAtMs}]
  // （correctだったAnswerRecordの候補だけをここへ集める。1 runにつき正常データでは
  // 高々1件のはずで、2件以上あれば後段でwhole-call fail-closedする）。
  const runCandidatesByGroup = new Map();
  const seenAttemptFieldQuestionKeys = new Set();

  for (const record of answerRecords) {
    const attemptId = toTrimmedString_(record?.attemptId);
    const attemptInfo = attemptIdToInfo.get(attemptId);
    if (!attemptInfo) continue; // 範囲外Attempt由来（別student・memorize以外等）は無視する

    const fieldId = toTrimmedString_(record?.fieldId);
    const questionId = toTrimmedString_(record?.questionId);
    if (!fieldId || !questionId) return { ok: false, errorMessage: ERROR_MESSAGE };

    const attemptFieldQuestionKey = `${attemptId}::${fieldId}::${questionId}`;
    if (seenAttemptFieldQuestionKeys.has(attemptFieldQuestionKey)) {
      // 同一Attempt内で同一fieldId+questionIdの解答が複数存在するのは、既存の複合キー
      // 契約（attemptId::questionId）に反する異常入力のため、fail-closedとする。
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }
    seenAttemptFieldQuestionKeys.add(attemptFieldQuestionKey);

    const outcomeResult = normalizeOutcome_(record);
    if (!outcomeResult.ok) {
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }

    const answeredAtMs = toValidUtcTimestampMs_(record?.answeredAt);
    if (answeredAtMs === null) {
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }

    if (outcomeResult.outcome !== "correct") continue; // completion候補ではない（validationは既に完了済み）

    const groupKey = `${fieldId}::${questionId}`;
    if (!runCandidatesByGroup.has(groupKey)) runCandidatesByGroup.set(groupKey, new Map());
    const runCandidates = runCandidatesByGroup.get(groupKey);

    const runId = attemptInfo.runId;
    if (!runCandidates.has(runId)) runCandidates.set(runId, []);
    runCandidates.get(runId).push({
      reviewRound: attemptInfo.reviewRound,
      completedAt: record.answeredAt,
      completedAtMs: answeredAtMs
    });
  }

  // groupKeyの出力順は、completion候補が最初に見つかった順（Mapの挿入順＝
  // 入力answerRecordsの走査順で自然に決まる、first-seen order）とする。
  const questions = [];

  for (const [groupKey, runCandidates] of runCandidatesByGroup) {
    const [fieldId, questionId] = groupKey.split("::");
    const completions = [];

    for (const [runId, candidates] of runCandidates) {
      if (candidates.length > 1) {
        // 同一Run・同一questionでcorrectが複数件存在するのは、M1のRound選別契約
        // （一度correctになった問題は次Round対象から外れる）に反する構造矛盾のため、
        // どちらが正しい初回か推測せずwhole-callでfail-closedする。
        return { ok: false, errorMessage: ERROR_MESSAGE };
      }
      const candidate = candidates[0];
      completions.push({
        runId,
        completedAt: candidate.completedAt,
        completedAtMs: candidate.completedAtMs
      });
    }

    if (completions.length === 0) continue; // 到達しない想定（候補があるのでgroupKeyが存在する時点で必ず1件以上）

    const sortedCompletions = completions
      .sort((a, b) => {
        if (a.completedAtMs !== b.completedAtMs) return a.completedAtMs - b.completedAtMs;
        return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
      })
      .map(({ runId, completedAt, completedAtMs }) => ({
        runId,
        completedAt,
        calendarDate: toJstCalendarDate_(completedAtMs)
      }));

    questions.push({
      studentId: trimmedStudentId,
      fieldId,
      questionId,
      completions: sortedCompletions
    });
  }

  // questions配列自体は、入力の走査順（Map挿入順）に依存させず、正式ordering
  // contract（fieldId昇順→questionId昇順）で並べ替える。これにより、複数question
  // groupを跨いでattempts/answerRecordsの入力順序が変わっても、出力JSON全体が
  // 完全に一致するdeterministic outputになる（2026-09-22確定、M3-2と共通契約）。
  questions.sort(compareQuestionGroups_);

  return { ok: true, questions };
}
