#!/usr/bin/env node
/**
 * 学校・生徒紐付け・テスト範囲マスタ（data/school_master.csv, data/student_school_grade.csv,
 * data/test_range.csv）の参照整合性を検査する。
 *
 * 目的（Task46: Phase4「学校別テスト範囲」データ基盤）:
 *   scripts/validate-questions.mjs が問題データ自体の整合性を検査するのに対し、
 *   本スクリプトは学校・生徒・テスト範囲マスタ間の参照整合性（schoolId参照、
 *   fieldId/unit/subunitが実在の問題データと一致するか等）を検査する。
 *   責務が異なるため、既存validate-questions.mjsとは分離する
 *   （docs/architecture/ls-total-test-system-design-v1.md の責務分離原則）。
 *
 * 実行方法:
 *   node scripts/validate-test-range.mjs
 *
 * 既存コードの再利用方針:
 *   CSVパーサはcore/question-loader.jsをそのままimportして利用する。
 *   fieldId（教科）の正本はconfig/subjects.js の SUBJECT_CONFIG とする。
 *
 * データが0件（ヘッダーのみ）の状態は正常とする。Phase4未登録の学校が
 * あっても通常学習は継続できる設計のため（フォールバック仕様）、空データを
 * エラー扱いにしない。
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseDelimitedText, detectDelimiter, splitDelimitedLine } from "../core/question-loader.js";
import { SUBJECT_CONFIG } from "../config/subjects.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCHOOL_MASTER_PATH = "data/school_master.csv";
const STUDENT_SCHOOL_GRADE_PATH = "data/student_school_grade.csv";
const TEST_RANGE_PATH = "data/test_range.csv";

// Task45で確定: LSは都立高校入試対策＋定期テスト対策を対象とするため、当面は中学生のみを想定する。
// 将来的に対象学年を広げる場合はこの定数を変更するだけでよい（schemaの変更は不要）。
const GRADE_OPTIONS = ["中1", "中2", "中3"];

// Task45で確定: schoolIdはLSが独自に採番する（生徒管理システムとは接続しない）。
const SCHOOL_ID_PATTERN = /^SC\d{3}$/;

// Task45で確定: academicYearIdは4月始まりの学年度をAY<開始暦年>形式で表す。
const ACADEMIC_YEAR_PATTERN = /^AY\d{4}$/;

const ALLOWED_ACTIVE_STATUSES = ["active", "archived"];

const results = [];

function addResult(severity, target, key, rule, message) {
  results.push({ severity, target, key: key || "-", rule, message });
}

function toAbsolutePath(relativePath) {
  return path.resolve(REPO_ROOT, relativePath);
}

// ---------------------------------------------------------------------------
// 共通: CSV読み込み（ヘッダー欠落・空ファイルを個別に検出するため、
// 生の行からヘッダーを直接抽出する。parseDelimitedText()はデータ0件の場合に
// ヘッダー情報を返さないため、これだけでは必須列チェックができない）。
// ---------------------------------------------------------------------------

function readCsv(target, relativePath, requiredColumns) {
  const absolutePath = toAbsolutePath(relativePath);

  if (!existsSync(absolutePath)) {
    addResult("Critical", target, "-", "csv-file-exists", `CSVファイルが存在しません: ${relativePath}`);
    return null;
  }

  const rawText = readFileSync(absolutePath, "utf8");
  const normalizedText = rawText.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    addResult("Critical", target, "-", "csv-empty", `CSVが空です（ヘッダー行がありません）: ${relativePath}`);
    return null;
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitDelimitedLine(lines[0], delimiter).map((h) => h.trim());

  const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    addResult(
      "Critical",
      target,
      "-",
      "required-columns",
      `必須列が不足しています: ${missingColumns.join(", ")}（${relativePath}）`
    );
    return null;
  }

  const rows = parseDelimitedText(rawText);
  return rows;
}

// ---------------------------------------------------------------------------
// school_master.csv
// ---------------------------------------------------------------------------

function validateSchoolMaster() {
  const rows = readCsv("school_master", SCHOOL_MASTER_PATH, ["schoolId", "schoolName", "active"]);
  const validSchoolIds = new Set();
  if (rows === null) return validSchoolIds;

  const seenIds = new Map();

  rows.forEach((row) => {
    const schoolId = String(row.schoolId ?? "").trim();
    const schoolName = String(row.schoolName ?? "").trim();
    const active = String(row.active ?? "").trim();

    if (!schoolId) {
      addResult("Error", "school_master", "-", "school-id-empty", "schoolIdが空です。");
      return;
    }

    if (!SCHOOL_ID_PATTERN.test(schoolId)) {
      addResult(
        "Error",
        "school_master",
        schoolId,
        "school-id-format",
        `schoolId="${schoolId}"は許可された形式（${SCHOOL_ID_PATTERN}）ではありません。`
      );
    }

    seenIds.set(schoolId, (seenIds.get(schoolId) || 0) + 1);

    if (!schoolName) {
      addResult("Error", "school_master", schoolId, "school-name-empty", "schoolNameが空です。");
    }

    if (!ALLOWED_ACTIVE_STATUSES.includes(active)) {
      addResult(
        "Error",
        "school_master",
        schoolId,
        "active-valid",
        `active="${active}"は許可値（${ALLOWED_ACTIVE_STATUSES.join("/")}）に含まれません。`
      );
    }

    validSchoolIds.add(schoolId);
  });

  seenIds.forEach((count, id) => {
    if (count > 1) {
      addResult("Error", "school_master", id, "school-id-duplicate", `schoolIdが${count}件重複しています。`);
    }
  });

  return validSchoolIds;
}

// ---------------------------------------------------------------------------
// student_school_grade.csv
// ---------------------------------------------------------------------------

function validateStudentSchoolGrade(validSchoolIds) {
  const rows = readCsv("student_school_grade", STUDENT_SCHOOL_GRADE_PATH, [
    "studentId",
    "schoolId",
    "gradeId",
    "active"
  ]);
  if (rows === null) return;

  const activeStudentIdCounts = new Map();

  rows.forEach((row) => {
    const studentId = String(row.studentId ?? "").trim();
    const schoolId = String(row.schoolId ?? "").trim();
    const gradeId = String(row.gradeId ?? "").trim();
    const active = String(row.active ?? "").trim();
    const key = studentId || "-";

    if (!studentId) {
      addResult("Error", "student_school_grade", "-", "student-id-empty", "studentIdが空です。");
    }

    if (!schoolId) {
      addResult("Error", "student_school_grade", key, "school-id-empty", "schoolIdが空です。");
    } else if (!validSchoolIds.has(schoolId)) {
      addResult(
        "Error",
        "student_school_grade",
        key,
        "school-id-exists",
        `schoolId="${schoolId}"はschool_master.csvに存在しません。`
      );
    }

    if (!GRADE_OPTIONS.includes(gradeId)) {
      addResult(
        "Error",
        "student_school_grade",
        key,
        "grade-id-valid",
        `gradeId="${gradeId}"は許可値（${GRADE_OPTIONS.join("/")}）に含まれません。`
      );
    }

    if (!ALLOWED_ACTIVE_STATUSES.includes(active)) {
      addResult(
        "Error",
        "student_school_grade",
        key,
        "active-valid",
        `active="${active}"は許可値（${ALLOWED_ACTIVE_STATUSES.join("/")}）に含まれません。`
      );
    }

    if (studentId && active === "active") {
      activeStudentIdCounts.set(studentId, (activeStudentIdCounts.get(studentId) || 0) + 1);
    }
  });

  activeStudentIdCounts.forEach((count, studentId) => {
    if (count > 1) {
      addResult(
        "Error",
        "student_school_grade",
        studentId,
        "active-student-id-duplicate",
        `active="active"のstudentId="${studentId}"が${count}件重複しています。生徒1人につき有効な学校・学年の対応は1件のみにしてください。`
      );
    }
  });
}

// ---------------------------------------------------------------------------
// 教科ごとのunit/subunit集合を、実際の問題CSVから取得する（キャッシュ付き）。
// ---------------------------------------------------------------------------

const unitsByFieldCache = new Map(); // fieldId -> Map(unit -> Set(subunit)) | null(読み込み失敗)

function getUnitsForField(fieldId) {
  if (unitsByFieldCache.has(fieldId)) {
    return unitsByFieldCache.get(fieldId);
  }

  const config = SUBJECT_CONFIG[fieldId];
  if (!config) {
    unitsByFieldCache.set(fieldId, null);
    return null;
  }

  const absolutePath = toAbsolutePath(config.csvPath.replace(/^\.\//, ""));
  if (!existsSync(absolutePath)) {
    unitsByFieldCache.set(fieldId, null);
    return null;
  }

  const rawText = readFileSync(absolutePath, "utf8");
  const rows = parseDelimitedText(rawText);

  const unitMap = new Map();
  rows.forEach((row) => {
    const unit = String(row.unit ?? "").trim();
    const subunit = String(row.subunit ?? "").trim();
    if (!unit) return;
    if (!unitMap.has(unit)) {
      unitMap.set(unit, new Set());
    }
    if (subunit) {
      unitMap.get(unit).add(subunit);
    }
  });

  unitsByFieldCache.set(fieldId, unitMap);
  return unitMap;
}

// ---------------------------------------------------------------------------
// test_range.csv
// ---------------------------------------------------------------------------

function validateTestRange(validSchoolIds) {
  const rows = readCsv("test_range", TEST_RANGE_PATH, [
    "schoolId",
    "gradeId",
    "academicYearId",
    "examRoundLabel",
    "fieldId",
    "unit",
    "subunit",
    "status"
  ]);
  if (rows === null) return;

  const seenCompositeKeys = new Map(); // compositeKey(unit込み) -> count
  const seenUnitWholeRows = new Set(); // 「schoolId|gradeId|academicYearId|examRoundLabel|fieldId|unit」でsubunit空欄の行
  const seenUnitSubRows = []; // subunitありの行（Warning判定用に後でまとめて突合）

  rows.forEach((row) => {
    const schoolId = String(row.schoolId ?? "").trim();
    const gradeId = String(row.gradeId ?? "").trim();
    const academicYearId = String(row.academicYearId ?? "").trim();
    const examRoundLabel = String(row.examRoundLabel ?? "").trim();
    const fieldId = String(row.fieldId ?? "").trim();
    const unit = String(row.unit ?? "").trim();
    const subunit = String(row.subunit ?? "").trim();
    const status = String(row.status ?? "").trim();

    const rangeKeyBase = `${schoolId}|${gradeId}|${academicYearId}|${examRoundLabel}|${fieldId}`;
    const displayKey = `${rangeKeyBase}|${unit}${subunit ? `|${subunit}` : ""}`;

    if (!schoolId) {
      addResult("Error", "test_range", displayKey, "school-id-empty", "schoolIdが空です。");
    } else if (!validSchoolIds.has(schoolId)) {
      addResult("Error", "test_range", displayKey, "school-id-exists", `schoolId="${schoolId}"はschool_master.csvに存在しません。`);
    }

    if (!GRADE_OPTIONS.includes(gradeId)) {
      addResult(
        "Error",
        "test_range",
        displayKey,
        "grade-id-valid",
        `gradeId="${gradeId}"は許可値（${GRADE_OPTIONS.join("/")}）に含まれません。`
      );
    }

    if (!academicYearId) {
      addResult("Error", "test_range", displayKey, "academic-year-empty", "academicYearIdが空です。");
    } else if (!ACADEMIC_YEAR_PATTERN.test(academicYearId)) {
      addResult(
        "Error",
        "test_range",
        displayKey,
        "academic-year-format",
        `academicYearId="${academicYearId}"は許可された形式（${ACADEMIC_YEAR_PATTERN}）ではありません。`
      );
    }

    if (!examRoundLabel) {
      addResult("Error", "test_range", displayKey, "exam-round-label-empty", "examRoundLabelが空です。");
    }

    if (!fieldId) {
      addResult("Error", "test_range", displayKey, "field-id-empty", "fieldIdが空です。");
    } else if (!SUBJECT_CONFIG[fieldId]) {
      addResult(
        "Error",
        "test_range",
        displayKey,
        "field-id-exists",
        `fieldId="${fieldId}"はSUBJECT_CONFIGに存在しません。`
      );
    }

    if (!unit) {
      addResult("Error", "test_range", displayKey, "unit-empty", "unitが空です。");
    } else if (fieldId && SUBJECT_CONFIG[fieldId]) {
      const unitMap = getUnitsForField(fieldId);
      if (unitMap === null) {
        addResult(
          "Error",
          "test_range",
          displayKey,
          "unit-source-missing",
          `fieldId="${fieldId}"の問題CSVが読み込めないため、unitの実在確認ができません。`
        );
      } else if (!unitMap.has(unit)) {
        addResult(
          "Error",
          "test_range",
          displayKey,
          "unit-exists",
          `unit="${unit}"はfieldId="${fieldId}"の問題データに存在しません。`
        );
      } else if (subunit && !unitMap.get(unit).has(subunit)) {
        addResult(
          "Error",
          "test_range",
          displayKey,
          "subunit-exists",
          `subunit="${subunit}"はfieldId="${fieldId}"のunit="${unit}"配下に存在しません。`
        );
      }
    }

    if (!ALLOWED_ACTIVE_STATUSES.includes(status)) {
      addResult(
        "Error",
        "test_range",
        displayKey,
        "status-valid",
        `status="${status}"は許可値（${ALLOWED_ACTIVE_STATUSES.join("/")}）に含まれません。`
      );
    }

    const fullCompositeKey = `${rangeKeyBase}|${unit}|${subunit}`;
    seenCompositeKeys.set(fullCompositeKey, (seenCompositeKeys.get(fullCompositeKey) || 0) + 1);

    if (!subunit) {
      seenUnitWholeRows.add(`${rangeKeyBase}|${unit}`);
    } else {
      seenUnitSubRows.push({ rangeUnitKey: `${rangeKeyBase}|${unit}`, displayKey });
    }
  });

  seenCompositeKeys.forEach((count, key) => {
    if (count > 1) {
      addResult(
        "Error",
        "test_range",
        key,
        "duplicate-composite-key",
        `schoolId+gradeId+academicYearId+examRoundLabel+fieldId+unit+subunitの組み合わせが${count}件重複しています。`
      );
    }
  });

  seenUnitSubRows.forEach(({ rangeUnitKey, displayKey }) => {
    if (seenUnitWholeRows.has(rangeUnitKey)) {
      addResult(
        "Warning",
        "test_range",
        displayKey,
        "redundant-unit-and-subunit",
        `同じ範囲にunit全体を対象とする行（subunit空欄）とsubunit限定行の両方が登録されています。unit全体行だけでこのsubunitも対象に含まれるため冗長です。`
      );
    }
  });
}

// ---------------------------------------------------------------------------
// サマリー出力
// ---------------------------------------------------------------------------

function printSummary() {
  const bySeverity = { Critical: [], Error: [], Warning: [] };
  results.forEach((r) => {
    if (bySeverity[r.severity]) bySeverity[r.severity].push(r);
  });

  console.log("");
  console.log("========================================");
  console.log(" 学校・テスト範囲マスタ 整合性検査 サマリー");
  console.log("========================================");

  ["Critical", "Error", "Warning"].forEach((severity) => {
    const items = bySeverity[severity];
    console.log(`[${severity}] ${items.length}件`);
    items.forEach((r) => {
      console.log(`  - (${r.target}) ${r.key} [${r.rule}] ${r.message}`);
    });
  });

  console.log("");
  console.log(
    `合計: Warning ${bySeverity.Warning.length}件 / Error ${bySeverity.Error.length}件 / Critical ${bySeverity.Critical.length}件`
  );
  console.log("========================================");

  return { criticalCount: bySeverity.Critical.length, errorCount: bySeverity.Error.length };
}

function main() {
  const validSchoolIds = validateSchoolMaster();
  validateStudentSchoolGrade(validSchoolIds);
  validateTestRange(validSchoolIds);

  const { criticalCount } = printSummary();
  process.exit(criticalCount > 0 ? 1 : 0);
}

main();
