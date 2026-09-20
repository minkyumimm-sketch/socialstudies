// features/weakness/weakness-service.js
//
// Phase2 Task18-2〜18-5: HistoryServiceが取得する学習履歴（AnswerRecord）から、
// 苦手問題・復習推奨（久しぶり）を判定して返すFacade Service。
// HistoryService・HomeServiceと同じ設計思想（Repository・Storageへは一切直接アクセスせず、
// 既存Serviceの公開APIのみを組み合わせる薄いFacade）を踏襲する。
//
// 使用するのは以下の2つのみ:
//   - features/history/history-service.js の getStudentHistory()
//     （唯一のデータ取得元。Repository・Storage・各ドメインServiceへは一切直接アクセスしない）
//   - features/weakness/weakness-rules.js の scoreQuestionWeakness() / isDormantQuestion()
//     （Task18-1で作成済み。苦手判定・復習推奨判定の実アルゴリズムはここに一切持ち込まず、
//     常にweakness-rules.jsへ委譲する。将来ルールを差し替える場合もweakness-rules.js側の
//     変更のみで完結させる）
//
// 【Task18-2】questionId単位の解答統計への集約（buildQuestionStatsList）は、HistoryServiceの
// getStudentHistory()・getStudiedFields()等にまだ存在しない新しい集約軸（questionId単位）の
// ための中間データ生成であり、HistoryServiceの内部ヘルパー（getRecencyKey等）と同様、
// 本Service内の非公開ヘルパーとしてのみ実装する（公開APIにしない、というご指示のとおり）。
// 公開APIはTask18-3（getWeakQuestions/getDormantQuestions）以降のみ。
//
// 保存（save）・生成（create）は一切行わない。取得・判定・集計のみ。

import { getStudentHistory } from "../history/history-service.js";
import { scoreQuestionWeakness, isDormantQuestion } from "./weakness-rules.js";

/**
 * @typedef {import("./weakness-rules.js").QuestionStats} QuestionStats
 */

/**
 * 【Task18-2・非公開】answeredAtの新旧を比較する。ISO 8601文字列同士は文字列比較で
 * 時系列順が保たれるため、Date変換は行わない（history-service.jsのcompareTimestamps()と
 * 同じ前提だが、history-service.js側の関数は非公開のためimportできず、本ファイル専用の
 * 最小限の比較のみを独自に持つ）。
 *
 * @param {string|null} candidate
 * @param {string|null} current
 * @returns {boolean} candidateがcurrentより新しければtrue
 */
function isNewerAnsweredAt(candidate, current) {
  if (!candidate) return false;
  if (!current) return true;
  return candidate > current;
}

/**
 * 暗記モード-1（M1-7）・非公開: 学習履歴のうちsourceType==="memorize"のAttempt群から、
 * 「同一runId×questionIdにおける最初の回答（reviewRoundが最小のAnswerRecord）」だけを
 * Weakness正誤統計の対象として選び出す。
 *
 * 設計方針（M1-6 Research Gate・M1-7確定ポリシー）：
 * - memorizeは1 Run内で同じ問題に複数回（Round単位）回答するため、全件をそのまま
 *   正誤統計へ入れると「1 Runで習得しただけ」でもincorrectCountが積み上がってしまう。
 * - 既存Weaknessは「学習を始めた時点でその問題を覚えていたか」を評価するものと位置づけ、
 *   memorizeの後続Round（＝その場で覚え直す過程）は正誤統計から除外する。
 * - ただし後続Roundの回答も含め、AnswerRecord自体は一切変更・削除しない
 *   （features/history/answer-record-service.js・answer-record-repository.jsは無変更）。
 * - 「最初」の判定は、生徒の全期間で最初ではなく、同一runId×questionIdごとに独立して行う
 *   （別runId＝別イベントとして扱う）。
 * - 判定にはreviewRound（memorize正式契約でRound番号として単調増加、1始まり）を正本とする。
 *   answeredAt（端末時計・保存順序に依存しうる）は使わない。
 * - runId/reviewRoundが安全に使えないmemorize Attempt（レガシー・不正データ）は、
 *   通常回答として扱うと過剰カウントが復活してしまうため、fail-closedでWeakness集計から
 *   完全に除外する（console.errorで診断可能にするが、例外は投げずWeakness画面自体は壊さない）。
 *
 * @param {Array<{attempt: import("../history/attempt-model.js").Attempt, answerRecords: Array<Object>}>} history
 * @returns {{
 *   weaknessEligibleRecords: Array<Object>,
 *   allTouchRecords: Array<Object>
 * }} weaknessEligibleRecords: 正誤統計（answeredCount/correctCount/incorrectCount/lastIsCorrect）の母集団。
 *    allTouchRecords: lastAnsweredAt（Dormant判定用）の母集団。fail-closedで除外されたAttempt由来の
 *    AnswerRecordはどちらにも含まれない（正誤統計にもDormant判定にも一切使わない）。
 */
function collectWeaknessAnswerRecords(history) {
  const weaknessEligibleRecords = [];
  const allTouchRecords = [];
  const memorizeInitialCandidateByGroup = new Map();

  history.forEach(({ attempt, answerRecords }) => {
    const records = Array.isArray(answerRecords) ? answerRecords : [];

    if (attempt?.sourceType !== "memorize") {
      // normal/weak_review/dormant_review/testset/testset_reviewは既存どおり全件を対象にする
      // （M1-7で変更しない）。
      records.forEach((record) => {
        if (!record?.questionId) return;
        weaknessEligibleRecords.push(record);
        allTouchRecords.push(record);
      });
      return;
    }

    const runId = typeof attempt.runId === "string" ? attempt.runId.trim() : "";
    const reviewRound = attempt.reviewRound;
    const hasValidRunIdentity = runId !== "" && Number.isInteger(reviewRound) && reviewRound >= 1;

    if (!hasValidRunIdentity) {
      console.error(
        "weakness-service: memorize Attemptのrun識別情報が不正なため、Weakness集計から除外します（fail-closed）:",
        { attemptId: attempt?.attemptId, runId: attempt?.runId, reviewRound: attempt?.reviewRound }
      );
      return;
    }

    records.forEach((record) => {
      if (!record?.questionId) return;
      allTouchRecords.push(record);

      const groupKey = `${runId}::${record.questionId}`;
      const existingCandidate = memorizeInitialCandidateByGroup.get(groupKey);
      if (!existingCandidate || reviewRound < existingCandidate.reviewRound) {
        memorizeInitialCandidateByGroup.set(groupKey, { record, reviewRound });
      }
    });
  });

  memorizeInitialCandidateByGroup.forEach(({ record }) => {
    weaknessEligibleRecords.push(record);
  });

  return { weaknessEligibleRecords, allTouchRecords };
}

/**
 * 【Task18-2・非公開】studentIdに紐づく学習履歴（HistoryService.getStudentHistory）から、
 * questionId単位に解答統計（QuestionStats）を集約する。
 *
 * AnswerRecordはattemptId+questionIdの複合キーで保存されるため（features/repository/
 * answer-record-repository.js参照）、同一Attempt内での同一問題の再解答は自然に1件へ
 * 収束済みである。複数のAttemptにまたがって同じquestionIdが解答された場合のみ、
 * ここでanswered Count等が積み上がる（design doc10.1「累計出題◯回」はこの意味で扱う）。
 *
 * 暗記モード-1（M1-7）: sourceType==="memorize"のAttemptだけは、answeredCount/correctCount/
 * incorrectCount/lastIsCorrectの母集団を「同一runId×questionIdの最初の回答のみ」に絞る
 * （collectWeaknessAnswerRecords()参照）。一方、lastAnsweredAt（Dormant判定が使う「最後に
 * 学習接触した日時」）は、memorizeの後続Roundも含めた実際の最終回答時刻を反映する
 * （正誤統計とlastAnsweredAtは、memorize後続Roundについては異なるAnswerRecordから
 * 導出されうる。これは今回のM1-7確定ポリシーであり、QuestionStatsの型自体は変更しない）。
 *
 * fieldId/unitはAnswerRecord自身が持つ値をそのまま使う（features/history/
 * answer-record-model.js参照。QuestionSetを別途取得する必要が無いため取得しない）。
 *
 * getStudentHistory()のみを利用し、Repository・Storage・各ドメインServiceへは
 * 一切直接アクセスしない。
 *
 * @param {string} studentId
 * @returns {QuestionStats[]}
 */
function buildQuestionStatsList(studentId) {
  const history = getStudentHistory(studentId);
  const { weaknessEligibleRecords, allTouchRecords } = collectWeaknessAnswerRecords(history);

  const statsByQuestion = new Map();

  function ensureStats(questionId, record) {
    if (!statsByQuestion.has(questionId)) {
      statsByQuestion.set(questionId, {
        questionId,
        fieldId: record.fieldId || "",
        unit: record.unit || "",
        answeredCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        lastAnsweredAt: null,
        lastIsCorrect: null
      });
    }
    return statsByQuestion.get(questionId);
  }

  // 正誤統計・lastIsCorrect: Weakness対象イベント（memorizeは初回のみ、他は全件）だけを母集団とする。
  const latestEligibleAnsweredAtByQuestion = new Map();
  weaknessEligibleRecords.forEach((record) => {
    const questionId = record.questionId;
    if (!questionId) return;

    const stats = ensureStats(questionId, record);
    stats.answeredCount += 1;

    if (record.isCorrect) {
      stats.correctCount += 1;
    } else {
      stats.incorrectCount += 1;
    }

    const currentLatestEligible = latestEligibleAnsweredAtByQuestion.get(questionId) ?? null;
    if (isNewerAnsweredAt(record.answeredAt ?? null, currentLatestEligible)) {
      latestEligibleAnsweredAtByQuestion.set(questionId, record.answeredAt ?? null);
      stats.lastIsCorrect = Boolean(record.isCorrect);
    }
  });

  // lastAnsweredAt（Dormant判定用）: fail-closedで除外された分を除く実回答全件を母集団とする。
  // 上のlastIsCorrectとは独立した「最新」判定であり、memorize後続Roundの回答時刻も反映する。
  allTouchRecords.forEach((record) => {
    const questionId = record.questionId;
    if (!questionId) return;

    const stats = ensureStats(questionId, record);
    if (isNewerAnsweredAt(record.answeredAt ?? null, stats.lastAnsweredAt)) {
      stats.lastAnsweredAt = record.answeredAt ?? null;
    }
  });

  return Array.from(statsByQuestion.values()).map((stats) => ({
    ...stats,
    correctRate: stats.answeredCount > 0 ? stats.correctCount / stats.answeredCount : 0
  }));
}

/**
 * 【Task18-3・基礎判定】studentIdに紐づく苦手問題一覧を取得する。
 * buildQuestionStatsList()（Task18-2・非公開）で集約した解答統計に、
 * weakness-rules.jsのscoreQuestionWeakness()（Task18-1）をそのまま適用するだけで、
 * 判定アルゴリズム自体はここに一切持ち込まない。
 *
 * score（該当条件数）降順、同スコアはquestionId昇順で並べる。score=0（非該当）は除外する。
 *
 * @param {string} studentId
 * @returns {Array<QuestionStats & { score: number, matchedConditions: string[] }>}
 */
export function getWeakQuestions(studentId) {
  return buildQuestionStatsList(studentId)
    .map((stats) => ({ ...stats, ...scoreQuestionWeakness(stats) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0;
    });
}

/**
 * 【Task18-3・基礎判定】studentIdに紐づく「復習推奨（久しぶり）」問題一覧を取得する。
 * 苦手問題（getWeakQuestions）とは別枠の判定（design doc確定方針）。
 * buildQuestionStatsList()（Task18-2・非公開）で集約した解答統計に、
 * weakness-rules.jsのisDormantQuestion()（Task18-1）をそのまま適用するだけ。
 *
 * 最終解答日時が古い順（＝最も長く未出題のもの）に並べる。
 *
 * @param {string} studentId
 * @param {{ dormantDays?: number, today?: Date }} [options] - weakness-rules.jsのisDormantQuestion()にそのまま渡す
 * @returns {QuestionStats[]}
 */
export function getDormantQuestions(studentId, options = {}) {
  return buildQuestionStatsList(studentId)
    .filter((stats) => isDormantQuestion(stats, options))
    .sort((a, b) => {
      const left = a.lastAnsweredAt ?? "";
      const right = b.lastAnsweredAt ?? "";
      return left < right ? -1 : left > right ? 1 : 0;
    });
}

/**
 * 【Task18-4・組み合わせ】studentIdに紐づく苦手問題一覧のうち、指定したfieldIdのものだけを
 * 取得する。getWeakQuestions()（Task18-3）のみを利用し、新たな探索・判定は行わない。
 *
 * @param {string} studentId
 * @param {string} fieldId
 * @returns {ReturnType<typeof getWeakQuestions>}
 */
export function getWeakQuestionsByField(studentId, fieldId) {
  return getWeakQuestions(studentId).filter((entry) => entry.fieldId === fieldId);
}

/**
 * 【Task18-4・組み合わせ】studentIdに紐づく苦手問題一覧（getWeakQuestions）を、
 * fieldId単位に集約する。ホーム画面で「苦手が多い科目」等を表示する用途を想定。
 * getWeakQuestions()（Task18-3）のみを利用し、新たな探索・判定は行わない。
 *
 * weakQuestionCount降順、同数はfieldId昇順で並べる。
 *
 * @param {string} studentId
 * @returns {Array<{ fieldId: string, weakQuestionCount: number, questions: ReturnType<typeof getWeakQuestions> }>}
 */
export function getWeakFields(studentId) {
  const weakQuestions = getWeakQuestions(studentId);
  const questionsByField = new Map();

  weakQuestions.forEach((entry) => {
    const fieldId = entry.fieldId || "";
    if (!questionsByField.has(fieldId)) {
      questionsByField.set(fieldId, []);
    }
    questionsByField.get(fieldId).push(entry);
  });

  return Array.from(questionsByField.entries())
    .map(([fieldId, questions]) => ({
      fieldId,
      weakQuestionCount: questions.length,
      questions
    }))
    .sort((a, b) => {
      if (b.weakQuestionCount !== a.weakQuestionCount) return b.weakQuestionCount - a.weakQuestionCount;
      return a.fieldId < b.fieldId ? -1 : a.fieldId > b.fieldId ? 1 : 0;
    });
}

/**
 * 【Task18-4・組み合わせ】studentIdに紐づく苦手問題・復習推奨のサマリー（件数）を取得する。
 * getWeakQuestions()・getDormantQuestions()（いずれもTask18-3）のみを利用し、
 * 新たな探索・判定は行わない。
 *
 * @param {string} studentId
 * @returns {{ studentId: string, weakQuestionCount: number, dormantQuestionCount: number }}
 */
export function getWeakSummary(studentId) {
  return {
    studentId,
    weakQuestionCount: getWeakQuestions(studentId).length,
    dormantQuestionCount: getDormantQuestions(studentId).length
  };
}

/**
 * 【Task18-5・統合窓口】studentIdに紐づく苦手問題関連情報を1回でまとめて取得する。
 * ホーム画面・履歴画面は、このAPIだけを取得すれば主要情報を取得できるようにするための窓口
 * （history-service.jsのgetHistoryDashboard()と同じ位置づけ）。
 *
 * getWeakSummary()・getWeakFields()・getDormantQuestions()（いずれもTask18-3/18-4）のみを
 * 利用し、新たな探索・判定は行わない。
 *
 * @param {string} studentId
 * @returns {{
 *   summary: ReturnType<typeof getWeakSummary>,
 *   weakFields: ReturnType<typeof getWeakFields>,
 *   dormantQuestions: ReturnType<typeof getDormantQuestions>
 * }}
 */
export function getWeakDashboard(studentId) {
  return {
    summary: getWeakSummary(studentId),
    weakFields: getWeakFields(studentId),
    dormantQuestions: getDormantQuestions(studentId)
  };
}

/**
 * 【Task18-5・軽量判定】studentIdに紐づく苦手問題が1件以上存在するかどうかを返す。
 * getWeakSummary()（Task18-4）のみを利用する軽量フラグ（HomeService等からの
 * バッジ表示・条件分岐向け）。
 *
 * @param {string} studentId
 * @returns {boolean}
 */
export function hasWeakQuestions(studentId) {
  return getWeakSummary(studentId).weakQuestionCount > 0;
}
