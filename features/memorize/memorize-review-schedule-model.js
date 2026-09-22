// features/memorize/memorize-review-schedule-model.js
//
// 暗記モード-3 STEP M3-3: M3-2 Long-Term Events（Round1 first recall）と
// M3-2B Run Completion Events（reviewRound横断のmastery完了）から、questionごとの
// 長期復習schedule（stage/retained/nextDueDate）をpure deriveするmodule。
// DOM・GAS通信・Repository・Service・Runner singleton・M3-2/M3-2B moduleのいずれにも
// 依存しない（同じ入力なら必ず同じ出力、副作用なし）。current time取得も行わない。
//
// 【責務（M3-3 Research / Design Gate確定）】
// - Source of TruthはM3-2 events + M3-2B completionsのみ。Attempt/AnswerRecordを
//   直接読まない。新規永続stateは一切持たない。
// - 正本方針（案B・2026-09-22確定）: failureを観測した時点では次dueを確定せず、
//   failureより後に成立した最初の未消費completion（同一runIdである必要はない）を
//   re-masteryとして採用し、そのcalendarDate+1日を新しいnextDueDateとする。
// - 一度もcompletionが無いquestionはschedule entryを出さない。schedule entryが
//   あり、かつ retained:false かつ nextDueDate:null は「relearning中（再習得待ち）」
//   を一意に意味する（専用relearning fieldは追加しない）。
//
// 【本moduleでは絶対にやらないこと（M3-3スコープ外）】
// 「今日の復習」選定・Review Run起動・Resume導線・UI。これらはM3-4以降の責務。

const ERROR_MESSAGE = "暗記モードの復習スケジュールを計算できませんでした。";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// production正本のtimestampは常にnew Date().toISOString()形式（UTC・Z終端）。
// M3-2/M3-2Bと同じ厳密さで、曖昧な形式を許容しない。
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_OUTCOMES = new Set(["unknown", "correct", "incorrect"]);

/**
 * @param {unknown} value
 * @returns {string}
 */
function toTrimmedString_(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * production正本のtimestamp形式（UTC ISO8601、Z終端、ミリ秒必須）に厳密一致し、
 * かつ有限timestampとして解釈できる場合のみ、そのミリ秒値を返す（それ以外はnull）。
 * memorize-long-term-event-model.js/memorize-run-completion-model.jsと同じ検証方針。
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
 * "YYYY-MM-DD"へ変換する。環境のローカルタイムゾーンに一切依存しない。
 * memorize-long-term-event-model.js/memorize-run-completion-model.jsの同名private
 * ヘルパーと同一ロジックだが、M3-3もpure moduleとして独立させるため意図的に複製する。
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
 * "YYYY-MM-DD"形式かつ実在する暦日の場合のみtrue（2026-02-30等はfalse）。
 * timezone/locale非依存（UTC基準のDate.UTC往復で検証する）。
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
 * "YYYY-MM-DD"へ、timezone/locale非依存のcalendar date arithmeticでdays日を加算する。
 * UTC midnightとして解釈し、UTC dateとして加算・再フォーマットするだけの純粋な数値計算
 * （うるう年・月末・年末はDate.UTCの正規化に委ねる）。
 * 呼び出し前にisValidCalendarDate_で検証済みであることが前提。
 *
 * @param {string} dateStr
 * @param {number} days
 * @returns {string}
 */
function addCalendarDays_(dateStr, days) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return (
    next.getUTCFullYear() + "-" + padZero_(next.getUTCMonth() + 1, 2) + "-" + padZero_(next.getUTCDate(), 2)
  );
}

/**
 * question group（{fieldId, questionId, ...}）2件を、fieldId昇順→questionId昇順で
 * 比較する。M3-2/M3-2B共通の正式ordering contract（2026-09-22確定）をM3-3へも適用する。
 * OS locale・localeCompare()に依存しない、単純なcode-unit順の文字列比較のみを使う。
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
 * runId昇順（code-unit順）比較。events/completionsの内部sort tie-break専用。
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareRunId_(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 1件のM3-2 eventを検証し、内部処理用の正規化済みオブジェクトを返す（不正ならnull）。
 * eventAtから独立に再計算したJST calendarDateと、渡されたcalendarDateが一致しない場合も
 * 不正として扱う（M3-2側の計算結果を盲目的に信頼せず、表面contractとして再検証する）。
 *
 * @param {unknown} event
 * @returns {{runId:string, outcome:string, eventAtMs:number, calendarDate:string}|null}
 */
function normalizeEvent_(event) {
  const runId = toTrimmedString_(event?.runId);
  const outcome = event?.firstRecallOutcome;
  const eventAtMs = toValidUtcTimestampMs_(event?.eventAt);
  const calendarDate = event?.calendarDate;

  if (!runId) return null;
  if (typeof outcome !== "string" || !VALID_OUTCOMES.has(outcome)) return null;
  if (eventAtMs === null) return null;
  if (!isValidCalendarDate_(calendarDate)) return null;
  if (toJstCalendarDate_(eventAtMs) !== calendarDate) return null;

  return { runId, outcome, eventAtMs, calendarDate };
}

/**
 * 1件のM3-2B completionを検証し、内部処理用の正規化済みオブジェクトを返す（不正ならnull）。
 *
 * @param {unknown} completion
 * @returns {{runId:string, completedAtMs:number, calendarDate:string}|null}
 */
function normalizeCompletion_(completion) {
  const runId = toTrimmedString_(completion?.runId);
  const completedAtMs = toValidUtcTimestampMs_(completion?.completedAt);
  const calendarDate = completion?.calendarDate;

  if (!runId) return null;
  if (completedAtMs === null) return null;
  if (!isValidCalendarDate_(calendarDate)) return null;
  if (toJstCalendarDate_(completedAtMs) !== calendarDate) return null;

  return { runId, completedAtMs, calendarDate };
}

/**
 * M3-2のquestions配列を { "fieldId::questionId" -> {studentId, fieldId, questionId, events} }
 * へ変換する。検証に失敗した場合、または同一question groupが重複していた場合はnullを返す
 * （呼び出し側でwhole-call fail-closedとして扱う）。
 *
 * @param {unknown} longTermQuestions
 * @returns {Map<string, {studentId:string, fieldId:string, questionId:string, events:Array}>|null}
 */
function buildEventGroups_(longTermQuestions) {
  if (!Array.isArray(longTermQuestions)) return null;

  const groups = new Map();

  for (const question of longTermQuestions) {
    const studentId = toTrimmedString_(question?.studentId);
    const fieldId = toTrimmedString_(question?.fieldId);
    const questionId = toTrimmedString_(question?.questionId);
    const events = question?.events;

    if (!studentId || !fieldId || !questionId || !Array.isArray(events)) return null;

    const groupKey = `${fieldId}::${questionId}`;
    if (groups.has(groupKey)) return null; // question group重複

    const normalizedEvents = [];
    const seenRunIds = new Set();

    for (const event of events) {
      const normalized = normalizeEvent_(event);
      if (!normalized) return null;
      if (seenRunIds.has(normalized.runId)) return null; // 同一question内でrunId重複
      seenRunIds.add(normalized.runId);
      normalizedEvents.push(normalized);
    }

    groups.set(groupKey, { studentId, fieldId, questionId, events: normalizedEvents });
  }

  return groups;
}

/**
 * M3-2Bのquestions配列を { "fieldId::questionId" -> {studentId, fieldId, questionId, completions} }
 * へ変換する。buildEventGroups_と同じ検証方針。
 *
 * @param {unknown} completionQuestions
 * @returns {Map<string, {studentId:string, fieldId:string, questionId:string, completions:Array}>|null}
 */
function buildCompletionGroups_(completionQuestions) {
  if (!Array.isArray(completionQuestions)) return null;

  const groups = new Map();

  for (const question of completionQuestions) {
    const studentId = toTrimmedString_(question?.studentId);
    const fieldId = toTrimmedString_(question?.fieldId);
    const questionId = toTrimmedString_(question?.questionId);
    const completions = question?.completions;

    if (!studentId || !fieldId || !questionId || !Array.isArray(completions)) return null;

    const groupKey = `${fieldId}::${questionId}`;
    if (groups.has(groupKey)) return null; // question group重複

    const normalizedCompletions = [];
    const seenRunIds = new Set();

    for (const completion of completions) {
      const normalized = normalizeCompletion_(completion);
      if (!normalized) return null;
      if (seenRunIds.has(normalized.runId)) return null; // 同一question内でrunId重複
      seenRunIds.add(normalized.runId);
      normalizedCompletions.push(normalized);
    }

    if (normalizedCompletions.length === 0) return null; // M3-2B契約上あり得ない（空groupを出さない）

    groups.set(groupKey, { studentId, fieldId, questionId, completions: normalizedCompletions });
  }

  return groups;
}

/**
 * 1question分のevents/completionsから、案B（re-mastery date基準）でschedule 1件を
 * deriveする。completionが1件も無ければnull（schedule entryを出さない）。
 *
 * 【アルゴリズム（M3-3 Research / Design Gate確定・2026-09-22）】
 * 1. 全completionsをcompletedAt昇順→runId昇順でsortし、先頭を initial mastery Day0とする
 *    （そのRunがinitial learningかfailure後のre-masteryかを区別する必要はない——
 *    どちらの場合も「Day0 = そのcompletionのcalendarDate、nextDue = Day0+1」という
 *    同一の式に帰着するため）。
 * 2. 全eventsをeventAt昇順→runId昇順でsortし、Day0のcompletionのtimestampより
 *    厳密に後のeventだけをreview candidateとする（Day0を成立させたRun自身のevent、
 *    および それより前の全eventは「まだmasteryしていない期間のnoise」として除外する）。
 * 3. review candidateを時系列に処理する：
 *    - 直前の処理と同一calendarDateのeventはスキップする（1日1 transitionまで、
 *      stage二重advance禁止と同じ原理をfailure resetにも適用する）。
 *    - correct（かつ現在retainedでない）: 現在のnextDueDateより前（early）なら何もしない。
 *      due/overdueならstageを1つ進め、実際のsuccess calendarDateから次intervalを加算する
 *      （stage2→3はretained化してnextDueDate:null）。retained中のcorrectは何もしない。
 *    - unknown/incorrect（failure）: retained/earliness を問わず即座にstage0・
 *      retained:false・nextDueDate:nullへ倒す。続けて、completion一覧をそのfailureの
 *      eventAtより後で最初に現れる「まだ消費していない」completionを1件だけ探して
 *      re-masteryとして消費する（消費済みcompletionは二度と使わない。cursorは
 *      一方向にのみ進める。§21確定方針）。見つからなければ、以降このquestionに
 *      関して状態が変わることはないため走査を打ち切る（relearning中のまま確定）。
 * 4. 上記を通じてcompletionは常にcompletedAtの昇順でのみ消費されるため、同一
 *    completionが複数回のfailure resetへ再利用されることはない。
 *
 * @param {Array<{runId:string, outcome:string, eventAtMs:number, calendarDate:string}>} events
 * @param {Array<{runId:string, completedAtMs:number, calendarDate:string}>} completions
 * @returns {{stage:number, retained:boolean, nextDueDate:string|null}|null}
 */
function deriveSingleSchedule_(events, completions) {
  if (completions.length === 0) return null;

  const sortedCompletions = [...completions].sort((a, b) => {
    if (a.completedAtMs !== b.completedAtMs) return a.completedAtMs - b.completedAtMs;
    return compareRunId_(a.runId, b.runId);
  });

  const sortedEvents = [...events].sort((a, b) => {
    if (a.eventAtMs !== b.eventAtMs) return a.eventAtMs - b.eventAtMs;
    return compareRunId_(a.runId, b.runId);
  });

  const day0 = sortedCompletions[0];

  let stage = 0;
  let retained = false;
  let nextDueDate = addCalendarDays_(day0.calendarDate, 1);
  let lastTransitionDate = null;
  let completionCursor = 1;

  const reviewEvents = sortedEvents.filter((event) => event.eventAtMs > day0.completedAtMs);

  for (const event of reviewEvents) {
    if (event.calendarDate === lastTransitionDate) continue; // 同日2件目以降は無視する

    if (event.outcome === "correct") {
      if (retained) continue; // retained中のcorrectは維持するだけ
      if (event.calendarDate < nextDueDate) continue; // due前のcorrectはstageを進めない

      const successDate = event.calendarDate;
      if (stage === 0) {
        stage = 1;
        nextDueDate = addCalendarDays_(successDate, 3);
      } else if (stage === 1) {
        stage = 2;
        nextDueDate = addCalendarDays_(successDate, 7);
      } else {
        stage = 3;
        retained = true;
        nextDueDate = null;
      }
      lastTransitionDate = successDate;
      continue;
    }

    // failure（unknown/incorrect）: retained・earliness を問わず即座にreset する
    stage = 0;
    retained = false;
    nextDueDate = null;
    lastTransitionDate = event.calendarDate;

    let resolvedIndex = -1;
    for (let i = completionCursor; i < sortedCompletions.length; i += 1) {
      if (sortedCompletions[i].completedAtMs > event.eventAtMs) {
        resolvedIndex = i;
        break;
      }
    }

    if (resolvedIndex === -1) {
      completionCursor = sortedCompletions.length;
      break; // 以降、このquestionの状態が変わることはない（relearning中のまま確定）
    }

    const reMaster = sortedCompletions[resolvedIndex];
    completionCursor = resolvedIndex + 1;
    nextDueDate = addCalendarDays_(reMaster.calendarDate, 1);
    lastTransitionDate = reMaster.calendarDate;
  }

  return { stage, retained, nextDueDate };
}

/**
 * M3-2 Long-Term Events（deriveMemorizeLongTermEventsの出力questions）と
 * M3-2B Run Completion Events（deriveMemorizeRunCompletionEventsの出力questions）から、
 * questionごとの長期復習schedule（stage/retained/nextDueDate）をbulk deriveする。
 *
 * 【入力契約】
 * - longTermQuestions/completionQuestions: それぞれM3-2/M3-2Bの出力questions配列を
 *   そのまま渡す（本関数はAttempt/AnswerRecordを直接読まない。M3-2/M3-2B moduleを
 *   呼び出す責務も持たない）。同一studentId・単一生徒分の入力を前提とする。
 * - 入力配列はいずれも変更しない。
 *
 * 【出力】
 * { studentId, fieldId, questionId, stage, retained, nextDueDate } の配列。
 * fieldId昇順→questionId昇順（compareQuestionGroups_、M3-2/M3-2Bと共通のordering
 * contract）で並べる。入力配列の走査順には一切依存しない。
 * 一度もcompletionが無いquestionはschedule entryに出さない。
 * schedule entryがあり、かつ retained:false かつ nextDueDate:null は
 * 「relearning中（failureを観測したが、まだre-masteryが成立していない）」を
 * 一意に意味する（専用relearning fieldは追加しない）。
 *
 * 【fail-closedの方針】
 * 入力の構造的矛盾（question group重複、event/completionの型不正、同一question内での
 * runId重複、timestampとcalendarDateの矛盾、M3-2に対応eventの無いcompletion等）が
 * あれば、部分的な結果を返さずwhole-callで{ok:false, errorMessage}を返す。
 *
 * @param {Object} params
 * @param {Array<Object>} [params.longTermQuestions] - M3-2の出力questions配列
 * @param {Array<Object>} [params.completionQuestions] - M3-2Bの出力questions配列
 * @returns {{ok:true, schedules:Array<{studentId:string, fieldId:string, questionId:string,
 *   stage:number, retained:boolean, nextDueDate:string|null}>}|{ok:false, errorMessage:string}}
 */
export function deriveMemorizeReviewSchedules({ longTermQuestions = [], completionQuestions = [] } = {}) {
  const eventGroups = buildEventGroups_(longTermQuestions);
  if (eventGroups === null) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }

  const completionGroups = buildCompletionGroups_(completionQuestions);
  if (completionGroups === null) {
    return { ok: false, errorMessage: ERROR_MESSAGE };
  }

  const schedules = [];

  for (const [groupKey, completionGroup] of completionGroups) {
    const eventGroup = eventGroups.get(groupKey);
    if (!eventGroup) {
      // completionが存在するのに対応するevent groupが無いのは、M3-2/M3-2Bの契約上
      // あり得ない構造矛盾（completionは必ず同じrunIdのRound1 eventを伴うはず）。
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }
    if (eventGroup.studentId !== completionGroup.studentId) {
      return { ok: false, errorMessage: ERROR_MESSAGE };
    }

    const completionRunIds = new Set(completionGroup.completions.map((c) => c.runId));
    const eventRunIds = new Set(eventGroup.events.map((e) => e.runId));
    for (const runId of completionRunIds) {
      if (!eventRunIds.has(runId)) {
        return { ok: false, errorMessage: ERROR_MESSAGE }; // completionのrunIdに対応するeventが無い
      }
    }

    // correctなoutcomeを持つeventは、M3-2Bの定義上、同一runId・同一timestampの
    // completionを必ず伴うはず（Round1 correct自体がcompletionの成立条件を満たすため）。
    for (const event of eventGroup.events) {
      if (event.outcome !== "correct") continue;
      const matchingCompletion = completionGroup.completions.find((c) => c.runId === event.runId);
      if (!matchingCompletion || matchingCompletion.completedAtMs !== event.eventAtMs) {
        return { ok: false, errorMessage: ERROR_MESSAGE };
      }
    }

    // 同一runIdについて、completionはそのrunの最初のevent（Round1）以降でなければならない。
    for (const completion of completionGroup.completions) {
      const matchingEvent = eventGroup.events.find((e) => e.runId === completion.runId);
      if (matchingEvent && completion.completedAtMs < matchingEvent.eventAtMs) {
        return { ok: false, errorMessage: ERROR_MESSAGE };
      }
    }

    const derived = deriveSingleSchedule_(eventGroup.events, completionGroup.completions);
    if (derived === null) continue; // 到達しない想定（completions.length>0を上で保証済み）

    schedules.push({
      studentId: completionGroup.studentId,
      fieldId: completionGroup.fieldId,
      questionId: completionGroup.questionId,
      stage: derived.stage,
      retained: derived.retained,
      nextDueDate: derived.nextDueDate
    });
  }

  schedules.sort(compareQuestionGroups_);

  return { ok: true, schedules };
}

/**
 * schedule 1件について、指定した"today"（JST calendar date、呼び出し側が生成する）
 * 時点で復習対象（due）かどうかを判定する。本関数自身は現在時刻を一切取得しない。
 *
 * 正式contract: retained===false AND nextDueDate!==null AND today>=nextDueDate。
 * relearning中（nextDueDate===null）・retained中は常にfalse。
 *
 * @param {Object} params
 * @param {{retained:boolean, nextDueDate:string|null}} params.schedule
 * @param {string} params.today - "YYYY-MM-DD"（JST calendar date、呼び出し側の責務で生成）
 * @returns {boolean}
 */
export function isMemorizeReviewDue({ schedule, today } = {}) {
  if (!schedule || typeof schedule !== "object") return false;
  if (schedule.retained !== false) return false;
  if (typeof schedule.nextDueDate !== "string" || !isValidCalendarDate_(schedule.nextDueDate)) return false;
  if (!isValidCalendarDate_(today)) return false;

  return today >= schedule.nextDueDate;
}
