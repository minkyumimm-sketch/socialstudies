// features/home/home-renderer.js
//
// Phase2 Task20-B: ホーム画面のDOM描画専用モジュール。
// HomeServiceへの入口はgetHomeInitialData(studentId)の1つのみとし、それ以外の
// HomeService公開API（getHomeDashboard・getHomeOverview・getHomeWeakness等）、
// HistoryService・WeaknessService・Repository・Storageへは一切直接アクセスしない。
//
// 「getHomeInitialData(studentId) → 取得済みデータ → DOM描画」という一方向の流れのみを持ち、
// 学習履歴の集計・苦手判定など独自のドメインロジックは一切実装しない
// （既存renderers/*.jsと同じ「DOM要素+データ→描画」のみを行う位置づけ）。
//
// 責務分離: 画面切り替え自体はcore/screen-controller.jsの責務、DOM要素参照の取得・
// イベントリスナー登録はapp.jsの責務。本ファイルは「渡されたDOM要素へ、取得したデータを
// 描画する」ことだけを行う。

import { getHomeInitialData } from "./home-service.js";
import { SUBJECT_CONFIG } from "../../config/subjects.js";

const DORMANT_DISPLAY_LIMIT = 5;

/**
 * @typedef {Object} HomeScreenElements
 * @property {HTMLElement} infoContainer - 統計情報全体のコンテナ
 * @property {HTMLElement} emptyMessage - 生徒未選択時のメッセージ
 * @property {HTMLElement} errorMessage - 取得失敗時のエラーメッセージ
 * @property {HTMLElement} totalStudyDays - 累計学習日数の表示先
 * @property {HTMLElement} currentStreak - 連続学習日数の表示先
 * @property {HTMLElement} latestStudy - 前回学習の表示先
 * @property {HTMLElement} weakCount - 苦手問題数の表示先
 * @property {HTMLElement} detailToggleWrap - 詳細表示トグルボタンのラッパー
 * @property {HTMLElement} detail - 詳細表示コンテナ（折りたたみ対象）
 * @property {HTMLElement} fieldList - 科目別学習状況の表示先
 * @property {HTMLElement} dormantList - 復習推奨情報の表示先
 * @property {HTMLButtonElement} startButton - 「学習を始める」ボタン
 */

function getSubjectLabel(fieldId) {
  return SUBJECT_CONFIG[fieldId]?.label || fieldId || "";
}

function formatDateLabel(isoTimestamp) {
  if (!isoTimestamp) return "";
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatLatestStudyText(latestAttempt) {
  if (!latestAttempt) return "まだ学習記録がありません";

  const subjectLabel = getSubjectLabel(latestAttempt.questionSet?.fieldId);
  const dateLabel = formatDateLabel(latestAttempt.attempt?.completedAt || latestAttempt.attempt?.startedAt);

  const text = [dateLabel, subjectLabel].filter(Boolean).join(" ");
  return text || "まだ学習記録がありません";
}

/**
 * 生徒未選択時の初期状態を表示する。
 * @param {HomeScreenElements} elements
 */
function showHomeEmptyState(elements) {
  elements.infoContainer.classList.add("hidden");
  elements.detail.classList.add("hidden");
  elements.emptyMessage.classList.remove("hidden");
  elements.errorMessage.textContent = "";
  elements.startButton.disabled = true;
}

/**
 * getHomeInitialData()取得失敗時のエラー状態を表示する。
 * studentId自体は有効なため、既存クイズフローを止めないよう開始ボタンは有効のままにする。
 * @param {HomeScreenElements} elements
 */
function showHomeErrorState(elements) {
  elements.infoContainer.classList.add("hidden");
  elements.detail.classList.add("hidden");
  elements.emptyMessage.classList.add("hidden");
  elements.errorMessage.textContent = "学習状況の取得に失敗しました。時間をおいて再度お試しください。";
  elements.startButton.disabled = false;
}

function renderFieldList(fieldDashboards, listElement) {
  listElement.innerHTML = "";

  const items = Array.isArray(fieldDashboards) ? fieldDashboards : [];
  if (items.length === 0) return false;

  const title = document.createElement("p");
  title.className = "home-section-title";
  title.textContent = "科目別学習状況";
  listElement.appendChild(title);

  items.forEach((field) => {
    const item = document.createElement("div");
    item.className = "home-field-item";

    const name = document.createElement("span");
    name.className = "home-field-item-name";
    name.textContent = getSubjectLabel(field.fieldId);

    const count = document.createElement("span");
    count.className = "home-field-item-count";
    const rate = Math.round((field.summary?.overallCorrectRate ?? 0) * 100);
    count.textContent = `${field.summary?.attemptCount ?? 0}回 正答率${rate}%`;

    item.appendChild(name);
    item.appendChild(count);
    listElement.appendChild(item);
  });

  return true;
}

function renderDormantList(dormantQuestions, listElement) {
  listElement.innerHTML = "";

  const items = Array.isArray(dormantQuestions) ? dormantQuestions : [];
  if (items.length === 0) return false;

  const title = document.createElement("p");
  title.className = "home-section-title";
  title.textContent = "復習推奨";
  listElement.appendChild(title);

  items.slice(0, DORMANT_DISPLAY_LIMIT).forEach((question) => {
    const item = document.createElement("div");
    item.className = "home-dormant-item";

    const name = document.createElement("span");
    name.className = "home-dormant-item-name";
    name.textContent = getSubjectLabel(question.fieldId) || question.questionId;

    const count = document.createElement("span");
    count.className = "home-dormant-item-count";
    const dateLabel = formatDateLabel(question.lastAnsweredAt);
    count.textContent = dateLabel ? `最終: ${dateLabel}` : "";

    item.appendChild(name);
    item.appendChild(count);
    listElement.appendChild(item);
  });

  if (items.length > DORMANT_DISPLAY_LIMIT) {
    const more = document.createElement("p");
    more.className = "home-section-title";
    more.textContent = `他${items.length - DORMANT_DISPLAY_LIMIT}件`;
    listElement.appendChild(more);
  }

  return true;
}

/**
 * getHomeInitialData()の返り値をホーム画面のDOMへ描画する。
 * @param {ReturnType<typeof getHomeInitialData>} homeInitialData
 * @param {HomeScreenElements} elements
 */
function renderHomeDashboard(homeInitialData, elements) {
  const dashboard = homeInitialData.dashboard;
  const historyOverview = dashboard.overview.historyOverview;
  const weakSummary = dashboard.weakness.weakDashboard.summary;

  elements.totalStudyDays.textContent = `${historyOverview.totalStudyDays}日`;
  elements.currentStreak.textContent = `${historyOverview.currentStudyStreak}日`;
  elements.latestStudy.textContent = formatLatestStudyText(dashboard.overview.latestAttempt);
  elements.weakCount.textContent = `${weakSummary.weakQuestionCount}問`;

  const hasFieldDetail = renderFieldList(dashboard.fields.fieldDashboards, elements.fieldList);
  const hasDormantDetail = renderDormantList(dashboard.weakness.weakDashboard.dormantQuestions, elements.dormantList);

  elements.detailToggleWrap.classList.toggle("hidden", !(hasFieldDetail || hasDormantDetail));
  elements.detail.classList.add("hidden");

  elements.infoContainer.classList.remove("hidden");
  elements.emptyMessage.classList.add("hidden");
  elements.errorMessage.textContent = "";
  elements.startButton.disabled = false;
}

/**
 * 【入口】studentIdに紐づくホーム画面情報を取得し、DOMへ描画する。
 * HomeServiceへは getHomeInitialData(studentId) のみでアクセスする。
 *
 * @param {string} studentId
 * @param {HomeScreenElements} elements
 * @returns {ReturnType<typeof getHomeInitialData>|null} 取得できたデータ（失敗・未選択時はnull）
 */
export function renderHomeForStudent(studentId, elements) {
  if (!studentId) {
    showHomeEmptyState(elements);
    return null;
  }

  try {
    const homeInitialData = getHomeInitialData(studentId);
    renderHomeDashboard(homeInitialData, elements);
    return homeInitialData;
  } catch (error) {
    console.error("getHomeInitialData error（ホーム画面の表示のみ失敗。既存のクイズフローには影響しません）:", error);
    showHomeErrorState(elements);
    return null;
  }
}

/**
 * 詳細表示（科目別学習状況・復習推奨）の折りたたみを切り替える。
 * 追加のデータ取得は行わない（既にDOMへ描画済みの内容の表示/非表示のみ）。
 *
 * @param {HomeScreenElements} elements
 */
export function toggleHomeDetail(elements) {
  elements.detail.classList.toggle("hidden");
}
