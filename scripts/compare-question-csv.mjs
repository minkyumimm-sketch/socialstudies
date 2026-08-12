#!/usr/bin/env node
/**
 * questionIdをキーにした意味的CSV比較ツール。
 *
 * 目的（Task41/42: 問題管理のGoogle Sheets化）:
 *   Google Sheetsを問題編集の正本にする移行において、
 *   「CSV → Sheets → CSV」のround-tripで問題データが意味的に変化していないことを検証する。
 *
 * 使い方:
 *   node scripts/compare-question-csv.mjs <baseline.csv> <candidate.csv>
 *
 * 判定ルール:
 *   - 件数を固定値でハードコードせず、2つのCSVをその場で読み込んで比較する（不変条件検証）。
 *   - 各セル値は前後の空白をtrimしてから比較する（CSVの表現差を吸収）。
 *   - 改行コード(CRLF/LF)・BOM・末尾カンマ等はcore/question-loader.jsのparseDelimitedText()が
 *     既に正規化しているため、ここでは意識しない（フォーマット差は内容差に含めない）。
 *   - questionIdが片方にしかない行は「行欠落」または「行追加」として報告する。
 *   - 両方に存在するquestionIdについて共通列を比較し、1文字でも異なれば「内容差」として報告する
 *     （値の意味的な近さは判定しない。厳密一致のみ）。
 *   - 列そのものが片方のCSVにしか存在しない場合は「列欠落」／「列追加」として報告する。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDelimitedText } from "../core/question-loader.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function main() {
  const [, , baselineArg, candidateArg] = process.argv;
  if (!baselineArg || !candidateArg) {
    console.error("使い方: node scripts/compare-question-csv.mjs <baseline.csv> <candidate.csv>");
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

  const baselineById = new Map(baselineRows.map((r) => [r.questionId, r]));
  const candidateById = new Map(candidateRows.map((r) => [r.questionId, r]));

  const missingRows = [...baselineById.keys()].filter((id) => !candidateById.has(id));
  const addedRows = [...candidateById.keys()].filter((id) => !baselineById.has(id));

  const duplicatesInBaseline = baselineRows.length !== baselineById.size;
  const duplicatesInCandidate = candidateRows.length !== candidateById.size;

  const contentDiffs = [];
  const commonColumns = baselineHeaders.filter((h) => candidateHeaders.includes(h));

  for (const [id, baseRow] of baselineById) {
    const candRow = candidateById.get(id);
    if (!candRow) continue;
    for (const col of commonColumns) {
      const baseVal = normalizeCell(baseRow[col]);
      const candVal = normalizeCell(candRow[col]);
      if (baseVal !== candVal) {
        contentDiffs.push({ questionId: id, column: col, baseline: baseVal, candidate: candVal });
      }
    }
  }

  console.log("========================================");
  console.log(" 意味的CSV比較結果");
  console.log("========================================");
  console.log(`baseline: ${baselinePath} (${baselineRows.length}行, ${baselineHeaders.length}列)`);
  console.log(`candidate: ${candidatePath} (${candidateRows.length}行, ${candidateHeaders.length}列)`);
  console.log("");
  console.log(`[列欠落] candidateに無い列: ${missingInCandidate.length}件`, missingInCandidate);
  console.log(`[列追加] candidateにのみある列: ${extraInCandidate.length}件`, extraInCandidate);
  console.log(`[questionId重複] baseline内: ${duplicatesInBaseline ? "あり(異常)" : "なし"} / candidate内: ${duplicatesInCandidate ? "あり(異常)" : "なし"}`);
  console.log(`[行欠落] baselineにあってcandidateに無いquestionId: ${missingRows.length}件`, missingRows.slice(0, 20));
  console.log(`[行追加] candidateにあってbaselineに無いquestionId: ${addedRows.length}件`, addedRows.slice(0, 20));
  console.log(`[内容差] 値が異なるセル: ${contentDiffs.length}件`);
  contentDiffs.slice(0, 50).forEach((d) => {
    console.log(`  - ${d.questionId} [${d.column}] "${d.baseline}" -> "${d.candidate}"`);
  });
  if (contentDiffs.length > 50) {
    console.log(`  ...ほか${contentDiffs.length - 50}件`);
  }

  const isClean =
    missingInCandidate.length === 0 &&
    extraInCandidate.length === 0 &&
    !duplicatesInBaseline &&
    !duplicatesInCandidate &&
    missingRows.length === 0 &&
    addedRows.length === 0 &&
    contentDiffs.length === 0;

  console.log("");
  console.log(isClean ? "[OK] 意味的な差分は検出されませんでした。" : "[NG] 差分が検出されました。上記を確認してください。");
  process.exit(isClean ? 0 : 1);
}

main();
