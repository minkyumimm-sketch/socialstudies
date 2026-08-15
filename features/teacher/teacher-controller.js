// features/teacher/teacher-controller.js
//
// teacher-screenの唯一のエントリポイント（initTeacherScreen）。history-renderer.jsの
// 「単一エントリポイント＋内部でのみservice/state操作」という設計を踏襲する。
// app.jsはinitTeacherScreen(elements)を呼ぶだけで、GAS通信・選択状態管理の詳細は
// 一切知らない。
//
// 責務：
//   - features/teacher/teacher-state.js のstate生成・更新
//   - services/test-set-service.js を使ったGAS通信（学校一覧取得・TestSet保存）
//   - 既存core/question-loader.js・core/question-normalizer.jsを使った問題マスター読込
//     （新しいCSV parserを作らない、既存正規化ロジックをそのまま再利用する）
//   - features/teacher/teacher-renderer.js へ描画を委譲（このファイル自体はDOM書き込みをしない）
//
// studentIdはこのモジュール内で一切扱わない（講師UIと生徒の学習フローは完全に別）。

import { loadQuestions } from "../../core/question-loader.js";
import { normalizeQuestion } from "../../core/question-normalizer.js";
import { SUBJECT_CONFIG } from "../../config/subjects.js";
import { loadSchools, saveTestSet } from "../../services/test-set-service.js";
import {
  createTeacherState,
  setQuestionSelected,
  getSelectedQuestionList,
  getSelectedCountByField
} from "./teacher-state.js";
import {
  renderSchoolOptions,
  renderFieldOptions,
  renderUnitOptions,
  renderSubunitOptions,
  renderQuestionList,
  renderSelectionSummary,
  showTeacherError,
  showSaveResult
} from "./teacher-renderer.js";

const GRADE_OPTIONS = ["中1", "中2", "中3"];

let teacherState = createTeacherState();
let wired = false;

/**
 * teacher-screen表示時に呼ぶ唯一のエントリポイント。
 * 誤操作防止のため、呼ばれるたびにstate・フォーム表示をリセットする
 * （PINも含め毎回再入力を基本とする、Task53確定方針）。
 *
 * @param {Object} elements - teacher-screen内の全DOM要素（app.js側で1度だけ取得したもの）
 */
export function initTeacherScreen(elements) {
  teacherState = createTeacherState();

  elements.pinInput.value = "";
  elements.pinGate.classList.remove("hidden");
  elements.form.classList.add("hidden");
  showTeacherError(elements.pinError, "");
  showTeacherError(elements.questionError, "");
  showSaveResult(elements.saveResult, "", false);
  elements.questionList.innerHTML = "";
  renderSelectionSummary(elements.selectionSummary, teacherState, getSelectedCountByField);

  renderFieldOptions(elements.fieldSelect);
  renderGradeOptions(elements.gradeSelect);
  elements.academicYearInput.value = teacherState.academicYearId;
  elements.examRoundInput.value = "";
  elements.labelInput.value = "";

  if (!wired) {
    wireEvents(elements);
    wired = true;
  }
}

function renderGradeOptions(selectEl) {
  selectEl.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "選択してください";
  selectEl.appendChild(placeholder);
  GRADE_OPTIONS.forEach((grade) => {
    const option = document.createElement("option");
    option.value = grade;
    option.textContent = grade;
    selectEl.appendChild(option);
  });
}

function wireEvents(elements) {
  elements.pinSubmitButton.addEventListener("click", () => handlePinSubmit(elements));

  elements.schoolSelect.addEventListener("change", () => {
    teacherState.selectedSchoolId = elements.schoolSelect.value;
  });

  elements.gradeSelect.addEventListener("change", () => {
    teacherState.gradeId = elements.gradeSelect.value;
  });

  elements.academicYearInput.addEventListener("change", () => {
    teacherState.academicYearId = String(elements.academicYearInput.value || "").trim();
  });

  elements.examRoundInput.addEventListener("change", () => {
    teacherState.examRoundLabel = String(elements.examRoundInput.value || "").trim();
  });

  elements.labelInput.addEventListener("change", () => {
    teacherState.label = String(elements.labelInput.value || "").trim();
  });

  elements.fieldSelect.addEventListener("change", () => handleFieldChange(elements));
  elements.unitSelect.addEventListener("change", () => handleUnitChange(elements));
  elements.subunitSelect.addEventListener("change", () => handleSubunitChange(elements));

  elements.selectAllButton.addEventListener("click", () => handleSelectAll(elements, true));
  elements.deselectAllButton.addEventListener("click", () => handleSelectAll(elements, false));

  elements.saveButton.addEventListener("click", () => handleSave(elements));
}

async function handlePinSubmit(elements) {
  const pin = String(elements.pinInput.value || "").trim();
  showTeacherError(elements.pinError, "");
  showTeacherError(elements.questionError, "");

  if (!pin) {
    showTeacherError(elements.pinError, "PINを入力してください。");
    return;
  }

  teacherState.pin = pin;
  teacherState.pinEntered = true;

  elements.pinGate.classList.add("hidden");
  elements.form.classList.remove("hidden");

  elements.schoolSelect.innerHTML = "<option value=\"\">読込中...</option>";

  try {
    const schools = await loadSchools();
    teacherState.schools = schools;
    renderSchoolOptions(elements.schoolSelect, schools);
  } catch (error) {
    console.error("loadSchools error:", error);
    renderSchoolOptions(elements.schoolSelect, []);
    showTeacherError(elements.questionError, "学校情報を取得できませんでした。通信環境を確認してください。");
  }
}

async function handleFieldChange(elements) {
  const fieldId = elements.fieldSelect.value;
  teacherState.currentFieldId = fieldId;
  teacherState.unitFilter = "all";
  teacherState.subunitFilter = "all";
  elements.unitSelect.value = "all";
  elements.subunitSelect.value = "all";

  if (!fieldId) {
    renderUnitOptions(elements.unitSelect, []);
    renderSubunitOptions(elements.subunitSelect, []);
    elements.questionList.innerHTML = "";
    return;
  }

  showTeacherError(elements.questionError, "");
  elements.questionList.innerHTML = "<p class=\"teacher-question-empty\">読込中...</p>";

  try {
    const questions = await getQuestionsForField(fieldId);
    const units = distinctInOrder(questions.map((q) => q.unit).filter(Boolean));
    renderUnitOptions(elements.unitSelect, units);
    renderSubunitOptions(elements.subunitSelect, distinctInOrder(questions.map((q) => q.subunit).filter(Boolean)));
    renderFilteredQuestionList(elements);
  } catch (error) {
    console.error("getQuestionsForField error:", error);
    showTeacherError(elements.questionError, "問題データの取得に失敗しました。");
    elements.questionList.innerHTML = "";
  }
}

async function handleUnitChange(elements) {
  teacherState.unitFilter = elements.unitSelect.value || "all";

  const questions = await getQuestionsForField(teacherState.currentFieldId);
  const relevant =
    teacherState.unitFilter === "all"
      ? questions
      : questions.filter((q) => q.unit === teacherState.unitFilter);

  renderSubunitOptions(elements.subunitSelect, distinctInOrder(relevant.map((q) => q.subunit).filter(Boolean)));
  teacherState.subunitFilter = "all";
  elements.subunitSelect.value = "all";

  renderFilteredQuestionList(elements);
}

async function handleSubunitChange(elements) {
  teacherState.subunitFilter = elements.subunitSelect.value || "all";
  renderFilteredQuestionList(elements);
}

async function renderFilteredQuestionList(elements) {
  const fieldId = teacherState.currentFieldId;
  if (!fieldId) return;

  const questions = await getQuestionsForField(fieldId);
  const filtered = questions.filter((q) => {
    const matchesUnit = teacherState.unitFilter === "all" || q.unit === teacherState.unitFilter;
    const matchesSubunit = teacherState.subunitFilter === "all" || q.subunit === teacherState.subunitFilter;
    return matchesUnit && matchesSubunit;
  });

  renderQuestionList(
    elements.questionList,
    filtered,
    fieldId,
    teacherState.selectedQuestions,
    (toggledFieldId, questionId, checked) => {
      setQuestionSelected(teacherState, toggledFieldId, questionId, checked);
      renderSelectionSummary(elements.selectionSummary, teacherState, getSelectedCountByField);
    }
  );
}

async function handleSelectAll(elements, shouldSelect) {
  const fieldId = teacherState.currentFieldId;
  if (!fieldId) return;

  const questions = await getQuestionsForField(fieldId);
  const filtered = questions.filter((q) => {
    const matchesUnit = teacherState.unitFilter === "all" || q.unit === teacherState.unitFilter;
    const matchesSubunit = teacherState.subunitFilter === "all" || q.subunit === teacherState.subunitFilter;
    return matchesUnit && matchesSubunit;
  });

  filtered.forEach((q) => {
    setQuestionSelected(teacherState, fieldId, String(q.questionId || ""), shouldSelect);
  });

  renderFilteredQuestionList(elements);
  renderSelectionSummary(elements.selectionSummary, teacherState, getSelectedCountByField);
}

async function handleSave(elements) {
  showSaveResult(elements.saveResult, "", false);

  const schoolId = teacherState.selectedSchoolId;
  const gradeId = teacherState.gradeId;
  const academicYearId = String(elements.academicYearInput.value || "").trim();
  const examRoundLabel = String(elements.examRoundInput.value || "").trim();
  const label = String(elements.labelInput.value || "").trim();
  const questions = getSelectedQuestionList(teacherState);

  if (!schoolId) return showSaveResult(elements.saveResult, "学校を選択してください。", true);
  if (!gradeId) return showSaveResult(elements.saveResult, "学年を選択してください。", true);
  if (!academicYearId) return showSaveResult(elements.saveResult, "学年度を入力してください。", true);
  if (!examRoundLabel) return showSaveResult(elements.saveResult, "テスト回を入力してください。", true);
  if (!label) return showSaveResult(elements.saveResult, "セット名を入力してください。", true);
  if (questions.length === 0) return showSaveResult(elements.saveResult, "1問以上選択してください。", true);

  elements.saveButton.disabled = true;
  elements.saveButton.textContent = "保存中...";

  try {
    const result = await saveTestSet({
      pin: teacherState.pin,
      testSet: {
        schoolId,
        gradeId,
        academicYearId,
        examRoundLabel,
        label,
        status: "active"
      },
      questions
    });

    if (!result.ok) {
      showSaveResult(elements.saveResult, translateSaveError(result.error), true);
      return;
    }

    const schoolName = teacherState.schools.find((s) => s.schoolId === schoolId)?.schoolName || schoolId;
    showSaveResult(
      elements.saveResult,
      `保存しました：${result.testSetId} ／ ${schoolName} ／ ${gradeId} ／ ${label} ／ ${questions.length}問`,
      false
    );
  } catch (error) {
    console.error("saveTestSet error:", error);
    showSaveResult(elements.saveResult, "TestSetの保存に失敗しました。通常学習には影響ありません。", true);
  } finally {
    elements.saveButton.disabled = false;
    elements.saveButton.textContent = "TestSetを保存";
  }
}

function translateSaveError(rawError) {
  const message = String(rawError || "");
  if (message.includes("PIN")) return "講師PINが正しくありません。";
  if (message.includes("schoolId")) return "学校情報を取得できませんでした。";
  if (message.includes("questions")) return "1問以上選択してください。";
  return message || "TestSetの保存に失敗しました。通常学習には影響ありません。";
}

async function getQuestionsForField(fieldId) {
  if (teacherState.questionCacheByField[fieldId]) {
    return teacherState.questionCacheByField[fieldId];
  }

  const config = SUBJECT_CONFIG[fieldId];
  if (!config) return [];

  const rawRows = await loadQuestions(config.csvPath);
  const normalized = rawRows
    .map((row) => normalizeQuestion(row, fieldId))
    .filter((question) => question.status === "active");

  teacherState.questionCacheByField[fieldId] = normalized;
  return normalized;
}

function distinctInOrder(values) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  });
  return result;
}
