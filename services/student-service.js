import { postToGas } from "./gas-service.js";
import { STUDENT_MASTER_GAS_WEB_APP_URL } from "../config/student-master-gas-config.js";

export function normalizeStudentRecord(student) {
  return {
    studentId: String(student?.student_id ?? "").trim(),
    displayName: String(student?.display_name ?? "").trim(),
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

export function filterStudents(activeStudents, keyword) {
  const normalizedKeyword = String(keyword || "").trim().toLowerCase();

  return activeStudents.filter((student) => {
    const displayName = String(student.displayName || "").toLowerCase();
    const studentId = String(student.studentId || "").toLowerCase();
    const grade = String(student.grade || "").toLowerCase();

    return (
      !normalizedKeyword ||
      displayName.includes(normalizedKeyword) ||
      studentId.includes(normalizedKeyword) ||
      grade.includes(normalizedKeyword)
    );
  });
}