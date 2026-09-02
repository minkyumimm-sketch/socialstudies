// ============================================================================
// LearningSummary.gs（2026-08-30 改訂版）
//
// attempts / answer_records（正本）から、講師がGoogle Spreadsheet上で直接確認できる
// 4つの派生集計シートを生成する。
//
//   A. 生徒別成績       （studentId × 科目（社会/理科の大分類））
//   B. 生徒別単元成績   （studentId × 科目（分野単位のラベル） × 単元）※新設
//   C. 問題別成績       （questionId。TestSet横断で1問=1行、誤答率の高い順）
//   D. 間違い問題サマリー（studentId × questionId。旧「間違い明細」を全面改訂）
//
// 【正本保護】このスクリプトはattempts/answer_recordsシートを一切書き換えない
// （読み取り専用、getDataRange().getValues()のみ）。書き込み対象は上記4シートのみ。
// 旧バージョンが作成した「間違い明細」シートは削除しない（残したまま、新設の
// 「間違い問題サマリー」を並べて作る。古いシートの要否はユーザー側の判断に委ねる）。
//
// 【今回の改訂の背景】
//   旧バージョン（生徒別成績=studentId×sourceType×testSetId×fieldId、間違い明細=
//   isCorrect=falseの生Record一覧）は、講師が実際の教室運用で見るには粒度が細かすぎた
//   （同じ生徒の同じ科目が、通常学習/TestSet/TestSet種別ごとに別行へ分散する、
//   間違いが「直った後も含めて」1行1回答のまま残り続ける、等）。
//   今回、下記の教室運用向けの4シート構成へ全面的に作り直す。
//
// 【科目の大分類（社会/理科）について】
//   config/subjects.js（学習アプリ側）には現時点で「社会/理科」という親カテゴリの概念が
//   存在しない（docs/specification/domain-model-v1.md 2.1節・3.4節に「Phase3新設の
//   config/fields.jsで導入予定」とあるのみで未実装）。そのため、既存の7科目キー
//   （japan_geo/world_geo/history/biology/chemistry/physics/earth_science）の構成から
//   機械的に導出した対応表をこのファイル内に持つ（FIELD_ID_TO_BROAD_CATEGORY_/
//   FIELD_ID_TO_LABEL_、config/subjects.jsのlabelと同じ日本語ラベルを使用）。
//   config/subjects.js側に将来正式なsubjectId（social/science）が追加された場合は、
//   このファイルの対応表も合わせて更新が必要（GAS側はブラウザ側のJSモジュールを
//   importできないため、手動同期が必要な箇所として明示しておく）。
//   新しい科目キーが追加されても集計自体は止まらないよう、未知のfieldIdは
//   「その他」大分類・fieldIdそのものを表示ラベルとして扱う（フォールバック）。
//
// 【completed=false のAttemptを含める判断について】
//   今回、Attempt.completedの値に関わらず、answer_recordsに保存済みの全AnswerRecordを
//   集計対象に含める（旧バージョンから変更なし）。
//   理由: AnswerRecordは1問ごとに解答確定時点でGASへ保存される、独立した「実際に
//   起きた解答」の記録である。Attempt.completedは「セッション全体が最後まで完了したか」
//   を示すだけで、例えば通信が不安定でcompleteAttemptの送信だけが失敗した場合や、
//   TestSetを最後の1問を残して中断した場合でも、既に保存された回答自体は生徒が
//   実際に取り組んだ本物の学習データである。これを一律除外すると、講師から見て
//   「実際にはたくさん解いているのに集計に出てこない」という実害の方が大きいと判断した。
//   なお本改訂の検証に使ったS0061（テスト生徒）のAttemptにも、動作検証中に生じた
//   completed=falseのものが複数含まれるが、上記方針により同様に集計対象へ含まれる。
//
// 【retry（間違い直し）回答の扱いについて・既知の制約】
//   docs/specification/domain-model-v1.md 3.12/3.12.1節で明記されている既存の確定仕様
//   により、同一Attempt内で同じ問題に再回答（間違い直しラウンド）した場合、
//   answer_records上は同一キー（attemptId::questionId）でupsertされ、最初の誤答の
//   selectedChoice/isCorrect=false/answeredAtは残らない（最新の回答で上書きされ、
//   Phase5時点では意図的にraw履歴を持たない設計）。
//   そのため、本集計でも「同一Attempt内での間違い直し1回分」を独立した1回の解答として
//   復元することはできない（データ源に無い情報は作れないため）。
//   本集計での「総回答回数」は、同一studentId×questionIdについて実際にanswer_records上に
//   存在する行数（＝別々のAttempt・別セッションで解いた回数）を数える。同一Attempt内の
//   間違い直しは、そのAttempt内では「最終的な結果」1件としてのみ反映される
//   （例: 1問目×→retryで○、というセッションは「回答1回・正解1回」として現れ、
//   「回答2回・正解1・誤答1」という内訳は再現できない）。この制約は正本
//   （answer_records）側の仕様変更なしには解消できないため、今回は現状のまま扱い、
//   この限界を明示する。
//
// 【TestSet名の扱い（同じ問題を複数TestSet/通常学習で解いている場合）】
//   間違い問題サマリー（D）のTestSet名列は、「最終回答結果」「最終回答日時」と対を
//   なす形で、answeredAtが最も新しい解答が行われた文脈（通常学習なら空欄、TestSetなら
//   そのTestSet名）を表示する。総回答回数・誤答回数・正解回数はTestSet/通常学習を
//   問わず全件合算する（複数TestSetにまたがる場合でも合計値自体は正しい）。
//   個々のTestSetごとの内訳が必要になった場合は、別シートでの対応を別途検討する
//   （今回は要求されていないため実装しない）。
//
// 【生徒名・学校名・学年・TestSet名・問題文の表示解決について】
//   生徒管理・TestSetマスタ・問題マスタは、いずれもこの学習記録GASとは別のGoogle
//   Spreadsheetで管理されている。既存の講師PIN（TEACHER_PIN）と同じ方式で、
//   Apps Scriptエディタの「プロジェクトの設定」→「スクリプト プロパティ」に
//   以下の3つを設定することで、表示名解決が有効になる（前バージョンから変更なし）：
//
//     STUDENT_MASTER_SPREADSHEET_ID   … 生徒管理システムのSpreadsheet ID
//     TESTSET_MASTER_SPREADSHEET_ID   … 「LS総合テスト対策_学校・テストセットマスター」のID
//     QUESTION_MASTER_SPREADSHEET_ID  … 「LS総合テスト対策_問題マスター」のID
//
//   生徒マスタについては、今回の検証セッションで実際に本番APIレスポンスを確認し、
//   student_id/display_name/search_name/school_name/grade/activeという実列名を確認済み
//   （student-management-system/apps/student-master/Repository.gsのHEADERS定義とも一致）。
//   そのため学校名・学年も同じ1回のシート読み込みで解決する（buildStudentInfoMap_、
//   buildStudentDisplayNameMap_を置き換え）。列が見つからない場合は例外にせず、
//   該当項目だけ空欄のまま（studentId等のフォールバックにはしない）にする。
// ============================================================================

var LEARNING_SUMMARY_SHEET_NAMES = {
  attempts: "attempts",
  answerRecords: "answer_records",
  studentSummary: "生徒別成績",
  studentUnitSummary: "生徒別単元成績",
  questionSummary: "問題別成績",
  wrongQuestionSummary: "間違い問題サマリー"
};

var LEARNING_SUMMARY_PROPERTY_KEYS = {
  studentMasterSpreadsheetId: "STUDENT_MASTER_SPREADSHEET_ID",
  testSetMasterSpreadsheetId: "TESTSET_MASTER_SPREADSHEET_ID",
  questionMasterSpreadsheetId: "QUESTION_MASTER_SPREADSHEET_ID"
};

var STUDENT_MASTER_ID_COLUMN_CANDIDATES = ["student_id", "studentId", "生徒ID", "ID"];
var STUDENT_MASTER_NAME_COLUMN_CANDIDATES = ["display_name", "displayName", "氏名", "名前", "生徒名"];
var STUDENT_MASTER_SCHOOL_COLUMN_CANDIDATES = ["school_name", "schoolName", "学校名", "学校"];
var STUDENT_MASTER_GRADE_COLUMN_CANDIDATES = ["grade", "学年"];

// config/subjects.js（学習アプリ側）と同じキー・同じ日本語ラベルのミラー。
// 新しい科目キーがconfig/subjects.js側へ追加された場合、ここにも追記が必要
// （GAS側はブラウザ側のESモジュールを直接importできないため）。
var FIELD_ID_TO_LABEL_ = {
  japan_geo: "日本地理",
  world_geo: "世界地理",
  history: "歴史",
  civics: "公民",
  biology: "生物",
  chemistry: "化学",
  physics: "物理",
  earth_science: "地学"
};

// 「社会/理科」の大分類は、config/subjects.js側にまだ正式なsubjectId概念が無いため
// （docs/specification/domain-model-v1.md 2.1節・3.4節に将来のconfig/fields.js導入予定と
// 記載があるのみ）、既存7科目キーの構成から機械的に導出した対応表。
var FIELD_ID_TO_BROAD_CATEGORY_ = {
  japan_geo: "社会",
  world_geo: "社会",
  history: "社会",
  civics: "社会",
  biology: "理科",
  chemistry: "理科",
  physics: "理科",
  earth_science: "理科"
};

function resolveFieldLabel_(fieldId) {
  var key = String(fieldId || "").trim();
  if (!key) return "未分類";
  return FIELD_ID_TO_LABEL_[key] || key; // 未知のfieldIdはそのまま表示（集計を止めない）
}

function resolveBroadCategory_(fieldId) {
  var key = String(fieldId || "").trim();
  if (!key) return "未分類";
  return FIELD_ID_TO_BROAD_CATEGORY_[key] || "その他"; // 未知のfieldIdは「その他」
}

function resolveNarrowSubjectLabel_(fieldId) {
  var broad = resolveBroadCategory_(fieldId);
  var label = resolveFieldLabel_(fieldId);
  if (broad === "未分類" || broad === "その他") return label;
  if (broad === label) return label; // 保険（万一broad==labelの科目が出た場合の重複表示防止）
  return broad + "・" + label;
}

// ----------------------------------------------------------------------------
// 集計ロジック本体（純粋関数、SpreadsheetAppに依存しない。ローカルNode.jsでの
// 動作検証時と完全に同一のコードをそのまま貼り付けている）。
// ----------------------------------------------------------------------------

function toPercentString_(numerator, denominator) {
  if (!denominator) return "";
  return Math.round((numerator / denominator) * 1000) / 10 + "%"; // 小数第1位まで
}

// answer_recordsシート上のisCorrect列が実際にboolean型で保存されているか、
// 文字列"TRUE"/"FALSE"型かをこちらから直接確認できなかったため、両対応にしておく。
function isCorrectValue_(rawValue) {
  if (rawValue === true) return true;
  if (typeof rawValue === "string" && rawValue.trim().toUpperCase() === "TRUE") return true;
  return false;
}

function toIsoOrEmpty_(dateLike) {
  if (!dateLike) return "";
  var time = typeof dateLike === "string" ? Date.parse(dateLike) : (dateLike.getTime ? dateLike.getTime() : NaN);
  if (!isFinite(time)) return "";
  return new Date(time).toISOString();
}

/**
 * attempts/answer_recordsの生データを、Attempt由来の文脈情報（sourceType/testSetId）と
 * 問題マスタ由来の情報（unit/questionText、解決できた場合のみ）を1レコードごとに
 * 付与した「拡張済みレコード」の配列へ変換する（各シート集計の共通の元データ、
 * 同じ解決処理・同じ突き合わせを複数箇所へ重複実装しないための1回の変換パス）。
 *
 * @param {Array<Object>} attempts
 * @param {Array<Object>} answerRecords
 * @param {Map<string,{question:string, unit:string}>} questionMasterMap - 問題マスタから解決できた
 *   {questionId -> {question, unit}}（未解決の場合は空Map。呼び出し元が用意する）
 * @returns {Array<Object>} enrichedRecords
 */
function buildEnrichedRecords_(attempts, answerRecords, questionMasterMap) {
  var attemptById = new Map();
  attempts.forEach(function (a) { attemptById.set(String(a.attemptId), a); });

  var unresolvedQuestionIds = new Set();
  var missingUnitCount = 0;

  var enriched = answerRecords.map(function (record) {
    var attempt = attemptById.get(String(record.attemptId));
    var sourceType = attempt ? (attempt.sourceType || "") : "";
    var testSetId = attempt ? (attempt.testSetId || "") : "";
    var fieldId = record.fieldId || (attempt ? attempt.fieldId : "") || "";

    var master = questionMasterMap && questionMasterMap.get ? questionMasterMap.get(record.questionId) : null;
    var unit = (master && master.unit) || record.unit || "";
    if (!unit) missingUnitCount += 1;
    var questionText = (master && master.question) || "";
    if (!questionText) unresolvedQuestionIds.add(record.questionId);

    return {
      studentId: record.studentId,
      questionId: record.questionId,
      attemptId: record.attemptId,
      fieldId: fieldId,
      broadCategory: resolveBroadCategory_(fieldId),
      narrowLabel: resolveNarrowSubjectLabel_(fieldId),
      unit: unit || "未分類",
      questionText: questionText,
      selectedChoice: record.selectedChoice || "",
      correctAnswer: record.correctAnswer || "",
      isCorrect: isCorrectValue_(record.isCorrect),
      answeredAt: toIsoOrEmpty_(record.answeredAt),
      sourceType: sourceType,
      testSetId: testSetId
    };
  });

  return {
    records: enriched,
    unresolvedQuestionIdCount: unresolvedQuestionIds.size,
    missingUnitCount: missingUnitCount
  };
}

/**
 * A. 生徒別成績（studentId × 科目大分類）。
 */
function buildStudentSubjectSummaryRows_(enrichedRecords) {
  var groups = new Map();

  enrichedRecords.forEach(function (r) {
    var key = JSON.stringify([r.studentId, r.broadCategory]);
    if (!groups.has(key)) {
      groups.set(key, {
        studentId: r.studentId,
        subjectLabel: r.broadCategory,
        answered: 0,
        correct: 0,
        incorrect: 0
      });
    }
    var g = groups.get(key);
    g.answered += 1;
    if (r.isCorrect) g.correct += 1; else g.incorrect += 1;
  });

  return Array.from(groups.values()).map(function (g) {
    return {
      studentId: g.studentId,
      subjectLabel: g.subjectLabel,
      answered: g.answered,
      correct: g.correct,
      incorrect: g.incorrect,
      correctRate: toPercentString_(g.correct, g.answered)
    };
  });
}

/**
 * B. 生徒別単元成績（studentId × 科目（分野ラベル） × 単元）。
 */
function buildStudentUnitSummaryRows_(enrichedRecords) {
  var groups = new Map();

  enrichedRecords.forEach(function (r) {
    var key = JSON.stringify([r.studentId, r.narrowLabel, r.unit]);
    if (!groups.has(key)) {
      groups.set(key, {
        studentId: r.studentId,
        subjectLabel: r.narrowLabel,
        unit: r.unit,
        answered: 0,
        correct: 0,
        incorrect: 0
      });
    }
    var g = groups.get(key);
    g.answered += 1;
    if (r.isCorrect) g.correct += 1; else g.incorrect += 1;
  });

  return Array.from(groups.values()).map(function (g) {
    return {
      studentId: g.studentId,
      subjectLabel: g.subjectLabel,
      unit: g.unit,
      answered: g.answered,
      correct: g.correct,
      incorrect: g.incorrect,
      correctRate: toPercentString_(g.correct, g.answered)
    };
  });
}

/**
 * C. 問題別成績（questionId単位、TestSet横断で1問=1行）。誤答率の高い順に並べる
 * （呼び出し元のwriteObjectsToSheet_へ渡す前にソート済みの配列を返す）。
 */
function buildQuestionSummaryRows_(enrichedRecords) {
  var groups = new Map();

  enrichedRecords.forEach(function (r) {
    var key = r.questionId;
    if (!groups.has(key)) {
      groups.set(key, {
        questionId: r.questionId,
        subjectLabel: r.narrowLabel,
        unit: r.unit,
        questionText: r.questionText,
        answered: 0,
        correct: 0,
        incorrect: 0
      });
    }
    var g = groups.get(key);
    g.answered += 1;
    if (r.isCorrect) g.correct += 1; else g.incorrect += 1;
    // questionText/unitが後から解決できるケースへ配慮し、空欄のままなら上書きで補う
    if (!g.questionText && r.questionText) g.questionText = r.questionText;
    if (g.unit === "未分類" && r.unit && r.unit !== "未分類") g.unit = r.unit;
  });

  var rows = Array.from(groups.values()).map(function (g) {
    return {
      questionId: g.questionId,
      subjectLabel: g.subjectLabel,
      unit: g.unit,
      questionText: g.questionText,
      answered: g.answered,
      correct: g.correct,
      incorrect: g.incorrect,
      incorrectRate: toPercentString_(g.incorrect, g.answered),
      incorrectRateValue: g.answered ? g.incorrect / g.answered : -1 // ソート専用、出力列には含めない
    };
  });

  rows.sort(function (a, b) {
    if (b.incorrectRateValue !== a.incorrectRateValue) return b.incorrectRateValue - a.incorrectRateValue;
    return b.answered - a.answered; // 誤答率が同じ場合は回答数が多い方を先に(参考価値が高いため)
  });

  return rows;
}

/**
 * D. 間違い問題サマリー（studentId × questionId、誤答が1回以上ある組み合わせのみ）。
 * 「最終」系の列（最終回答結果・最終回答日時・TestSet名）は、answeredAtが最も新しい
 * レコードの内容を採用する。
 */
function buildWrongQuestionSummaryRows_(enrichedRecords) {
  var groups = new Map();

  enrichedRecords.forEach(function (r) {
    var key = JSON.stringify([r.studentId, r.questionId]);
    if (!groups.has(key)) {
      groups.set(key, {
        studentId: r.studentId,
        questionId: r.questionId,
        subjectLabel: r.narrowLabel,
        unit: r.unit,
        questionText: r.questionText,
        totalAnswered: 0,
        correctCount: 0,
        incorrectCount: 0,
        latest: null // 最新のenriched record自体を保持(answeredAt比較用)
      });
    }
    var g = groups.get(key);
    g.totalAnswered += 1;
    if (r.isCorrect) g.correctCount += 1; else g.incorrectCount += 1;
    if (!g.questionText && r.questionText) g.questionText = r.questionText;
    if (g.unit === "未分類" && r.unit && r.unit !== "未分類") g.unit = r.unit;

    if (!g.latest || (r.answeredAt && r.answeredAt > (g.latest.answeredAt || ""))) {
      g.latest = r;
    }
  });

  var rows = [];
  groups.forEach(function (g) {
    if (g.incorrectCount < 1) return; // 一度も間違えたことが無い組み合わせは対象外

    rows.push({
      studentId: g.studentId,
      questionId: g.questionId,
      subjectLabel: g.subjectLabel,
      unit: g.unit,
      questionText: g.questionText,
      totalAnswered: g.totalAnswered,
      incorrectCount: g.incorrectCount,
      correctCount: g.correctCount,
      incorrectRate: toPercentString_(g.incorrectCount, g.totalAnswered),
      lastResult: g.latest && g.latest.isCorrect ? "○" : "×",
      lastAnsweredAt: (g.latest && g.latest.answeredAt) || "",
      lastSourceType: (g.latest && g.latest.sourceType) || "",
      lastTestSetId: (g.latest && g.latest.testSetId) || ""
    });
  });

  rows.sort(function (a, b) {
    if (a.lastAnsweredAt === b.lastAnsweredAt) return 0;
    if (!a.lastAnsweredAt) return 1;
    if (!b.lastAnsweredAt) return -1;
    return a.lastAnsweredAt < b.lastAnsweredAt ? 1 : -1; // 新しい順
  });

  return rows;
}

// ----------------------------------------------------------------------------
// 表示名解決の付加層（純粋関数、既存の集計ロジック本体には一切手を入れない）。
// Mapが空、またはキーが見つからない場合は元のID文字列をそのまま使う
// （「解決できなくてもIDを残す」既存方針を踏襲）。
// ----------------------------------------------------------------------------

function resolveOrFallback_(map, key) {
  if (!key) return "";
  if (!map || typeof map.get !== "function") return key;
  var resolved = map.get(key);
  return resolved || key;
}

function resolveStudentField_(studentInfoMap, studentId, field) {
  if (!studentInfoMap || typeof studentInfoMap.get !== "function") return "";
  var info = studentInfoMap.get(studentId);
  return (info && info[field]) || "";
}

function enrichStudentSubjectRows_(rows, studentInfoMap) {
  return rows.map(function (r) {
    var copy = {};
    for (var k in r) copy[k] = r[k];
    copy.studentDisplayName = resolveStudentField_(studentInfoMap, r.studentId, "displayName") || r.studentId;
    copy.schoolName = resolveStudentField_(studentInfoMap, r.studentId, "schoolName");
    copy.grade = resolveStudentField_(studentInfoMap, r.studentId, "grade");
    return copy;
  });
}

function enrichStudentUnitRows_(rows, studentInfoMap) {
  return rows.map(function (r) {
    var copy = {};
    for (var k in r) copy[k] = r[k];
    copy.studentDisplayName = resolveStudentField_(studentInfoMap, r.studentId, "displayName") || r.studentId;
    return copy;
  });
}

function enrichWrongQuestionRows_(rows, studentInfoMap, testSetLabelMap) {
  return rows.map(function (r) {
    var copy = {};
    for (var k in r) copy[k] = r[k];
    copy.studentDisplayName = resolveStudentField_(studentInfoMap, r.studentId, "displayName") || r.studentId;
    copy.lastTestSetLabel = r.lastTestSetId ? resolveOrFallback_(testSetLabelMap, r.lastTestSetId) : "";
    return copy;
  });
}

// ----------------------------------------------------------------------------
// マスタSpreadsheetの一括読み込み（1マスタにつきopenById 1回のみ、
// 1Recordごとの個別アクセスは一切行わない）。
// いずれも失敗時は空Mapを返し、呼び出し元の集計処理自体は止めない。
// ----------------------------------------------------------------------------

function findColumnIndex_(headers, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var idx = headers.indexOf(candidates[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * 生徒マスタから {studentId -> {displayName, schoolName, grade}} を1回のシート読込で解決する。
 * 旧バージョンのbuildStudentDisplayNameMap_（displayNameのみ）を置き換える
 * （呼び出し元は本関数1つだけを使い、生徒名解決のロジックを重複実装しない）。
 * school_name/gradeが見つからない場合はその項目だけ空欄にする（displayNameの解決自体は
 * 妨げない）。
 */
function buildStudentInfoMap_() {
  var map = new Map();
  try {
    var id = PropertiesService.getScriptProperties().getProperty(LEARNING_SUMMARY_PROPERTY_KEYS.studentMasterSpreadsheetId);
    if (!id) return map;

    var ss = SpreadsheetApp.openById(id);
    var sheet = ss.getSheets()[0];
    var values = sheet.getDataRange().getValues();
    if (values.length === 0) return map;

    var headers = values[0].map(function (h) { return String(h).trim(); });
    var idCol = findColumnIndex_(headers, STUDENT_MASTER_ID_COLUMN_CANDIDATES);
    var nameCol = findColumnIndex_(headers, STUDENT_MASTER_NAME_COLUMN_CANDIDATES);
    var schoolCol = findColumnIndex_(headers, STUDENT_MASTER_SCHOOL_COLUMN_CANDIDATES);
    var gradeCol = findColumnIndex_(headers, STUDENT_MASTER_GRADE_COLUMN_CANDIDATES);

    if (idCol === -1 || nameCol === -1) {
      Logger.log("生徒マスタの列名候補が見つかりませんでした（studentIdのまま表示します）。実際の列名: " + headers.join(", "));
      return map;
    }
    if (schoolCol === -1 || gradeCol === -1) {
      Logger.log("生徒マスタに学校名/学年の列が見つかりませんでした（該当項目は空欄で表示します）。実際の列名: " + headers.join(", "));
    }

    for (var i = 1; i < values.length; i++) {
      var studentId = String(values[i][idCol]).trim();
      if (!studentId) continue;
      map.set(studentId, {
        displayName: String(values[i][nameCol]).trim(),
        schoolName: schoolCol === -1 ? "" : String(values[i][schoolCol] || "").trim(),
        grade: gradeCol === -1 ? "" : String(values[i][gradeCol] || "").trim()
      });
    }
  } catch (e) {
    Logger.log("生徒マスタの解決に失敗しました（studentIdのまま表示します）: " + e);
  }
  return map;
}

function buildTestSetLabelMap_() {
  var map = new Map();
  try {
    var id = PropertiesService.getScriptProperties().getProperty(LEARNING_SUMMARY_PROPERTY_KEYS.testSetMasterSpreadsheetId);
    if (!id) return map;

    var ss = SpreadsheetApp.openById(id);
    var sheet = ss.getSheetByName("test_set");
    if (!sheet) {
      Logger.log("TestSetマスタに test_set シートが見つかりませんでした（testSetIdのまま表示します）。");
      return map;
    }

    var values = sheet.getDataRange().getValues();
    if (values.length === 0) return map;

    var headers = values[0].map(function (h) { return String(h).trim(); });
    var idCol = headers.indexOf("testSetId");
    var labelCol = headers.indexOf("label");

    if (idCol === -1 || labelCol === -1) {
      Logger.log("TestSetマスタの列名(testSetId/label)が見つかりませんでした: " + headers.join(", "));
      return map;
    }

    for (var i = 1; i < values.length; i++) {
      var testSetId = String(values[i][idCol]).trim();
      var label = String(values[i][labelCol]).trim();
      if (testSetId) map.set(testSetId, label);
    }
  } catch (e) {
    Logger.log("TestSetマスタの解決に失敗しました（testSetIdのまま表示します）: " + e);
  }
  return map;
}

/**
 * 問題マスタから {questionId -> {question, unit}} を解決する。
 * 旧バージョンのbuildQuestionTextMap_（questionのみ）を置き換える（unitも同じ1回の
 * シート読込で併せて取得し、単元別集計（B）・問題別成績（C）・間違い問題サマリー（D）が
 * 同じ解決結果を共有する）。
 *
 * @param {Array<string>} neededFieldIds - 今回のattempts/answer_recordsに実際に登場する
 *   fieldIdのみ（問題マスタの全タブを無条件に読むのではなく、必要なタブだけを読む）。
 */
function buildQuestionMasterMap_(neededFieldIds) {
  var map = new Map();
  try {
    var id = PropertiesService.getScriptProperties().getProperty(LEARNING_SUMMARY_PROPERTY_KEYS.questionMasterSpreadsheetId);
    if (!id) return map;

    var ss = SpreadsheetApp.openById(id);

    neededFieldIds.forEach(function (fieldId) {
      try {
        var sheet = ss.getSheetByName(fieldId);
        if (!sheet) {
          Logger.log("問題マスタに " + fieldId + " シートが見つかりませんでした。");
          return;
        }

        var values = sheet.getDataRange().getValues();
        if (values.length === 0) return;

        var headers = values[0].map(function (h) { return String(h).trim(); });
        var idCol = headers.indexOf("questionId");
        var questionCol = headers.indexOf("question");
        var unitCol = headers.indexOf("unit");

        if (idCol === -1 || questionCol === -1) {
          Logger.log(fieldId + "シートの列名(questionId/question)が見つかりませんでした: " + headers.join(", "));
          return;
        }

        for (var i = 1; i < values.length; i++) {
          var questionId = String(values[i][idCol]).trim();
          if (!questionId) continue;
          map.set(questionId, {
            question: String(values[i][questionCol] || "").trim(),
            unit: unitCol === -1 ? "" : String(values[i][unitCol] || "").trim()
          });
        }
      } catch (innerError) {
        Logger.log(fieldId + "シートの読み込みに失敗しました: " + innerError);
      }
    });
  } catch (e) {
    Logger.log("問題マスタの解決に失敗しました（questionIdのまま・単元は記録済みの値のまま表示します）: " + e);
  }
  return map;
}

// ----------------------------------------------------------------------------
// GAS依存のI/Oヘルパー（Sheet読み取り・書き込みのみ。setValuesは1シートにつき1回）
// ----------------------------------------------------------------------------

function readSheetAsObjects_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("シートが見つかりません: " + sheetName);
  }

  var values = sheet.getDataRange().getValues();
  if (values.length === 0) return [];

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (cell) { return cell === "" || cell === null; })) continue;

    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
    }
    rows.push(obj);
  }

  return rows;
}

function writeObjectsToSheet_(spreadsheet, sheetName, headerRow, headerKeys, rows) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  sheet.clearContents();
  try {
    sheet.getFilter() && sheet.getFilter().remove();
  } catch (e) {
    // フィルタが無い場合は何もしない
  }

  var values = [headerRow];
  rows.forEach(function (row) {
    values.push(headerKeys.map(function (key) { return row[key]; }));
  });

  sheet.getRange(1, 1, values.length, headerRow.length).setValues(values);
  sheet.setFrozenRows(1);

  if (values.length > 1) {
    sheet.getRange(1, 1, values.length, headerRow.length).createFilter();
  }

  sheet.autoResizeColumns(1, headerRow.length);
}

// ----------------------------------------------------------------------------
// メインエントリポイント（Apps Scriptエディタから手動実行する）
// ----------------------------------------------------------------------------

function generateLearningSummarySheets() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  var attempts = readSheetAsObjects_(spreadsheet, LEARNING_SUMMARY_SHEET_NAMES.attempts);
  var answerRecords = readSheetAsObjects_(spreadsheet, LEARNING_SUMMARY_SHEET_NAMES.answerRecords);

  var studentInfoMap = buildStudentInfoMap_();
  var testSetLabelMap = buildTestSetLabelMap_();

  var neededFieldIds = Array.from(
    new Set(
      attempts.map(function (a) { return a.fieldId; })
        .concat(answerRecords.map(function (r) { return r.fieldId; }))
        .filter(Boolean)
    )
  );
  var questionMasterMap = buildQuestionMasterMap_(neededFieldIds);

  var enrichedResult = buildEnrichedRecords_(attempts, answerRecords, questionMasterMap);
  var enrichedRecords = enrichedResult.records;

  var studentSubjectRows = enrichStudentSubjectRows_(buildStudentSubjectSummaryRows_(enrichedRecords), studentInfoMap);
  var studentUnitRows = enrichStudentUnitRows_(buildStudentUnitSummaryRows_(enrichedRecords), studentInfoMap);
  var questionRows = buildQuestionSummaryRows_(enrichedRecords); // 表示名解決不要（subjectLabel/unit/questionTextは既にenriched済み）
  var wrongQuestionRows = enrichWrongQuestionRows_(buildWrongQuestionSummaryRows_(enrichedRecords), studentInfoMap, testSetLabelMap);

  writeObjectsToSheet_(
    spreadsheet,
    LEARNING_SUMMARY_SHEET_NAMES.studentSummary,
    ["studentId", "生徒名", "学校", "学年", "科目", "回答数", "正解数", "不正解数", "正答率"],
    ["studentId", "studentDisplayName", "schoolName", "grade", "subjectLabel", "answered", "correct", "incorrect", "correctRate"],
    studentSubjectRows
  );

  writeObjectsToSheet_(
    spreadsheet,
    LEARNING_SUMMARY_SHEET_NAMES.studentUnitSummary,
    ["studentId", "生徒名", "科目", "単元", "回答数", "正解数", "不正解数", "正答率"],
    ["studentId", "studentDisplayName", "subjectLabel", "unit", "answered", "correct", "incorrect", "correctRate"],
    studentUnitRows
  );

  writeObjectsToSheet_(
    spreadsheet,
    LEARNING_SUMMARY_SHEET_NAMES.questionSummary,
    ["questionId", "科目", "単元", "問題文", "回答数", "正解数", "不正解数", "誤答率"],
    ["questionId", "subjectLabel", "unit", "questionText", "answered", "correct", "incorrect", "incorrectRate"],
    questionRows
  );

  writeObjectsToSheet_(
    spreadsheet,
    LEARNING_SUMMARY_SHEET_NAMES.wrongQuestionSummary,
    ["studentId", "生徒名", "科目", "単元", "questionId", "問題文", "総回答回数", "誤答回数", "正解回数", "誤答率", "最終回答結果", "最終回答日時", "TestSet名"],
    ["studentId", "studentDisplayName", "subjectLabel", "unit", "questionId", "questionText", "totalAnswered", "incorrectCount", "correctCount", "incorrectRate", "lastResult", "lastAnsweredAt", "lastTestSetLabel"],
    wrongQuestionRows
  );

  Logger.log(
    "生成完了: 生徒別成績=%s行, 生徒別単元成績=%s行, 問題別成績=%s行, 間違い問題サマリー=%s行" +
    "（生徒マスタ解決:%s件, TestSet名解決:%s件, 問題文未解決:%s件, 単元未解決(記録値も無し):%s件）",
    studentSubjectRows.length,
    studentUnitRows.length,
    questionRows.length,
    wrongQuestionRows.length,
    studentInfoMap.size,
    testSetLabelMap.size,
    enrichedResult.unresolvedQuestionIdCount,
    enrichedResult.missingUnitCount
  );
}
