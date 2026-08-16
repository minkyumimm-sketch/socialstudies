// features/test-set-student/test-set-student-controller.js
//
// test-set-student-screenの唯一のエントリポイント（initTestSetStudentScreen）。
// features/teacher/teacher-controller.jsと同じ「単一エントリポイント＋内部でのみ
// service/state操作」という設計を踏襲する。app.jsはinitTestSetStudentScreen(elements, ...)を
// 呼ぶだけで、GAS通信・step切替の詳細は一切知らない。
//
// Task55: 「このテスト対策を始める」ボタン押下時の実処理（handleStartRequest）を実装。
// 実際のQuiz開始・複数fieldIdグループの連続実行はapp.js側（既存の単一fieldId
// Attempt実行フローを保有している）に委ねる。このモジュールはコールバック
// （onStartTestSet）を呼ぶだけで、QuestionSet/Attemptの詳細を一切知らない。
//
// studentIdはこのモジュール内で一切扱わない（schoolId/gradeIdは生徒がその都度自己選択する
// 値であり、studentIdからの自動判定は行わない、Task54確定方針）。

import { loadSchools, loadTestSets, loadTestSet } from "../../services/test-set-service.js";
import { createTestSetStudentState } from "./test-set-student-state.js";
import {
  renderSchoolOptions,
  renderGradeOptions,
  renderTestSetList,
  renderConfirmInfo,
  renderCompletionSummary,
  showTssError
} from "./test-set-student-renderer.js";

let tssState = createTestSetStudentState();
let wired = false;
let startTestSetCallback = null;

/**
 * test-set-student-screen表示時に呼ぶ唯一のエントリポイント。
 * 呼ばれるたびにstate・表示stepをリセットする（誤操作防止、teacher-screenと同じ方針）。
 *
 * @param {Object} elements - test-set-student-screen内の全DOM要素
 * @param {(selectedTestSet:Object) => Promise<{ok:boolean, errorMessage?:string}>} onStartTestSet
 *   「このテスト対策を始める」が押された時に呼ばれるコールバック（app.js側が提供）。
 *   成功時（ok:true）は呼び出し側でQuiz画面への遷移まで行う想定で、このモジュールは
 *   画面遷移を待つだけ。失敗時（ok:false）はerrorMessageをconfirm-step内へ表示する。
 */
export function initTestSetStudentScreen(elements, onStartTestSet) {
  tssState = createTestSetStudentState();
  startTestSetCallback = onStartTestSet;

  showStep(elements, "select");
  showTssError(elements.selectError, "");
  elements.schoolSelect.innerHTML = "<option value=\"\">読込中...</option>";
  elements.gradeSelect.value = "";
  renderGradeOptions(elements.gradeSelect);
  elements.testSetList.innerHTML = "";
  elements.listEmpty.classList.add("hidden");
  elements.confirmInfo.innerHTML = "";
  elements.confirmMessage.textContent = "";
  elements.completeInfo.innerHTML = "";

  loadSchools()
    .then((schools) => {
      tssState.schools = schools;
      renderSchoolOptions(elements.schoolSelect, schools);
    })
    .catch((error) => {
      console.error("loadSchools error:", error);
      renderSchoolOptions(elements.schoolSelect, []);
      showTssError(elements.selectError, "学校のテスト対策を現在利用できません。通常学習はそのままご利用いただけます。");
    });

  if (!wired) {
    wireEvents(elements);
    wired = true;
  }
}

/**
 * TestSet全体完了後の表示（Task55）。app.js側で全fieldIdグループが完了した際に呼ぶ。
 * @param {Object} elements
 * @param {{label:string, totalQuestions:number, totalCorrect:number, totalIncorrect:number}} summary
 */
export function showTestSetCompletion(elements, summary) {
  renderCompletionSummary(elements.completeInfo, summary);
  showStep(elements, "complete");
}

function showStep(elements, step) {
  elements.selectStep.classList.toggle("hidden", step !== "select");
  elements.listStep.classList.toggle("hidden", step !== "list");
  elements.confirmStep.classList.toggle("hidden", step !== "confirm");
  elements.completeStep.classList.toggle("hidden", step !== "complete");
}

function wireEvents(elements) {
  elements.searchButton.addEventListener("click", () => handleSearch(elements));
  elements.startButton.addEventListener("click", () => handleStartRequest(elements));
}

async function handleSearch(elements) {
  showTssError(elements.selectError, "");

  const schoolId = elements.schoolSelect.value;
  const gradeId = elements.gradeSelect.value;

  if (!schoolId) {
    showTssError(elements.selectError, "学校を選択してください。");
    return;
  }
  if (!gradeId) {
    showTssError(elements.selectError, "学年を選択してください。");
    return;
  }

  tssState.selectedSchoolId = schoolId;
  tssState.selectedSchoolName = tssState.schools.find((s) => s.schoolId === schoolId)?.schoolName || schoolId;
  tssState.selectedGradeId = gradeId;

  elements.searchButton.disabled = true;
  elements.searchButton.textContent = "検索中...";

  try {
    const testSets = await loadTestSets({
      schoolId,
      gradeId,
      academicYearId: tssState.academicYearId
    });
    tssState.testSets = testSets;

    if (testSets.length === 0) {
      elements.testSetList.innerHTML = "";
      elements.listEmpty.classList.remove("hidden");
    } else {
      elements.listEmpty.classList.add("hidden");
      renderTestSetList(elements.testSetList, testSets, (testSetId) => handleSelectTestSet(elements, testSetId));
    }

    showStep(elements, "list");
  } catch (error) {
    console.error("loadTestSets error:", error);
    showTssError(elements.selectError, "テスト対策の検索に失敗しました。通常学習はそのままご利用いただけます。");
  } finally {
    elements.searchButton.disabled = false;
    elements.searchButton.textContent = "テスト対策を探す";
  }
}

async function handleSelectTestSet(elements, testSetId) {
  tssState.selectedTestSetId = testSetId;

  try {
    const { testSet, questions } = await loadTestSet(testSetId);
    tssState.selectedTestSet = { ...testSet, questions };

    renderConfirmInfo(elements.confirmInfo, {
      schoolName: tssState.selectedSchoolName,
      gradeId: tssState.selectedGradeId,
      testSet: tssState.selectedTestSet
    });
    elements.confirmMessage.textContent = "";

    showStep(elements, "confirm");
  } catch (error) {
    console.error("loadTestSet error:", error);
    showTssError(elements.selectError, "テスト対策の詳細取得に失敗しました。通常学習はそのままご利用いただけます。");
  }
}

// Task55: 「このテスト対策を始める」が押された時の処理。
// tssState.selectedTestSet（{testSetId,schoolId,gradeId,academicYearId,examRoundLabel,
// label,status,questions:[{fieldId,questionId}]}）をapp.js側のコールバックへ渡す。
// QuestionSet/Attempt生成・画面遷移の詳細はこのモジュールでは一切扱わない。
async function handleStartRequest(elements) {
  if (!tssState.selectedTestSet || typeof startTestSetCallback !== "function") return;

  elements.confirmMessage.textContent = "";
  elements.startButton.disabled = true;
  elements.startButton.textContent = "開始中...";

  try {
    const result = await startTestSetCallback(tssState.selectedTestSet);
    if (!result || !result.ok) {
      elements.confirmMessage.textContent = result?.errorMessage || "テスト対策の開始に失敗しました。";
    }
    // 成功時はapp.js側で画面遷移まで行うため、ここでは何もしない。
  } finally {
    elements.startButton.disabled = false;
    elements.startButton.textContent = "このテスト対策を始める";
  }
}
