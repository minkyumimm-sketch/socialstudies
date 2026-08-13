#!/usr/bin/env node
/**
 * TestSet（学校テスト対策セット）マスタ（data/school_master.csv, data/test_set.csv,
 * data/test_set_questions.csv）の参照整合性を検査する。
 *
 * 目的（Task49: Phase4 TestSet方式のデータ基盤）:
 *   Task46の validate-test-range.mjs はTask48でTestSet方式への移行に伴い削除した。
 *   本スクリプトはその後継として、school_master・test_set・test_set_questionsの
 *   3マスタをまとめて検証する（責務はTask46版と異なりTestSet中心のため、旧ファイル名を
 *   引き継がず新設した）。
 *
 * 実行方法:
 *   node scripts/validate-test-set.mjs
 *
 * 既存コードの再利用方針:
 *   CSVパーサはcore/question-loader.jsをそのままimportする。fieldId（教科）の正本は
 *   config/subjects.js の SUBJECT_CONFIG とする。
 *
 * データが0件（ヘッダーのみ）の状態は正常とする。TestSet未登録の学校・学年があっても
 * 通常学習は継続できる設計のため（docs/architecture/ls-total-test-system-design-v1.md 9.4節）、
 * 空データをエラー扱いにしない。
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseDelimitedText, detectDelimiter, splitDelimitedLine } from "../core/question-loader.js";
import { SUBJECT_CONFIG } from "../config/subjects.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCHOOL_MASTER_PATH = "data/school_master.csv";
const TEST_SET_PATH = "data/test_set.csv";
const TEST_SET_QUESTIONS_PATH = "data/test_set_questions.csv";

// docs/architecture/ls-total-test-system-design-v1.md 9.3節: schoolIdはLSが独自に採番する。
const SCHOOL_ID_PATTERN = /^SC\d{3}$/;

// Task45で確定: LSは当面中学生のみを想定する（CLAUDE.md①の対象範囲に基づく）。
const GRADE_OPTIONS = ["中1", "中2", "中3"];

// 学年度は4月始まりのAY<開始暦年>形式（domain-model-v1.md 3.17節）。
const ACADEMIC_YEAR_PATTERN = /^AY\d{4}$/;

// school_master.csv / test_set.csv 共通のライフサイクル値（Task46踏襲）。
const ALLOWED_ACTIVE_STATUSES = ["active", "archived"];

// docs/architecture/ls-total-test-system-design-v1.md 5章・CLAUDE.md⑤で確定した
// 問題データ自体のstatusライフサイクル。TestSetが参照する問題のstatusチェックに使う。
const QUESTION_ACTIVE_STATUS = "active";
const QUESTION_NON_ACTIVE_WARNING_STATUSES = ["hidden", "draft", "archived"];

const results = [];

function addResult(severity, target, key, rule, message) {
  results.push({ severity, target, key: key || "-", rule, message });
}

function toAbsolutePath(relativePath) {
  return path.resolve(REPO_ROOT, relativePath);
}

// ---------------------------------------------------------------------------
// 共通: CSV読み込み（ヘッダー欠落・空ファイルを個別に検出するため、生の行から
// ヘッダーを直接抽出する。parseDelimitedText()はデータ0件の場合にヘッダー情報を
// 返さないため、これだけでは必須列チェックができない）。
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

  return parseDelimitedText(rawText);
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
      addResult("Error", "school_master", "-", "school-id-required", "schoolIdが空です。");
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
      addResult("Error", "school_master", schoolId, "school-name-required", "schoolNameが空です。");
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
// test_set.csv
// ---------------------------------------------------------------------------

const TEST_SET_ID_PATTERN = /^TS\d{3}$/;

function validateTestSet(validSchoolIds) {
  const rows = readCsv("test_set", TEST_SET_PATH, [
    "testSetId",
    "schoolId",
    "gradeId",
    "academicYearId",
    "examRoundLabel",
    "label",
    "status"
  ]);

  const testSetById = new Map(); // testSetId -> { schoolId, gradeId, academicYearId, examRoundLabel, label, status }
  if (rows === null) return testSetById;

  const seenIds = new Map();

  rows.forEach((row) => {
    const testSetId = String(row.testSetId ?? "").trim();
    const schoolId = String(row.schoolId ?? "").trim();
    const gradeId = String(row.gradeId ?? "").trim();
    const academicYearId = String(row.academicYearId ?? "").trim();
    const examRoundLabel = String(row.examRoundLabel ?? "").trim();
    const label = String(row.label ?? "").trim();
    const status = String(row.status ?? "").trim();
    const key = testSetId || "-";

    if (!testSetId) {
      addResult("Error", "test_set", "-", "test-set-id-required", "testSetIdが空です。");
    } else if (!TEST_SET_ID_PATTERN.test(testSetId)) {
      addResult(
        "Error",
        "test_set",
        testSetId,
        "test-set-id-format",
        `testSetId="${testSetId}"は許可された形式（${TEST_SET_ID_PATTERN}）ではありません。`
      );
    }

    if (testSetId) {
      seenIds.set(testSetId, (seenIds.get(testSetId) || 0) + 1);
      testSetById.set(testSetId, { schoolId, gradeId, academicYearId, examRoundLabel, label, status });
    }

    if (!schoolId) {
      addResult("Error", "test_set", key, "school-id-required", "schoolIdが空です。");
    } else if (!validSchoolIds.has(schoolId)) {
      addResult("Error", "test_set", key, "school-id-exists", `schoolId="${schoolId}"はschool_master.csvに存在しません。`);
    }

    if (!GRADE_OPTIONS.includes(gradeId)) {
      addResult(
        "Error",
        "test_set",
        key,
        "grade-id-valid",
        `gradeId="${gradeId}"は許可値（${GRADE_OPTIONS.join("/")}）に含まれません。`
      );
    }

    if (!academicYearId) {
      addResult("Error", "test_set", key, "academic-year-required", "academicYearIdが空です。");
    } else if (!ACADEMIC_YEAR_PATTERN.test(academicYearId)) {
      addResult(
        "Error",
        "test_set",
        key,
        "academic-year-format",
        `academicYearId="${academicYearId}"は許可された形式（${ACADEMIC_YEAR_PATTERN}）ではありません。`
      );
    }

    if (!examRoundLabel) {
      addResult("Error", "test_set", key, "exam-round-label-required", "examRoundLabelが空です。");
    }

    if (!label) {
      addResult("Error", "test_set", key, "label-required", "labelが空です。");
    }

    if (!status) {
      addResult("Error", "test_set", key, "status-required", "statusが空です。");
    } else if (!ALLOWED_ACTIVE_STATUSES.includes(status)) {
      addResult(
        "Error",
        "test_set",
        key,
        "status-valid",
        `status="${status}"は許可値（${ALLOWED_ACTIVE_STATUSES.join("/")}）に含まれません。`
      );
    }
  });

  seenIds.forEach((count, id) => {
    if (count > 1) {
      addResult("Error", "test_set", id, "test-set-id-duplicate", `testSetIdが${count}件重複しています。`);
    }
  });

  return testSetById;
}

// ---------------------------------------------------------------------------
// 教科ごとのquestionId→statusのマップを、実際の問題CSVから取得する（キャッシュ付き）。
// ---------------------------------------------------------------------------

const questionStatusByFieldCache = new Map(); // fieldId -> Map(questionId -> status) | null(読み込み失敗)

function getQuestionStatusesForField(fieldId) {
  if (questionStatusByFieldCache.has(fieldId)) {
    return questionStatusByFieldCache.get(fieldId);
  }

  const config = SUBJECT_CONFIG[fieldId];
  if (!config) {
    questionStatusByFieldCache.set(fieldId, null);
    return null;
  }

  const absolutePath = toAbsolutePath(config.csvPath.replace(/^\.\//, ""));
  if (!existsSync(absolutePath)) {
    questionStatusByFieldCache.set(fieldId, null);
    return null;
  }

  const rawText = readFileSync(absolutePath, "utf8");
  const rows = parseDelimitedText(rawText);

  const statusMap = new Map();
  rows.forEach((row) => {
    const questionId = String(row.questionId ?? "").trim();
    if (!questionId) return;
    statusMap.set(questionId, String(row.status ?? "").trim());
  });

  questionStatusByFieldCache.set(fieldId, statusMap);
  return statusMap;
}

// ---------------------------------------------------------------------------
// test_set_questions.csv
// ---------------------------------------------------------------------------

function validateTestSetQuestions(testSetById) {
  const rows = readCsv("test_set_questions", TEST_SET_QUESTIONS_PATH, ["testSetId", "fieldId", "questionId"]);
  if (rows === null) return;

  const questionCountByTestSetId = new Map();
  const seenTestSetQuestionKeys = new Map(); // testSetId+questionId -> count

  rows.forEach((row) => {
    const testSetId = String(row.testSetId ?? "").trim();
    const fieldId = String(row.fieldId ?? "").trim();
    const questionId = String(row.questionId ?? "").trim();
    const displayKey = `${testSetId}|${fieldId}|${questionId}`;

    if (!testSetId) {
      addResult("Error", "test_set_questions", displayKey, "test-set-id-required", "testSetIdが空です。");
    } else if (!testSetById.has(testSetId)) {
      addResult(
        "Error",
        "test_set_questions",
        displayKey,
        "test-set-id-exists",
        `testSetId="${testSetId}"はtest_set.csvに存在しません。`
      );
    }

    if (!fieldId) {
      addResult("Error", "test_set_questions", displayKey, "field-id-required", "fieldIdが空です。");
    } else if (!SUBJECT_CONFIG[fieldId]) {
      addResult("Error", "test_set_questions", displayKey, "field-id-exists", `fieldId="${fieldId}"はSUBJECT_CONFIGに存在しません。`);
    }

    if (!questionId) {
      addResult("Error", "test_set_questions", displayKey, "question-id-required", "questionIdが空です。");
    } else if (fieldId && SUBJECT_CONFIG[fieldId]) {
      const statusMap = getQuestionStatusesForField(fieldId);
      if (statusMap === null) {
        addResult(
          "Error",
          "test_set_questions",
          displayKey,
          "question-source-missing",
          `fieldId="${fieldId}"の問題CSVが読み込めないため、questionIdの実在確認ができません。`
        );
      } else if (!statusMap.has(questionId)) {
        addResult(
          "Error",
          "test_set_questions",
          displayKey,
          "question-id-exists",
          `questionId="${questionId}"はfieldId="${fieldId}"の問題データに存在しません（fieldIdとquestionIdの不一致の可能性があります）。`
        );
      } else {
        const questionStatus = statusMap.get(questionId);
        if (questionStatus !== QUESTION_ACTIVE_STATUS) {
          const severity = QUESTION_NON_ACTIVE_WARNING_STATUSES.includes(questionStatus) ? "Warning" : "Error";
          addResult(
            severity,
            "test_set_questions",
            displayKey,
            "question-status-not-active",
            `questionId="${questionId}"のstatus="${questionStatus}"は現在通常配信対象外です。TestSetに残してよいか確認してください。`
          );
        }
      }
    }

    if (testSetId) {
      questionCountByTestSetId.set(testSetId, (questionCountByTestSetId.get(testSetId) || 0) + 1);
    }

    if (testSetId && questionId) {
      const dupKey = `${testSetId}||${questionId}`;
      seenTestSetQuestionKeys.set(dupKey, (seenTestSetQuestionKeys.get(dupKey) || 0) + 1);
    }
  });

  seenTestSetQuestionKeys.forEach((count, dupKey) => {
    if (count > 1) {
      const [testSetId, questionId] = dupKey.split("||");
      addResult(
        "Error",
        "test_set_questions",
        `${testSetId}|${questionId}`,
        "duplicate-question-in-set",
        `testSetId="${testSetId}"内でquestionId="${questionId}"が${count}件重複しています。`
      );
    }
  });

  // 0問TestSet検出（test_set.csv側の全testSetIdを対象に、test_set_questions側の件数と突き合わせる）
  testSetById.forEach((testSet, testSetId) => {
    const count = questionCountByTestSetId.get(testSetId) || 0;
    if (count === 0) {
      if (testSet.status === "active") {
        addResult(
          "Error",
          "test_set_questions",
          testSetId,
          "empty-active-test-set",
          `testSetId="${testSetId}"はstatus="active"ですが、対象問題が0件です。生徒に提供不可能な状態です。`
        );
      } else {
        addResult(
          "Warning",
          "test_set_questions",
          testSetId,
          "empty-archived-test-set",
          `testSetId="${testSetId}"の対象問題が0件です（status="${testSet.status}"）。`
        );
      }
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
  console.log(" TestSetマスタ 整合性検査 サマリー");
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

  return { criticalCount: bySeverity.Critical.length };
}

function main() {
  const validSchoolIds = validateSchoolMaster();
  const testSetById = validateTestSet(validSchoolIds);
  validateTestSetQuestions(testSetById);

  const { criticalCount } = printSummary();
  process.exit(criticalCount > 0 ? 1 : 0);
}

main();
