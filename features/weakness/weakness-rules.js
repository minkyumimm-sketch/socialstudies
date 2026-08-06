// features/weakness/weakness-rules.js
//
// Phase2 Task18-1: 苦手問題判定ルール（docs/architecture/ls-total-test-system-design-v1.md
// 10章）の実体。入力=1問分の解答統計（questionStats）、出力=スコア・該当条件、という
// 単一のシグネチャを持つ純粋関数として実装する（10.2節「確定」の指示どおり）。
//
// 既存の MAP_RENDERERS（renderers/map-click-renderer.js）・QUESTION_MODE_HANDLERS
// （core/question-screen-controller.js）と同じ「差し替え可能なテーブル駆動」の思想を踏襲し、
// 将来ルールベースからAI推薦へ移行する場合も、このファイルの中身だけを差し替えれば済むように、
// 判定条件はテーブル（WEAKNESS_CONDITIONS）として定義する。
//
// AnswerRecord・Attempt・QuestionSet・HistoryServiceのいずれにも依存しない（import一切なし）。
// questionStatsオブジェクトの組み立ては呼び出し側（features/weakness/weakness-service.js）の
// 責務であり、本ファイルは渡された値をそのまま判定するだけの純粋関数群とする
// （judges/answer-judge.jsがDOM非依存の純粋関数群であるのと同じ位置づけ）。

/**
 * @typedef {Object} QuestionStats
 * @property {string} questionId
 * @property {string} fieldId
 * @property {string} unit
 * @property {number} answeredCount - 累計出題回数（そのquestionIdに対するAnswerRecord件数）
 * @property {number} correctCount
 * @property {number} incorrectCount
 * @property {number} correctRate - 0〜1
 * @property {string|null} lastAnsweredAt - 最新の解答日時（ISO文字列）。無ければnull
 * @property {boolean|null} lastIsCorrect - 最新の解答が正解だったか。解答が無ければnull
 */

const LOW_ACCURACY_MIN_ANSWERED_COUNT = 5;
const LOW_ACCURACY_THRESHOLD = 0.5;
const HIGH_INCORRECT_COUNT_THRESHOLD = 3;
const DEFAULT_DORMANT_DAYS_THRESHOLD = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 苦手問題の判定条件テーブル（design doc 10.1節）。
 * 各条件は独立した`check(questionStats): boolean`を持ち、該当した条件の数をそのまま
 * 優先度スコアとする単純加算方式（design doc確定方針）。
 */
const WEAKNESS_CONDITIONS = {
  recentIncorrect: {
    label: "直近の解答が不正解",
    check: (questionStats) => questionStats?.lastIsCorrect === false
  },
  lowAccuracy: {
    label: "低正答率（累計出題5回以上・正答率50%未満）",
    check: (questionStats) =>
      (questionStats?.answeredCount ?? 0) >= LOW_ACCURACY_MIN_ANSWERED_COUNT &&
      (questionStats?.correctRate ?? 0) < LOW_ACCURACY_THRESHOLD
  },
  highIncorrectCount: {
    label: "累積誤答回数が多い（3回以上）",
    check: (questionStats) => (questionStats?.incorrectCount ?? 0) >= HIGH_INCORRECT_COUNT_THRESHOLD
  }
};

/**
 * 【判定】1問分の解答統計から、苦手問題スコアと該当条件を算出する。
 * スコアは該当条件数の単純加算（design doc確定方針）。1件も該当しなければscore=0。
 *
 * @param {QuestionStats} questionStats
 * @returns {{ score: number, matchedConditions: string[] }}
 */
export function scoreQuestionWeakness(questionStats) {
  const matchedConditions = Object.entries(WEAKNESS_CONDITIONS)
    .filter(([, condition]) => condition.check(questionStats))
    .map(([key]) => key);

  return {
    score: matchedConditions.length,
    matchedConditions
  };
}

/**
 * 【判定】1問分の解答統計が「復習推奨（久しぶり）」に該当するかを判定する。
 * 苦手問題（scoreQuestionWeakness）とは別枠の判定（design doc確定方針）。
 * 最終解答日時が無い場合は判定対象外としてfalseを返す。
 *
 * @param {QuestionStats} questionStats
 * @param {{ dormantDays?: number, today?: Date }} [options]
 *   dormantDays省略時は30日（design doc暫定閾値）。todayは省略時は現在時刻。
 * @returns {boolean}
 */
export function isDormantQuestion(questionStats, options = {}) {
  const lastAnsweredAt = questionStats?.lastAnsweredAt;
  if (!lastAnsweredAt) return false;

  const lastAnsweredTimestamp = new Date(lastAnsweredAt).getTime();
  if (Number.isNaN(lastAnsweredTimestamp)) return false;

  const thresholdDays =
    typeof options.dormantDays === "number" ? options.dormantDays : DEFAULT_DORMANT_DAYS_THRESHOLD;
  const referenceDate = options.today instanceof Date ? options.today : new Date();

  const diffDays = (referenceDate.getTime() - lastAnsweredTimestamp) / MILLISECONDS_PER_DAY;
  return diffDays >= thresholdDays;
}
