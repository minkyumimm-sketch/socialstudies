#!/usr/bin/env node
/**
 * Phase4マスタ（school_master / test_set / test_set_questions）用の
 * 意味的CSV比較ツール。scripts/compare-question-csv.mjs（questionIdキー固定）を
 * 複数のマスタへ流用すると主キーが合わないため、キー列を対象ごとに切り替えられる
 * 汎用版として別ファイルにした（Task47で新設、Task49でTestSet方式のschemaへ更新）。
 *
 * 使い方:
 *   node scripts/compare-master-csv.mjs <target> <baseline.csv> <candidate.csv>
 *
 *   target: school_master | test_set | test_set_questions
 *
 * 判定ルール（compare-question-csv.mjsと同じ方針）:
 *   - 件数を固定値でハードコードせず、2つのCSVをその場で読み込んで比較する。
 *   - 各セル値は前後の空白をtrimしてから比較する。
 *   - 改行コード(CRLF/LF)・BOM等はcore/question-loader.jsのparseDelimitedText()が
 *     正規化済みのため、ここでは意識しない。
 *   - 対象ごとのキー列（複数可）で行を一意に識別し、キーが片方にしかない行を
 *     「行欠落」「行追加」として報告する。
 *   - 両方に存在する行について共通列を比較し、1文字でも異なれば「内容差」とする。
 *   - 列そのものが片方のCSVにしか存在しない場合は「列欠落」「列追加」として報告する。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDelimitedText } from "../core/question-loader.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// test_set_questionsのキーはtestSetId+questionIdのみとする（fieldIdは含めない）。
// scripts/validate-test-set.mjs が確認済みのとおり、questionIdは全7科目CSVを横断して
// グローバルに一意（Task49で474問全件を実チェック済み）であるため、これで一意性は
// 十分に担保できる。validate-test-set.mjsの重複検出キーと一致させている。
const KEY_COLUMNS_BY_TARGET = {
  school_master: ["schoolId"],
  test_set: ["testSetId"],
  test_set_questions: ["testSetId", "questionId"]
};

function readRows(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return parseDelimitedText(text);
}

function normalizeCell(value) {
  return String(value ?? "").trim();
}

function resolveInput(inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(REPO_ROOT, inputPath);
}

function buildKey(row, keyColumns) {
  return keyColumns.map((col) => normalizeCell(row[col])).join("");
}

function main() {
  const [, , target, baselineArg, candidateArg] = process.argv;
  const keyColumns = KEY_COLUMNS_BY_TARGET[target];

  if (!keyColumns || !baselineArg || !candidateArg) {
    console.error("使い方: node scripts/compare-master-csv.mjs <school_master|student_school_grade|test_range> <baseline.csv> <candidate.csv>");
    process.exit(2);
  }

  const baselinePath = resolveInput(baselineArg);
  const candidatePath = resolveInput(candidateArg);

  const baselineRows = readRows(baselinePath);
  const candidateRows = readRows(candidatePath);

  const baselineHeaders = baselineRows.length ? Object.keys(baselineRows[0]) : [];
  const candidateHeaders = candidateRows.length ? Object.keys(candidateRows[0]) : [];

  const missingInCandidate = baselineHeaders.filter((h) => !candidateHeaders.includes(h));
  const extraInCandidate = candidateHeaders.filter((h) => !baselineHeaders.includes(h));

  const baselineByKey = new Map(baselineRows.map((r) => [buildKey(r, keyColumns), r]));
  const candidateByKey = new Map(candidateRows.map((r) => [buildKey(r, keyColumns), r]));

  const missingRows = [...baselineByKey.keys()].filter((k) => !candidateByKey.has(k));
  const addedRows = [...candidateByKey.keys()].filter((k) => !baselineByKey.has(k));

  const duplicatesInBaseline = baselineRows.length !== baselineByKey.size;
  const duplicatesInCandidate = candidateRows.length !== candidateByKey.size;

  const contentDiffs = [];
  const commonColumns = baselineHeaders.filter((h) => candidateHeaders.includes(h));

  for (const [key, baseRow] of baselineByKey) {
    const candRow = candidateByKey.get(key);
    if (!candRow) continue;
    for (const col of commonColumns) {
      const baseVal = normalizeCell(baseRow[col]);
      const candVal = normalizeCell(candRow[col]);
      if (baseVal !== candVal) {
        contentDiffs.push({ key, column: col, baseline: baseVal, candidate: candVal });
      }
    }
  }

  console.log("========================================");
  console.log(` 意味的CSV比較結果 (target=${target}, key=${keyColumns.join("+")})`);
  console.log("========================================");
  console.log(`baseline: ${baselinePath} (${baselineRows.length}行, ${baselineHeaders.length}列)`);
  console.log(`candidate: ${candidatePath} (${candidateRows.length}行, ${candidateHeaders.length}列)`);
  console.log("");
  console.log(`[列欠落] candidateに無い列: ${missingInCandidate.length}件`, missingInCandidate);
  console.log(`[列追加] candidateにのみある列: ${extraInCandidate.length}件`, extraInCandidate);
  console.log(`[キー重複] baseline内: ${duplicatesInBaseline ? "あり(異常)" : "なし"} / candidate内: ${duplicatesInCandidate ? "あり(異常)" : "なし"}`);
  console.log(`[行欠落] baselineにあってcandidateに無い行: ${missingRows.length}件`);
  console.log(`[行追加] candidateにあってbaselineに無い行: ${addedRows.length}件`);
  console.log(`[内容差] 値が異なるセル: ${contentDiffs.length}件`);
  contentDiffs.slice(0, 50).forEach((d) => {
    console.log(`  - [${d.key}][${d.column}] "${d.baseline}" -> "${d.candidate}"`);
  });
  if (contentDiffs.length > 50) {
    console.log(`  ...ほか${contentDiffs.length - 50}件`);
  }

  const isCleanExceptAdditions =
    missingInCandidate.length === 0 &&
    extraInCandidate.length === 0 &&
    !duplicatesInBaseline &&
    !duplicatesInCandidate &&
    missingRows.length === 0 &&
    contentDiffs.length === 0;

  console.log("");
  console.log(
    isCleanExceptAdditions
      ? `[OK] 列・欠落行・内容差は検出されませんでした（行追加${addedRows.length}件のみ）。`
      : "[NG] 想定外の差分が検出されました。上記を確認してください。"
  );
  process.exit(isCleanExceptAdditions ? 0 : 1);
}

main();
