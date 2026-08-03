#!/usr/bin/env node
/**
 * CSV・SVG・設定ファイルの整合性を、機能追加前に検出するための開発時検査スクリプト。
 *
 * 目的（docs/architecture/ls-total-test-system-design-v1.md 6章）:
 *   Phase0〜Phase1.5Bで発見された「mapId不一致」「svgAreaIds不一致」「status不正」
 *   「CSV設定ミス」のような、CSV・SVG・コード側マスタの食い違いを事前に検出する。
 *
 * 実行方法:
 *   node scripts/validate-questions.mjs
 *
 * 既存コードの再利用方針:
 *   CSVパーサ・SVG設定・地図設定は新規実装せず、既存モジュール
 *   （core/question-loader.js, core/question-normalizer.js, config/subjects.js,
 *    core/question-screen-controller.js, renderers/map-click-config.js）から
 *   そのままimportして利用する。本ファイルは「検証ロジックの組み立て」のみを担当する。
 *
 * 将来の拡張（理科CSV・新教科・新出題形式の追加）に備え、
 * チェック項目ごとに関数を分離している。新しい教科を追加する場合は
 * config/subjects.js の SUBJECT_CONFIG に追記するだけで、本スクリプトは自動的に対応する。
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseDelimitedText,
  detectDelimiter,
  splitDelimitedLine
} from "../core/question-loader.js";
import { normalizeQuestion } from "../core/question-normalizer.js";
import { SUBJECT_CONFIG } from "../config/subjects.js";
import { VALID_QUESTION_MODES } from "../core/question-screen-controller.js";
import { MAP_CONFIGS, getMapConfig, SVG_SOURCES } from "../renderers/map-click-config.js";

// ---------------------------------------------------------------------------
// 定数・共通ユーティリティ
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// docs/architecture/ls-total-test-system-design-v1.md 5章で確定したstatusライフサイクル。
// 将来値が増える場合はここに追記する（アプリ側は現状 status === "active" のみ判定に使用）。
const ALLOWED_STATUSES = ["active", "hidden", "draft", "archived"];

// docs/specification/data-schema-v1.md のmode別必須列表に対応。
// 新しい出題形式を追加する場合は、ここにエントリを追加する
// （VALID_QUESTION_MODES自体はcore/question-screen-controller.jsから自動取得するため、
//   このMapに無いmodeが増えた場合は「必須項目未定義」としてWarningを出す設計にしている）。
const REQUIRED_FIELDS_BY_MODE = new Map([
  ["text", ["question", "answer"]],
  ["choice", ["question", "answer", "choices"]],
  ["era", ["question"]], // answer または eraCorrect のいずれかが必要（個別チェック）
  ["sort", ["question", "answer", "sortItems"]],
  ["map_click", ["question", "answer", "mapId"]] // svgAreaId/svgAreaIdsは個別チェック
]);

function toAbsolutePath(relativePath) {
  return path.resolve(REPO_ROOT, relativePath.replace(/^\.\//, ""));
}

// ---------------------------------------------------------------------------
// 結果の記録
// ---------------------------------------------------------------------------

const results = [];

function addResult(severity, subject, questionId, rule, message) {
  results.push({ severity, subject, questionId: questionId || "-", rule, message });
}

// ---------------------------------------------------------------------------
// ① CSV列数チェック
//    ヘッダーの列数と各データ行の列数が一致しているかを検査する。
//    parseDelimitedText()は列数が足りない行を黙って空文字で埋めてしまうため、
//    この検査は生の行を独自にsplitDelimitedLine()で数え直す必要がある。
// ---------------------------------------------------------------------------

function checkColumnCounts(subject, rawText) {
  const normalizedText = rawText.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    addResult("Critical", subject, "-", "csv-column-count", "CSVが空です。");
    return;
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerCount = splitDelimitedLine(lines[0], delimiter).length;

  lines.slice(1).forEach((line, index) => {
    const columnCount = splitDelimitedLine(line, delimiter).length;
    if (columnCount !== headerCount) {
      addResult(
        "Error",
        subject,
        "-",
        "csv-column-count",
        `${index + 2}行目: 列数が不一致です（ヘッダー${headerCount}列 / この行${columnCount}列）。`
      );
    }
  });
}

// ---------------------------------------------------------------------------
// ② questionId重複チェック
// ---------------------------------------------------------------------------

function checkDuplicateQuestionIds(subject, normalizedRows) {
  const seen = new Map();

  normalizedRows.forEach((q) => {
    const id = q.questionId;
    seen.set(id, (seen.get(id) || 0) + 1);
  });

  seen.forEach((count, id) => {
    if (count > 1) {
      addResult("Critical", subject, id, "duplicate-question-id", `questionIdが${count}件重複しています。`);
    }
  });
}

// ---------------------------------------------------------------------------
// ③ modeごとの必須項目チェック
// ---------------------------------------------------------------------------

function checkRequiredFieldsByMode(subject, q) {
  const requiredFields = REQUIRED_FIELDS_BY_MODE.get(q.mode);

  if (!requiredFields) {
    addResult(
      "Warning",
      subject,
      q.questionId,
      "required-fields",
      `mode="${q.mode}"の必須項目定義がvalidate-questions.mjsに存在しません。REQUIRED_FIELDS_BY_MODEへの追記を検討してください。`
    );
    return;
  }

  requiredFields.forEach((field) => {
    if (!String(q[field] ?? "").trim()) {
      addResult("Error", subject, q.questionId, "required-fields", `必須項目 "${field}" が空です（mode=${q.mode}）。`);
    }
  });

  if (q.mode === "era" && !q.eraCorrect && !q.answer) {
    addResult("Error", subject, q.questionId, "required-fields", "eraモードにはeraCorrectまたはanswerのいずれかが必要です。");
  }

  if (q.mode === "map_click" && !q.svgAreaId && !q.svgAreaIds) {
    addResult("Error", subject, q.questionId, "required-fields", "map_clickモードにはsvgAreaIdまたはsvgAreaIdsのいずれかが必要です。");
  }
}

// ---------------------------------------------------------------------------
// ④ subject存在確認
// ---------------------------------------------------------------------------

function checkSubjectExists(subject, q) {
  if (!SUBJECT_CONFIG[q.subject]) {
    addResult("Critical", subject, q.questionId, "subject-exists", `subject="${q.subject}"はSUBJECT_CONFIGに存在しません。`);
  }
}

// ---------------------------------------------------------------------------
// ⑤ mode存在確認
// ---------------------------------------------------------------------------

function checkModeValid(subject, q) {
  if (!VALID_QUESTION_MODES.includes(q.mode)) {
    addResult(
      "Critical",
      subject,
      q.questionId,
      "mode-valid",
      `mode="${q.mode}"は許可された出題形式（${VALID_QUESTION_MODES.join("/")}）に含まれません。`
    );
  }
}

// ---------------------------------------------------------------------------
// ⑥ status存在確認
// ---------------------------------------------------------------------------

function checkStatusValid(subject, q) {
  if (!ALLOWED_STATUSES.includes(q.status)) {
    addResult(
      "Error",
      subject,
      q.questionId,
      "status-valid",
      `status="${q.status}"は許可値（${ALLOWED_STATUSES.join("/")}）に含まれません。未知の値は出題対象から除外されます。`
    );
  }
}

// ---------------------------------------------------------------------------
// ⑦ mapId存在確認
// ---------------------------------------------------------------------------

function checkMapIdExists(subject, q) {
  if (q.mode !== "map_click") return;

  if (!q.mapId || !MAP_CONFIGS[q.mapId]) {
    addResult(
      "Critical",
      subject,
      q.questionId,
      "mapid-exists",
      `mapId="${q.mapId}"はMAP_CONFIGSに存在しません。未定義のmapIdは既定の地図へ無警告フォールバックします。`
    );
  }
}

// ---------------------------------------------------------------------------
// ⑧ svgAreaIds存在確認 ／ ⑨ SVGファイル存在確認
//    同じSVGファイルを多数の問題が共有するため、ファイルごとにidの集合をキャッシュする。
// ---------------------------------------------------------------------------

const svgTokenCache = new Map(); // absolutePath -> { ids: Set, classes: Set } | null(読み込み失敗)

function extractSvgIds(svgText) {
  const ids = new Set();
  const idPattern = /\bid="([^"]+)"/g;
  let match;
  while ((match = idPattern.exec(svgText)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

// 都道府県地図（rendererType: "prefecture"）はrenderers/map-click-prefecture.jsの
// getAreaIdFromClassList()と同様、id属性ではなくclass属性（例: class="hokkaido prefecture"）
// で地物を識別する方式のため、id抽出とは別にクラストークンも抽出する。
function extractSvgClassTokens(svgText) {
  const classes = new Set();
  const classPattern = /\bclass="([^"]+)"/g;
  let match;
  while ((match = classPattern.exec(svgText)) !== null) {
    match[1].split(/\s+/).filter(Boolean).forEach((token) => classes.add(token));
  }
  return classes;
}

function getSvgTokens(svgAbsolutePath) {
  if (svgTokenCache.has(svgAbsolutePath)) {
    return svgTokenCache.get(svgAbsolutePath);
  }

  if (!existsSync(svgAbsolutePath)) {
    svgTokenCache.set(svgAbsolutePath, null);
    return null;
  }

  const svgText = readFileSync(svgAbsolutePath, "utf8");
  const tokens = { ids: extractSvgIds(svgText), classes: extractSvgClassTokens(svgText) };
  svgTokenCache.set(svgAbsolutePath, tokens);
  return tokens;
}

function splitPipeValues(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function checkSvgAreaIdsExist(subject, q) {
  if (q.mode !== "map_click") return;
  if (!q.mapId || !MAP_CONFIGS[q.mapId]) return; // ⑦で既に報告済みのため二重報告を避ける

  const mapConfig = getMapConfig(q);
  const svgSourceEntry = SVG_SOURCES[mapConfig.svgSource];

  if (!svgSourceEntry) {
    addResult(
      "Critical",
      subject,
      q.questionId,
      "svg-file-exists",
      `mapId="${q.mapId}"のsvgSource="${mapConfig.svgSource}"がSVG_SOURCESに存在しません。`
    );
    return;
  }

  const svgAbsolutePath = toAbsolutePath(svgSourceEntry.path);
  const tokens = getSvgTokens(svgAbsolutePath);

  if (tokens === null) {
    addResult("Critical", subject, q.questionId, "svg-file-exists", `SVGファイルが見つかりません: ${svgSourceEntry.path}`);
    return;
  }

  const targetIds = splitPipeValues(q.svgAreaIds).length > 0 ? splitPipeValues(q.svgAreaIds) : splitPipeValues(q.svgAreaId);

  if (targetIds.length === 0) return; // ③required-fieldsで既に報告済み

  // rendererTypeにより地物の識別方式が異なる（renderers/map-click-*.js参照）:
  //   prefecture: class属性で識別（例: class="hokkaido prefecture"）
  //   line / area: id属性で識別
  const lookupSet = mapConfig.rendererType === "prefecture" ? tokens.classes : tokens.ids;
  const attributeLabel = mapConfig.rendererType === "prefecture" ? "class" : "id";

  targetIds.forEach((id) => {
    if (!lookupSet.has(id)) {
      addResult(
        "Critical",
        subject,
        q.questionId,
        "svgareaid-exists",
        `svgAreaId(s)="${id}"に対応する${attributeLabel}属性の要素がSVG内（${svgSourceEntry.path}）に存在しません。`
      );
    }
  });
}

// ⑨ SVGファイル存在確認（設定ファイル全体の健全性チェック。CSVの使用有無に関わらず全件確認する）
function checkAllSvgSourcesExist() {
  Object.entries(SVG_SOURCES).forEach(([sourceKey, entry]) => {
    const absolutePath = toAbsolutePath(entry.path);
    if (!existsSync(absolutePath)) {
      addResult(
        "Critical",
        "(config)",
        "-",
        "svg-file-exists",
        `SVG_SOURCES["${sourceKey}"]が指すファイルが存在しません: ${entry.path}`
      );
    }
  });

  Object.entries(MAP_CONFIGS).forEach(([mapId, mapConfig]) => {
    if (!SVG_SOURCES[mapConfig.svgSource]) {
      addResult(
        "Critical",
        "(config)",
        "-",
        "mapconfig-svgsource-exists",
        `MAP_CONFIGS["${mapId}"]のsvgSource="${mapConfig.svgSource}"がSVG_SOURCESに存在しません。`
      );
    }
  });
}

// ---------------------------------------------------------------------------
// 1科目分のCSVを検査
// ---------------------------------------------------------------------------

function validateSubjectCsv(subject, csvPath) {
  const absolutePath = toAbsolutePath(csvPath);

  if (!existsSync(absolutePath)) {
    addResult("Critical", subject, "-", "csv-file-exists", `CSVファイルが存在しません: ${csvPath}`);
    return;
  }

  const rawText = readFileSync(absolutePath, "utf8");

  checkColumnCounts(subject, rawText);

  const rawRows = parseDelimitedText(rawText);
  const normalizedRows = rawRows.map((row) => normalizeQuestion(row, subject));

  checkDuplicateQuestionIds(subject, normalizedRows);

  normalizedRows.forEach((q) => {
    checkSubjectExists(subject, q);
    checkModeValid(subject, q);
    checkStatusValid(subject, q);
    checkRequiredFieldsByMode(subject, q);
    checkMapIdExists(subject, q);
    checkSvgAreaIdsExist(subject, q);
  });

  return normalizedRows.length;
}

// ---------------------------------------------------------------------------
// ⑩ 最終サマリー
// ---------------------------------------------------------------------------

function printSummary(totalQuestionCount) {
  const bySeverity = { Error: [], Warning: [], Critical: [] };

  results.forEach((r) => {
    if (bySeverity[r.severity]) {
      bySeverity[r.severity].push(r);
    }
  });

  console.log("");
  console.log("========================================");
  console.log(" CSV/SVG/設定ファイル 整合性検査 サマリー");
  console.log("========================================");
  console.log(`検査対象問題数: ${totalQuestionCount}`);
  console.log("");

  ["Critical", "Error", "Warning"].forEach((severity) => {
    const items = bySeverity[severity];
    console.log(`[${severity}] ${items.length}件`);
    items.forEach((r) => {
      console.log(`  - (${r.subject}) ${r.questionId} [${r.rule}] ${r.message}`);
    });
  });

  const affectedQuestionIds = new Set(
    results.filter((r) => r.questionId !== "-").map((r) => `${r.subject}::${r.questionId}`)
  );
  const okCount = totalQuestionCount - affectedQuestionIds.size;

  console.log("");
  console.log(`[OK] ${okCount}件（指摘のなかった問題数 / 全${totalQuestionCount}件中）`);
  console.log("");
  console.log(
    `合計: OK ${okCount}件 / Warning ${bySeverity.Warning.length}件 / Error ${bySeverity.Error.length}件 / Critical ${bySeverity.Critical.length}件`
  );
  console.log("========================================");

  return bySeverity.Critical.length;
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

function main() {
  let totalQuestionCount = 0;

  Object.entries(SUBJECT_CONFIG).forEach(([subject, config]) => {
    const count = validateSubjectCsv(subject, config.csvPath);
    if (typeof count === "number") {
      totalQuestionCount += count;
    }
  });

  checkAllSvgSourcesExist();

  const criticalCount = printSummary(totalQuestionCount);

  process.exit(criticalCount > 0 ? 1 : 0);
}

main();
