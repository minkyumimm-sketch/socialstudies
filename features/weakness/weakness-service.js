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
 * 【Task18-2・非公開】studentIdに紐づく学習履歴（HistoryService.getStudentHistory）から、
 * questionId単位に解答統計（QuestionStats）を集約する。
 *
 * AnswerRecordはattemptId+questionIdの複合キーで保存されるため（features/repository/
 * answer-record-repository.js参照）、同一Attempt内での同一問題の再解答は自然に1件へ
 * 収束済みである。複数のAttemptにまたがって同じquestionIdが解答された場合のみ、
 * ここでanswered Count等が積み上がる（design doc10.1「累計出題◯回」はこの意味で扱う）。
 *
 * fieldId/unitはAnswerRecord自身が持つ値をそのまま使う（features/history/
 * answer-record-model.js参照。QuestionSetを別途取得する必要が無いため取得しない）。
 *
 * getStudentHistory()のみを利用し、Repository・Storage・各ドメインServiceへは
 * 一切直接アクセスしない。
 *
 * @param {string} studentId
 * @returns {QuestionStats[]} questionIdの出現順（Attempt取得順→AnswerRecord取得順）
 */
function buildQuestionStatsList(studentId) {
  const history = getStudentHistory(studentId);
  const statsByQuestion = new Map();

  history.forEach(({ answerRecords }) => {
    (Array.isArray(answerRecords) ? answerRecords : []).forEach((record) => {
      const questionId = record?.questionId;
      if (!questionId) return;

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

      const stats = statsByQuestion.get(questionId);
      stats.answeredCount += 1;

      if (record.isCorrect) {
        stats.correctCount += 1;
      } else {
        stats.incorrectCount += 1;
      }

      if (isNewerAnsweredAt(record.answeredAt ?? null, stats.lastAnsweredAt)) {
        stats.lastAnsweredAt = record.answeredAt ?? null;
        stats.lastIsCorrect = Boolean(record.isCorrect);
      }
    });
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
