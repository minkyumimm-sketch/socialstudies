// features/history/history-renderer.js
//
// Phase2 Task23-1〜23-3: 学習履歴詳細画面（history-screen）のDOM描画専用モジュール。
// HistoryServiceへの入口はgetHistoryScreenData(studentId)（本ファイル内の非公開関数）
// の1つに集約し、それ以外の箇所からHistoryServiceの各APIを個別に呼び出すことはしない。
// Repository・Storage・AttemptService・AnswerRecordService・QuestionSetService・
// WeaknessService・HomeServiceへは一切直接アクセスしない。
//
// 「getHistoryScreenData(studentId) → 取得済みデータ → DOM描画」という一方向の流れのみを持ち、
// 正答率計算・日数集計など履歴集計そのものは一切実装しない（HistoryServiceが返した値を
// %表示・整数丸め・日付整形するだけに徹する。既存renderers/*.js・home-renderer.jsと同じ
// 「DOM要素+データ→描画」のみを行う位置づけ）。
//
// 今回はTier1（総回答数・総正答率・累計学習日数・連続学習日数）とTier2（科目別学習状況・
// 最近の学習履歴5件）のみを対象とする。Attempt単位の正解数・正答率・日付別詳細・
// 「もっと見る」等（Tier3相当）は今回実装しない。

import {
  getHistoryDashboard,
  getStudentHistorySummary,
  getFieldDashboards,
  getStudentHistoryList
} from "./history-service.js";
import { SUBJECT_CONFIG } from "../../config/subjects.js";

const RECENT_HISTORY_LIMIT = 5;

/**
 * @typedef {Object} HistoryScreenElements
 * @property {HTMLElement} infoContainer - Tier1/Tier2全体のコンテナ
 * @property {HTMLElement} emptyMessage - 学習履歴が無い場合のメッセージ
 * @property {HTMLElement} errorMessage - 取得失敗時のエラーメッセージ
 * @property {HTMLElement} totalAnswered - 総回答数の表示先
 * @property {HTMLElement} correctRate - 総正答率の表示先
 * @property {HTMLElement} totalStudyDays - 累計学習日数の表示先
 * @property {HTMLElement} currentStreak - 連続学習日数の表示先
 * @property {HTMLElement} subjectList - 科目別学習状況の表示先
 * @property {HTMLElement} recentList - 最近の学習履歴の表示先
 */

function getSubjectLabel(fieldId) {
  return SUBJECT_CONFIG[fieldId]?.label || fieldId || "不明";
}

function formatDateLabel(isoTimestamp) {
  if (!isoTimestamp) return "";
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatPercent(rate) {
  return `${Math.round((rate || 0) * 100)}%`;
}

/**
 * 【非公開・唯一のHistoryService入口】history-screenが必要とするデータをまとめて取得する。
 *
 * 使用するのは以下の4つのみ:
 *   - getHistoryDashboard(studentId): overview（学習日数・連続日数・履歴有無）と
 *     studiedFields（学習済みfieldId一覧）を取得する。
 *   - getStudentHistorySummary(studentId): 総回答数・総正解数・総正答率を取得する
 *     （getHistoryDashboardには含まれないため別途必要）。
 *   - getFieldDashboards(studentId, fieldIds): 科目別のAttempt数・回答数・正答率を取得する。
 *     fieldIdsはgetHistoryDashboard()が返したstudiedFieldsから組み立てる
 *     （getStudiedFields()を別途呼び直さない）。
 *   - getStudentHistoryList(studentId, {order:"desc", limit:5}): 最近の学習履歴5件を取得する。
 *
 * getHistoryOverview()・getStudiedFields()は個別に呼ばない（getHistoryDashboard()が
 * 既に内包しているため、同じ情報を重複取得しない）。
 *
 * @param {string} studentId
 * @returns {{
 *   dashboard: ReturnType<typeof getHistoryDashboard>,
 *   summary: ReturnType<typeof getStudentHistorySummary>,
 *   fieldDashboards: ReturnType<typeof getFieldDashboards>,
 *   recentHistory: ReturnType<typeof getStudentHistoryList>
 * }}
 */
function getHistoryScreenData(studentId) {
  const dashboard = getHistoryDashboard(studentId);
  const summary = getStudentHistorySummary(studentId);
  const fieldIds = dashboard.studiedFields.map((field) => field.fieldId);
  const fieldDashboards = getFieldDashboards(studentId, fieldIds);
  const recentHistory = getStudentHistoryList(studentId, { order: "desc", limit: RECENT_HISTORY_LIMIT });

  return { dashboard, summary, fieldDashboards, recentHistory };
}

/**
 * studentId未指定、または学習履歴が0件の場合の空状態を表示する。
 * @param {HistoryScreenElements} elements
 */
function showHistoryEmptyState(elements) {
  elements.infoContainer.classList.add("hidden");
  elements.emptyMessage.classList.remove("hidden");
  elements.errorMessage.textContent = "";
}

/**
 * getHistoryScreenData()取得失敗時のエラー状態を表示する。
 * @param {HistoryScreenElements} elements
 */
function showHistoryErrorState(elements) {
  elements.infoContainer.classList.add("hidden");
  elements.emptyMessage.classList.add("hidden");
  elements.errorMessage.textContent = "学習履歴の取得に失敗しました。時間をおいて再度お試しください。";
}

/**
 * Tier1（総回答数・総正答率・累計学習日数・連続学習日数）を描画する。
 * summary.overallCorrectRate・overview.totalStudyDays・overview.currentStudyStreakは
 * いずれもHistoryServiceが計算済みの値をそのまま%表示・文字列整形するだけで、
 * 正答率・日数の再計算は行わない。
 *
 * @param {HistoryScreenElements} elements
 * @param {ReturnType<typeof getHistoryScreenData>["summary"]} summary
 * @param {ReturnType<typeof getHistoryScreenData>["dashboard"]["overview"]} overview
 */
function renderTier1(elements, summary, overview) {
  elements.totalAnswered.textContent = `${summary.answeredQuestions}問`;
  elements.correctRate.textContent = formatPercent(summary.overallCorrectRate);
  elements.totalStudyDays.textContent = `${overview.totalStudyDays}日`;
  elements.currentStreak.textContent = `${overview.currentStudyStreak}日`;
}

/**
 * Tier2-A: 科目別学習状況を描画する。
 * getFieldDashboards()が返したsummary（attemptCount/answeredQuestions/overallCorrectRate）を
 * そのまま表示するだけで、独自の科目別集計は行わない。科目名はconfig/subjects.jsの
 * SUBJECT_CONFIGのみを使用する（独自の科目名マッピングは作らない）。
 *
 * @param {ReturnType<typeof getFieldDashboards>} fieldDashboards
 * @param {HTMLElement} listElement
 */
function renderSubjectList(fieldDashboards, listElement) {
  listElement.innerHTML = "";

  const items = Array.isArray(fieldDashboards) ? fieldDashboards : [];
  if (items.length === 0) return;

  const title = document.createElement("p");
  title.className = "history-section-title";
  title.textContent = "科目別学習状況";
  listElement.appendChild(title);

  items.forEach((field) => {
    const item = document.createElement("div");
    item.className = "history-subject-item";

    const name = document.createElement("span");
    name.className = "history-subject-item-name";
    name.textContent = getSubjectLabel(field.fieldId);

    const detail = document.createElement("span");
    detail.className = "history-subject-item-detail";
    const attemptCount = field.summary?.attemptCount ?? 0;
    const answeredQuestions = field.summary?.answeredQuestions ?? 0;
    const rate = formatPercent(field.summary?.overallCorrectRate);
    detail.textContent = `${attemptCount}回 / ${answeredQuestions}問 / 正答率${rate}`;

    item.appendChild(name);
    item.appendChild(detail);
    listElement.appendChild(item);
  });
}

/**
 * Tier2-B: 最近の学習履歴（最大5件）を描画する。
 * 表示するのは日付・科目・回答数のみ。Attemptごとの正解数・正答率・間違い数は
 * 今回表示しない（未完了Attemptのscoreが実際の正解数と一致しない場合があるため、
 * UI側での補正も行わない。回答数はanswerRecords.lengthという実データの件数のみを使う）。
 *
 * questionSetがnull（QuestionSetが見つからないAttempt）の場合も、getSubjectLabel()が
 * "不明"を返すため画面全体は壊れない。
 *
 * @param {ReturnType<typeof getStudentHistoryList>["items"]} items
 * @param {HTMLElement} listElement
 */
function renderRecentList(items, listElement) {
  listElement.innerHTML = "";

  const entries = Array.isArray(items) ? items : [];
  if (entries.length === 0) return;

  const title = document.createElement("p");
  title.className = "history-section-title";
  title.textContent = "最近の学習履歴";
  listElement.appendChild(title);

  entries.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-recent-item";

    const dateLabel = formatDateLabel(entry.attempt?.completedAt || entry.attempt?.startedAt);
    const subjectLabel = getSubjectLabel(entry.questionSet?.fieldId);
    const answeredCount = Array.isArray(entry.answerRecords) ? entry.answerRecords.length : 0;

    const date = document.createElement("span");
    date.className = "history-recent-item-date";
    date.textContent = dateLabel || "-";

    const subject = document.createElement("span");
    subject.className = "history-recent-item-subject";
    subject.textContent = subjectLabel;

    const count = document.createElement("span");
    count.className = "history-recent-item-count";
    count.textContent = `${answeredCount}問`;

    item.appendChild(date);
    item.appendChild(subject);
    item.appendChild(count);
    listElement.appendChild(item);
  });
}

/**
 * 【入口】studentIdに紐づく学習履歴詳細情報を取得し、history-screenのDOMへ描画する。
 * HistoryServiceへは本ファイル内のgetHistoryScreenData(studentId)のみでアクセスする。
 *
 * @param {string} studentId
 * @param {HistoryScreenElements} elements
 * @returns {ReturnType<typeof getHistoryScreenData>|null} 取得できたデータ（失敗・履歴無し時はnull）
 */
export function renderHistoryForStudent(studentId, elements) {
  if (!studentId) {
    showHistoryEmptyState(elements);
    return null;
  }

  try {
    const data = getHistoryScreenData(studentId);

    if (!data.dashboard.overview.hasHistory) {
      showHistoryEmptyState(elements);
      return data;
    }

    renderTier1(elements, data.summary, data.dashboard.overview);
    renderSubjectList(data.fieldDashboards, elements.subjectList);
    renderRecentList(data.recentHistory.items, elements.recentList);

    elements.infoContainer.classList.remove("hidden");
    elements.emptyMessage.classList.add("hidden");
    elements.errorMessage.textContent = "";

    return data;
  } catch (error) {
    console.error("getHistoryScreenData error（学習履歴画面の表示のみ失敗。既存のクイズフローには影響しません）:", error);
    showHistoryErrorState(elements);
    return null;
  }
}
