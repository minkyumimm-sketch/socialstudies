import { postToGas } from "./gas-service.js";
import { STUDENT_MASTER_GAS_WEB_APP_URL } from "../config/student-master-gas-config.js";

export function normalizeStudentRecord(student) {
  return {
    studentId: String(student?.student_id ?? "").trim(),
    displayName: String(student?.display_name ?? "").trim(),
    // Phase 8B-A3確定課題の修正: getActiveStudentsは元々search_nameを返しているが
    // （student-management-system側、ふりがな等の検索精度向上用に用意された列。
    // AddStudentDialog.htmlの案内文言「外部CSV照合の精度を上げたい場合はフリガナ等を
    // 入力してください」より、教員が任意で読みを入力する運用。未入力時はdisplayNameの
    // 正規化コピーがサーバー側で既定値として入る）、従来はここで保持せず捨てていたため、
    // 検索対象に一度も使われていなかった。
    searchName: String(student?.search_name ?? "").trim(),
    grade: String(student?.grade ?? "").trim(),
    active: String(student?.active ?? "").trim().toUpperCase() === "TRUE"
  };
}

export async function loadActiveStudents(state) {
  const url = `${STUDENT_MASTER_GAS_WEB_APP_URL}?action=getActiveStudents`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`生徒一覧取得失敗: ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error || "getActiveStudents failed");
  }

  const rawStudents = Array.isArray(result.students) ? result.students : [];

  state.session.activeStudents = rawStudents
    .map(normalizeStudentRecord)
    .filter((student) => student.active && student.studentId && student.displayName);

  return state.session.activeStudents;
}

export async function saveAnswerRecord(payload) {
  const normalizedPayload = {
    studentId: String(payload.studentId || "").trim(),
    name: String(payload.name || "").trim(),
    subject: String(payload.subject || "").trim(),
    questionId: String(payload.questionId || "").trim(),
    unit: String(payload.unit || "").trim(),
    question: String(payload.question || "").trim(),
    selectedChoice: String(payload.selectedChoice || "").trim(),
    correctAnswer: String(payload.correctAnswer || "").trim(),
    isCorrect: payload.isCorrect === true
  };

  if (
    !normalizedPayload.studentId ||
    !normalizedPayload.name ||
    !normalizedPayload.subject ||
    !normalizedPayload.questionId
  ) {
    console.error("saveAnswer skipped: required field missing", normalizedPayload);
    return;
  }

  try {
    const result = await postToGas({
      action: "saveRecord",
      ...normalizedPayload
    });

    if (!result.ok) {
      console.error("saveRecord failed:", result.error, normalizedPayload);
    }
  } catch (error) {
    console.error("saveRecord error:", error, normalizedPayload);
  }
}

export function renderStudentSuggestions(studentSuggestions, students, onSelectStudent) {
  studentSuggestions.innerHTML = "";

  if (!students.length) {
    studentSuggestions.classList.add("hidden");
    return;
  }

  students.forEach((student) => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.textContent = `${student.studentId} ${student.displayName} (${student.grade})`;

    item.addEventListener("click", () => {
      onSelectStudent(student);
    });

    studentSuggestions.appendChild(item);
  });

  studentSuggestions.classList.remove("hidden");
}

export function selectStudent({
  student,
  state,
  studentNameInput,
  studentIdInput,
  selectedStudentLabel,
  studentSuggestions
}) {
  studentNameInput.value = String(student.displayName || "");
  studentIdInput.value = String(student.studentId || "");

  state.session.studentName = String(student.displayName || "");
  state.session.studentId = String(student.studentId || "");

  selectedStudentLabel.textContent = `選択中：${student.studentId} ${student.displayName}`;
  selectedStudentLabel.classList.remove("hidden");
  studentSuggestions.classList.add("hidden");
}

// Phase 8B-A3確定課題の修正: 漢字検索は従来から動作していたが、ひらがな入力では
// search_nameが検索対象に含まれていなかったため候補が出なかった（実機確認済み）。
// カタカナ→ひらがな変換はfeatures/furigana/furigana-service.jsの既存private関数
// katakanaToHiragana()と同じ標準的なUnicode範囲シフト（ァ-ヶ、+0x60）を、
// 無関係な機能ファイルへの依存を増やさないためここでも独立して適用する
// （furigana-service.js側はkuroshiro読み生成専用の責務のまま変更しない）。
// 空白除去は、姓名間の区切り（"山田 太郎"/"やまだ たろう"）の有無をユーザー入力が
// 一致させなくても検索できるようにするため（教室では空白なし入力が多いと想定）。
function normalizeSearchText_(text) {
  return String(text || "")
    .trim()
    .replace(/[\s　]+/g, "")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function filterStudents(activeStudents, keyword) {
  const normalizedKeyword = normalizeSearchText_(keyword);

  return activeStudents.filter((student) => {
    const displayName = normalizeSearchText_(student.displayName);
    const searchName = normalizeSearchText_(student.searchName);
    const studentId = normalizeSearchText_(student.studentId);
    const grade = normalizeSearchText_(student.grade);

    return (
      !normalizedKeyword ||
      displayName.includes(normalizedKeyword) ||
      searchName.includes(normalizedKeyword) ||
      studentId.includes(normalizedKeyword) ||
      grade.includes(normalizedKeyword)
    );
  });
}