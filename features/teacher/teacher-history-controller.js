// features/teacher/teacher-history-controller.js
//
// 管理Phase M-2「生徒別の間違い問題確認」の唯一のエントリポイント
// （initTeacherHistorySection）。teacher-controller.js（M-1: TestSet作成・一覧・
// アーカイブ）とは完全に独立したstate・イベント配線を持つ（生徒の学習フローとも別）。
//
// この画面はteacher-controller.jsのPINゲート成功後にのみ見える#teacher-form内に
// 配置されるため、認証ロジックをこのファイルで新たに持つ必要はない
// （既存PIN stateをそのまま使う、STEP9方針）。
//
// 生徒一覧の取得は、既存services/student-service.jsのloadActiveStudents/
// filterStudents/renderStudentSuggestions/selectStudentをそのまま再利用する
// （新しい生徒マスタ連携は作らない）。ただしgetActiveStudentsのレスポンスには
// 学校情報が含まれないため、学校→学年→生徒という絞り込みは行わず、既存の
// 「名前で検索して選ぶ」UXにそのまま合わせる。

import {
  loadActiveStudents,
  filterStudents,
  renderStudentSuggestions,
  selectStudent
} from "../../services/student-service.js";
import { getStudentWrongAnswers } from "./teacher-history-service.js";
import { createTeacherHistoryState } from "./teacher-history-state.js";
import { renderWrongAnswerList, showTeacherHistoryStatus } from "./teacher-history-renderer.js";

let historyState = createTeacherHistoryState();
let wired = false;

/**
 * @param {Object} elements - teacher-history-*のDOM要素一式（app.js側で1度だけ取得したもの）
 */
export function initTeacherHistorySection(elements) {
  historyState = createTeacherHistoryState();

  elements.studentInput.value = "";
  elements.studentIdInput.value = "";
  elements.studentSuggestions.innerHTML = "";
  elements.studentSuggestions.classList.add("hidden");
  elements.selectedStudentLabel.textContent = "";
  elements.selectedStudentLabel.classList.add("hidden");
  elements.showButton.disabled = true;
  showTeacherHistoryStatus(elements.status, "");
  elements.wrongList.innerHTML = "";

  if (!wired) {
    wireEvents(elements);
    wired = true;
  }
}

function wireEvents(elements) {
  elements.studentInput.addEventListener("input", () => handleStudentInput(elements));
  elements.showButton.addEventListener("click", () => handleShowWrongAnswers(elements));
}

async function handleStudentInput(elements) {
  // 生徒切替時は前生徒の結果を残さない（選択・表示ボタン・結果一覧をまとめてリセット）。
  historyState.selectedStudentId = "";
  historyState.selectedStudentDisplayName = "";
  historyState.wrongAnswers = [];
  historyState.historyFetched = false;
  elements.studentIdInput.value = "";
  elements.selectedStudentLabel.classList.add("hidden");
  elements.showButton.disabled = true;
  showTeacherHistoryStatus(elements.status, "");
  elements.wrongList.innerHTML = "";

  const keyword = elements.studentInput.value;

  if (!historyState.localSessionShell.session.activeStudents.length) {
    try {
      await loadActiveStudents(historyState.localSessionShell);
    } catch (error) {
      console.error("loadActiveStudents error（teacher-history）:", error);
      showTeacherHistoryStatus(elements.status, "生徒情報を取得できませんでした。通信環境を確認してください。");
      return;
    }
  }

  if (!keyword.trim()) {
    elements.studentSuggestions.innerHTML = "";
    elements.studentSuggestions.classList.add("hidden");
    return;
  }

  const matched = filterStudents(historyState.localSessionShell.session.activeStudents, keyword);
  renderStudentSuggestions(elements.studentSuggestions, matched, (student) => {
    selectStudent({
      student,
      state: historyState.localSessionShell,
      studentNameInput: elements.studentInput,
      studentIdInput: elements.studentIdInput,
      selectedStudentLabel: elements.selectedStudentLabel,
      studentSuggestions: elements.studentSuggestions
    });

    historyState.selectedStudentId = student.studentId;
    historyState.selectedStudentDisplayName = student.displayName;
    historyState.wrongAnswers = [];
    historyState.historyFetched = false;
    elements.showButton.disabled = false;
    showTeacherHistoryStatus(elements.status, "");
    elements.wrongList.innerHTML = "";
  });
}

async function handleShowWrongAnswers(elements) {
  const studentId = historyState.selectedStudentId;
  if (!studentId) return;

  historyState.loading = true;
  elements.showButton.disabled = true;
  showTeacherHistoryStatus(elements.status, "学習履歴を取得中...");
  elements.wrongList.innerHTML = "";

  try {
    const result = await getStudentWrongAnswers(studentId);

    if (!result.ok) {
      showTeacherHistoryStatus(elements.status, "学習履歴を取得できませんでした。もう一度お試しください。");
      return;
    }

    historyState.wrongAnswers = result.wrongAnswers;
    historyState.historyFetched = true;
    showTeacherHistoryStatus(elements.status, "");
    renderWrongAnswerList(elements.wrongList, result.wrongAnswers, result.hasAttempts);
  } catch (error) {
    console.error("getStudentWrongAnswers error:", error);
    showTeacherHistoryStatus(elements.status, "学習履歴を取得できませんでした。もう一度お試しください。");
  } finally {
    historyState.loading = false;
    elements.showButton.disabled = false;
  }
}
