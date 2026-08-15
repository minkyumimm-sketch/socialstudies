// features/test-set-student/test-set-student-controller.js
//
// test-set-student-screenの唯一のエントリポイント（initTestSetStudentScreen）。
// features/teacher/teacher-controller.jsと同じ「単一エントリポイント＋内部でのみ
// service/state操作」という設計を踏襲する。app.jsはinitTestSetStudentScreen(elements)を
// 呼ぶだけで、GAS通信・step切替の詳細は一切知らない。
//
// Task54の責務は「学校→学年→TestSet一覧→開始前確認」の選択UIまでであり、
// 実際のQuiz開始処理（QuestionSet/Attempt接続）は行わない（Task55で接続する）。
// 「このテスト対策を始める」ボタン押下時の処理はhandleStartRequest()に集約しており、
// Task55はこの関数の中身だけを差し替えれば接続できる。
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
  showTssError
} from "./test-set-student-renderer.js";

let tssState = createTestSetStudentState();
let wired = false;

/**
 * test-set-student-screen表示時に呼ぶ唯一のエントリポイント。
 * 呼ばれるたびにstate・表示stepをリセットする（誤操作防止、teacher-screenと同じ方針）。
 *
 * @param {Object} elements - test-set-student-screen内の全DOM要素
 */
export function initTestSetStudentScreen(elements) {
  tssState = createTestSetStudentState();

  showStep(elements, "select");
  showTssError(elements.selectError, "");
  elements.schoolSelect.innerHTML = "<option value=\"\">読込中...</option>";
  elements.gradeSelect.value = "";
  renderGradeOptions(elements.gradeSelect);
  elements.testSetList.innerHTML = "";
  elements.listEmpty.classList.add("hidden");
  elements.confirmInfo.innerHTML = "";
  elements.confirmMessage.textContent = "";

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

function showStep(elements, step) {
  elements.selectStep.classList.toggle("hidden", step !== "select");
  elements.listStep.classList.toggle("hidden", step !== "list");
  elements.confirmStep.classList.toggle("hidden", step !== "confirm");
}

function wireEvents(elements) {
  elements.searchButton.addEventListener("click", () => handleSearch(elements));
  elements.listBackButton.addEventListener("click", () => showStep(elements, "select"));
  elements.confirmBackButton.addEventListener("click", () => showStep(elements, "list"));
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

// Task55接続点: 「このテスト対策を始める」が押された時の処理。
// tssState.selectedTestSet（{testSetId,schoolId,gradeId,academicYearId,examRoundLabel,
// label,status,questions:[{fieldId,questionId}]}）を、既存QuestionSet/Attempt生成へ
// 接続する処理をTask55でここへ実装する。Task54では接続せず、一時メッセージを表示するのみ。
function handleStartRequest(elements) {
  elements.confirmMessage.textContent = "テスト対策の出題機能は次の実装で接続します。";
}
