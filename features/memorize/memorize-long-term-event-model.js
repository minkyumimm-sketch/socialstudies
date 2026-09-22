// features/memorize/memorize-long-term-event-model.js
//
// 暗記モード-3 STEP M3-2: 複数runIdにまたがるAttempt/AnswerRecordから、
// studentId + fieldId + questionId単位で「各Runの初回recall結果」を時系列に
// 再構築するだけのpure module。DOM・GAS通信・Repository・Service・Runner singleton・
// M2-2 module（memorize-question-state.js）のいずれにも依存しない
// （同じ入力なら必ず同じ出力、副作用なし）。
//
// 【責務（M3-1確定）】
// - Source of Truthは既存Attempt+AnswerRecordのみ。M3専用の永続stateは一切持たない。
// - long-term key = studentId + fieldId + questionId（runIdはscope keyではなく、
//   複数runIdを横断してイベント系列として統合する対象）。
// - 1 Runにつき対象questionの長期eventは最大1件、その成否シグナルはRound1
//   （そのRunで最初のrecall）のAnswerRecordのみを採用する（M1-7 Weaknessの
//   「各run/questionの最初のrecall結果」と同じ思想だが、Weakness moduleには
//   一切依存しない独立実装）。Round2以降の結果はこのeventのfirstRecallOutcomeを
//   上書きしない。
//
// 【本moduleでは絶対にやらないこと（M3-2スコープ外）】
// schedule計算・stage計算・nextDue計算・isDue判定・tracked/retained判定・
// 今日の復習対象抽出・Review Run起動・UI。これらはすべてM3-3以降の責務。

import { UNKNOWN_ANSWER_VALUE } from "../../config/unknown-answer.js";
import { MEMORIZE_SOURCE_TYPE } from "./memorize-runner-state.js";

const ERROR_MESSAGE = "暗記モードの長期学習履歴を計算できませんでした。";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
// production正本のtimestampは常にnew Date().toISOString()形式（UTC・Z終端）。
// 曖昧な形式（"2026/09/22"等）を許容しないよう、この形式に限定する。
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
 * memorize-question-state.js/memorize-runner.jsのtoRoundNumber_と同じ検証方針。
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
 * production正本のtimestamp形式（UTC ISO8601、Z終端）に厳密一致し、かつ有限timestamp
 * として解釈できる場合のみ、そのミリ秒値を返す（それ以外はnull）。
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
 * memorize-question-state.jsのnormalizeOutcome_と同じ判定方針を独立実装する
 * （M3-2はM2-2 moduleに直接依存しない、という設計方針のため意図的に複製する）。
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
 *
 * 範囲外（sourceType不一致・studentId不一致）のAttemptは単純に除外する
 * （呼び出し側が生徒の全履歴をそのまま渡せるようにするため）。
 * 範囲内と判定されたAttemptにattemptId欠落・runId欠落・reviewRound不正・
 * 同一runId内のreviewRound重複が1件でもあれば、その生徒のmemorize履歴全体を
 * 安全に判定できないためfail-closedで{ok:false}を返す（呼び出し単位のwhole-call
 * fail-closed。データ不整合を「復習対象なし」と誤認させないため、部分的に
 * 握り潰さない）。
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
 * studentId + fieldId + questionId単位で「各Runの初回recall結果（reviewRound===1の
 * AnswerRecordのoutcome）」を時系列に再構築する。
 *
 * 【入力契約】
 * - attempts/answerRecords: 生徒の全履歴でも構わない（本関数側でstudentId・
 *   sourceType="memorize"の範囲へ絞り込む）。入力配列はいずれも変更しない。
 * - questionごとにAttempt群を横断して抽出するbulk APIとする（1 questionずつ
 *   呼び出すAPIだと、M3-4で全questionのderiveが必要になった際にO(Q×履歴件数)に
 *   なってしまうため。本APIはO(attempts数 + answerRecords数)で全questionを
 *   一度に処理できる）。
 *
 * 【出力】
 * { studentId, fieldId, questionId, events } の配列。questions配列自体は
 * fieldId昇順→questionId昇順（compareQuestionGroups_、2026-09-22確定の正式
 * ordering contract）で並べる。入力attempts/answerRecordsの走査順には一切依存しない
 * （複数question groupを跨ぐ入力shuffleでもJSON全体が完全に一致するdeterministic
 * output）。events内はeventAt昇順（同一eventAtはrunId昇順でtie-break、
 * こちらも入力順に依存しない）。各eventは { runId, firstRecallOutcome, eventAt,
 * calendarDate } のみ（scheduleに関するfield・reviewRound自体（常に1のため冗長）は
 * 含めない）。
 *
 * 【fail-closedの方針】
 * 対象生徒のmemorize履歴内での構造矛盾（Attempt側の不正・reviewRound===1の
 * AnswerRecordの型不正・UNKNOWN契約違反・重複等）があれば、部分的な結果を返さず
 * whole-callで{ok:false, errorMessage}を返す（データ不整合を「復習対象なし」と
 * 誤認しないため）。範囲外（別student・memorize以外のsourceType・対象外の
 * questionId等）は単に無視する。
 *
 * @param {Object} params
 * @param {string} params.studentId
 * @param {Array<Object>} [params.attempts] - 生徒のAttempt群（範囲外は無視される）
 * @param {Array<Object>} [params.answerRecords] - 生徒のAnswerRecord群（範囲外は無視される）
 * @returns {{ok:true, questions:Array<{studentId:string, fieldId:string, questionId:string,
 *   events:Array<{runId:string, firstRecallOutcome:"unknown"|"correct"|"incorrect",
 *   eventAt:string, calendarDate:string}>}>}|{ok:false, errorMessage:string}}
 */
export function deriveMemorizeLongTermEvents({ studentId, attempts = [], answerRecords = [] } = {}) {
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

  // groupKey(fieldId::questionId) -> { studentId, fieldId, questionId, events }
  const groups = new Map();
  const groupOrder = [];
  const seenAttemptQuestionKeys = new Set();

  for (const record of answerRecords) {
    const attemptId = toTrimmedString_(record?.attemptId);
    const attemptInfo = attemptIdToInfo.get(attemptId);
    if (!attemptInfo) continue; // 範囲外Attempt由来（別student・memorize以外等）は無視する

    // 長期eventの成否シグナルは、そのRunの最初のRound（reviewRound===1）のみを採用する。
    // Round2以降のAnswerRecordはevent生成に関与しない（M3-1/M3-2確定方針）。
    if (attemptInfo.reviewRound !== 1) continue;

    const fieldId = toTrimmedString_(record?.fieldId);
    const questionId = toTrimmedString_(record?.questionId);
    if (!fieldId || !questionId) return { ok: false, errorMessage: ERROR_MESSAGE };

    const attemptQuestionKey = `${attemptId}::${fieldId}::${questionId}`;
    if (seenAttemptQuestionKeys.has(attemptQuestionKey)) {
      // 同一Attempt内で同一fieldId+questionIdの解答が複数存在するのは、既存の複合キー
      // 契約（attemptId::questionId）に反する異常入力のため、fail-closedとする。
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }
    seenAttemptQuestionKeys.add(attemptQuestionKey);

    const outcomeResult = normalizeOutcome_(record);
    if (!outcomeResult.ok) {
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }

    const eventAtMs = toValidUtcTimestampMs_(record?.answeredAt);
    if (eventAtMs === null) {
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }

    const groupKey = `${fieldId}::${questionId}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        studentId: trimmedStudentId,
        fieldId,
        questionId,
        events: []
      });
      groupOrder.push(groupKey);
    }

    groups.get(groupKey).events.push({
      runId: attemptInfo.runId,
      firstRecallOutcome: outcomeResult.outcome,
      eventAt: record.answeredAt,
      eventAtMs,
      calendarDate: toJstCalendarDate_(eventAtMs)
    });
  }

  const questions = groupOrder.map((groupKey) => {
    const group = groups.get(groupKey);
    const sortedEvents = [...group.events]
      .sort((a, b) => {
        if (a.eventAtMs !== b.eventAtMs) return a.eventAtMs - b.eventAtMs;
        return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
      })
      .map(({ runId, firstRecallOutcome, eventAt, calendarDate }) => ({
        runId,
        firstRecallOutcome,
        eventAt,
        calendarDate
      }));

    return {
      studentId: group.studentId,
      fieldId: group.fieldId,
      questionId: group.questionId,
      events: sortedEvents
    };
  });

  // questions配列自体は、入力の走査順（groupOrder）に依存させず、正式ordering
  // contract（fieldId昇順→questionId昇順）で並べ替える。これにより、複数question
  // groupを跨いでattempts/answerRecordsの入力順序が変わっても、出力JSON全体が
  // 完全に一致するdeterministic outputになる（2026-09-22確定）。
  questions.sort(compareQuestionGroups_);

  return { ok: true, questions };
}
