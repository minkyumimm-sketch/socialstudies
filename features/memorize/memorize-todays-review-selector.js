// features/memorize/memorize-todays-review-selector.js
//
// 暗記モード-3 STEP M3-4: M3-3 Review Scheduleから、指定studentId・指定fieldIdについて
// 「今日、長期復習対象として選ぶべきquestionId」をpure selectするmodule。
// DOM・GAS通信・Repository・Service・Runner singleton・question masterのいずれにも
// 依存しない（同じ入力なら必ず同じ出力、副作用なし）。current time取得も行わない。
//
// 【責務（M3-4 Research / Design Gate確定）】
// - Source of TruthはM3-3 deriveMemorizeReviewSchedulesの出力schedulesのみ。
// - selector scope = studentId + fieldId単位（1 Review Runに複数fieldを混ぜない、
//   既存Runner/開始UIが単一fieldId前提であるため）。
// - due判定はM3-3のisMemorizeReviewDue()をimportしてそのまま再利用する
//   （M3-4はM3-3の下流moduleであり、due predicateを独自に複製しない）。
// - 件数上限を設けない（dueなら全件返す。間引きはUI/将来責務）。
//
// 【本moduleでは絶対にやらないこと（M3-4スコープ外）】
// question object解決・missing question検出・field mismatch検出（既存
// resolveMemorizeQuestions()を使うM3-5の責務）、unfinished Run確認・Resume/abandon
// （既存confirmAndAbandonResumeBeforeNewAttempt()相当を使うM3-5の責務）、
// runId/sourceType/reviewRoundの生成、Weakness/History更新、UI。

import { isMemorizeReviewDue } from "./memorize-review-schedule-model.js";

const ERROR_MESSAGE = "今日の復習対象を選択できませんでした。";
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {unknown} value
 * @returns {string}
 */
function toTrimmedString_(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * "YYYY-MM-DD"形式かつ実在する暦日の場合のみtrue（2026-02-30等はfalse）。
 * memorize-review-schedule-model.jsの同名private関数と同一ロジックだが、
 * M3-3のprivate helperはexportされていないため意図的に複製する。
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidCalendarDate_(value) {
  if (typeof value !== "string" || !CALENDAR_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(ms);

  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
  );
}

/**
 * questionId昇順（code-unit順）比較。due questionIds出力のtie-break専用。
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareQuestionId_(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 1件のM3-3 schedule entryを検証し、内部処理用の正規化済みオブジェクトを返す
 * （不正ならnull）。M3-3 deriveMemorizeReviewSchedulesの実際の出力contract
 * （retained/stage/nextDueDateの整合性）と照合する。
 *
 * @param {unknown} entry
 * @returns {{questionId:string, stage:number, retained:boolean, nextDueDate:string|null}|null}
 */
function normalizeScheduleEntry_(entry) {
  const questionId = toTrimmedString_(entry?.questionId);
  const stage = entry?.stage;
  const retained = entry?.retained;
  const nextDueDate = entry?.nextDueDate;

  if (!questionId) return null;
  if (typeof stage !== "number" || !Number.isInteger(stage) || stage < 0 || stage > 3) return null;
  if (typeof retained !== "boolean") return null;

  if (retained === true) {
    // retained: stage=3 かつ nextDueDate=null のみ有効（M3-3実contract）。
    if (stage !== 3 || nextDueDate !== null) return null;
  } else if (nextDueDate === null) {
    // relearning: stage=0 のみ有効（M3-3のfailure resetは常にstage0と同時に発生する）。
    if (stage !== 0) return null;
  } else {
    // active schedule: stage=0|1|2 かつ nextDueDateは実在するYYYY-MM-DD。
    if (stage === 3) return null;
    if (!isValidCalendarDate_(nextDueDate)) return null;
  }

  return { questionId, stage, retained, nextDueDate };
}

/**
 * 指定studentId・fieldIdについて、M3-3 Review Scheduleから「今日、長期復習対象として
 * 選ぶべきquestionId」を全件・deterministicに選択する。
 *
 * 【入力契約】
 * - schedules: deriveMemorizeReviewSchedules()の出力questions配列（studentId混在は
 *   許さない。fieldId混在は許すが、指定fieldId以外のentryはscope-outとして無視する）。
 *   入力配列は変更しない。
 * - today: "YYYY-MM-DD"（JST calendar date、呼び出し側が生成する）。本関数自身は
 *   現在時刻を一切取得しない。
 *
 * 【scope判定（M3-4 Research / Design Gate確定）】
 * 1. 全entryについて、まずstudentIdを確認する。指定studentIdと一致しない
 *    （または判定できないほどmalformed）entryが1件でもあれば、whole-callで
 *    fail-closedする（教室共用端末での他生徒データ混入を黙って無視しない）。
 * 2. studentIdが一致するentryについて、fieldIdを確認する。指定fieldIdと一致しない
 *    （かつ有効な文字列として判定できる）entryはscope-outとして無視する
 *    （他fieldのentry内部がmalformedでも、selected fieldと無関係ならfailにしない）。
 *    ただしfieldId自体が判定不能なほどmalformedなentryは、scope-outとして安全に
 *    無視することができないためfail-closedする。
 * 3. 指定fieldIdに一致するentryのみ、questionId/stage/retained/nextDueDateの
 *    整合性をフルvalidationする。1件でも不正・重複があればfail-closedする。
 *
 * 【due判定】
 * 指定fieldIdの有効なschedule entryそれぞれについて、M3-3の
 * isMemorizeReviewDue({schedule, today})をそのまま呼び出す（due predicateを
 * M3-4で複製しない）。trueのもののみ対象とする。retained・relearning・future
 * （today<nextDueDate）はisMemorizeReviewDue()の既存契約により自然に除外される。
 *
 * 【出力順序】
 * nextDueDate昇順→questionId昇順（code-unit比較、localeCompare()不使用）。
 * 件数上限は設けない（dueなら全件返す）。shuffle・random選択は行わない。
 *
 * 【fail-closedの方針】
 * 入力の構造的矛盾（studentId/fieldId不正、schedules非配列、mixed student、
 * 指定fieldId内でのentry型不正・重複、today不正等）があれば、部分的な結果を返さず
 * whole-callで{ok:false, errorMessage}を返す。エラーを空配列へ変換しない
 * （due 0件の正常successと明確に区別する）。
 *
 * @param {Object} params
 * @param {string} params.studentId
 * @param {string} params.fieldId
 * @param {Array<Object>} [params.schedules] - deriveMemorizeReviewSchedules()の出力questions配列
 * @param {string} params.today - "YYYY-MM-DD"
 * @returns {{ok:true, studentId:string, fieldId:string, questionIds:string[]}|{ok:false, errorMessage:string}}
 */
export function selectTodaysMemorizeReviewQuestionIds({ studentId, fieldId, schedules, today } = {}) {
  const trimmedStudentId = toTrimmedString_(studentId);
  const trimmedFieldId = toTrimmedString_(fieldId);

  if (!trimmedStudentId || !trimmedFieldId) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }

  if (!isValidCalendarDate_(today)) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }

  if (!Array.isArray(schedules)) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }

  const inScopeEntries = [];
  const seenQuestionIds = new Set();

  for (const entry of schedules) {
    const entryStudentId = toTrimmedString_(entry?.studentId);
    if (!entryStudentId || entryStudentId !== trimmedStudentId) {
      // 別student、または判定不能なほどmalformedなstudentIdは、黙って無視せずfail-closedする。
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }

    const entryFieldId = toTrimmedString_(entry?.fieldId);
    if (!entryFieldId) {
      // fieldId自体を判定できないentryはscope-outとして安全に無視できないためfail-closedする。
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }

    if (entryFieldId !== trimmedFieldId) {
      continue; // 指定fieldId以外は正常なscope-out（内部は検証しない）
    }

    const normalized = normalizeScheduleEntry_(entry);
    if (!normalized) {
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }

    if (seenQuestionIds.has(normalized.questionId)) {
      return { ok: false, errorMessage: ERROR_MESSAGE }; // 指定fieldId内でquestionId重複
    }
    seenQuestionIds.add(normalized.questionId);

    inScopeEntries.push(normalized);
  }

  const dueCandidates = inScopeEntries.filter((entry) =>
    isMemorizeReviewDue({ schedule: entry, today })
  );

  const sorted = [...dueCandidates].sort((a, b) => {
    if (a.nextDueDate !== b.nextDueDate) return a.nextDueDate < b.nextDueDate ? -1 : 1;
    return compareQuestionId_(a.questionId, b.questionId);
  });

  return {
    ok: true,
    studentId: trimmedStudentId,
    fieldId: trimmedFieldId,
    questionIds: sorted.map((entry) => entry.questionId)
  };
}
