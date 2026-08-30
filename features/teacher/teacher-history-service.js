// features/teacher/teacher-history-service.js
//
// 管理Phase M-2：講師用「生徒別の間違い問題確認」のデータ取得・集計のみを担当する
// （DOM操作は一切行わない）。
//
// 新しい記録基盤・新規GAS APIは追加せず、既存の学習記録復元経路をそのまま流用する：
//   - features/history/learning-record-restore-integration.js の
//     restoreStudentLearningRecords(studentId)（学習記録GAS getStudentHistory →
//     既存Attempt/AnswerRecord Repositoryへ復元、Phase5-4実装済み）
//   - features/history/attempt-service.js の loadAttemptsByStudent(studentId)
//   - features/history/answer-record-service.js の loadAnswerRecordsByAttempt(attemptId)
//
// answer_records の複合キー（attemptId::questionId）・retryのupsert仕様には一切触れない。
// isCorrectの判定も、既存features/history/answer-record-model.jsのcreateAnswerRecord()
// （features/common/field-helpers.jsのtoBooleanFlag）による正規化結果をそのまま使い、
// 独自の型変換は行わない。
//
// 「複数Attemptで同じquestionIdが間違っている場合」は、Record単位ですべて表示する
// （questionIdごとに最新1件へ集約するグループ化ロジックは作らない。TestSet実行分・
// 通常学習分などAttemptが異なれば別の解答イベントとして扱うのが実データの意味に忠実であり、
// 複雑な集計を避けるという方針にも合致するため）。

import { restoreStudentLearningRecords } from "../history/learning-record-restore-integration.js";
import { loadAttemptsByStudent } from "../history/attempt-service.js";
import { loadAnswerRecordsByAttempt } from "../history/answer-record-service.js";
import { loadQuestions } from "../../core/question-loader.js";
import { normalizeQuestion } from "../../core/question-normalizer.js";
import { SUBJECT_CONFIG } from "../../config/subjects.js";

// fieldId -> Map(questionId -> 正規化済みQuestion)。
// teacher-controller.js（TestSet作成用）のquestionCacheByFieldはstatus==="active"のみに
// 絞り込んでいるが、履歴確認では「回答当時は存在したが現在は非active（hidden/archived）に
// なった問題」も文言を表示できる必要があるため、statusで絞り込まない別キャッシュを持つ
// （既存core/question-loader.js・core/question-normalizer.jsの再利用のみで、
// 新しいCSV parserは実装しない）。
const questionCacheByField = new Map();

async function findQuestionByIdForField(fieldId, questionId) {
  if (!questionCacheByField.has(fieldId)) {
    const config = SUBJECT_CONFIG[fieldId];
    if (!config) {
      questionCacheByField.set(fieldId, new Map());
    } else {
      const rawRows = await loadQuestions(config.csvPath);
      const map = new Map();
      rawRows.forEach((row) => {
        const question = normalizeQuestion(row, fieldId);
        map.set(question.questionId, question);
      });
      questionCacheByField.set(fieldId, map);
    }
  }

  return questionCacheByField.get(fieldId).get(questionId) || null;
}

function compareByAnsweredAtDesc(a, b) {
  const aTime = a.answeredAt ? Date.parse(a.answeredAt) : NaN;
  const bTime = b.answeredAt ? Date.parse(b.answeredAt) : NaN;
  const aValid = Number.isFinite(aTime);
  const bValid = Number.isFinite(bTime);

  if (!aValid && !bValid) return 0;
  if (!aValid) return 1; // 日時不明・不正なRecordは末尾へ（クラッシュさせない）
  if (!bValid) return -1;
  return bTime - aTime;
}

/**
 * 指定した生徒について、現在answer_records上でisCorrect=falseとして残っている
 * AnswerRecordを、問題文・科目ラベル・TestSet起点情報を添えて一覧化する。
 *
 * @param {string} studentId
 * @returns {Promise<{ok:boolean, wrongAnswers:Array<Object>, hasAttempts?:boolean}>}
 *   ok:false は学習記録の取得自体に失敗したことを示す（呼び出し側はエラー表示・再試行UIへ）。
 *   ok:true かつ wrongAnswers:[] は「取得はできたが、現在間違いとして残っている問題は無い」。
 *   hasAttempts:false は「そもそも学習履歴（Attempt）自体が無い」ことを示し、
 *   呼び出し側が「間違いなし」と「まだ学習履歴がない」を区別する材料に使える。
 */
export async function getStudentWrongAnswers(studentId) {
  const restoreResult = await restoreStudentLearningRecords(studentId);

  if (!restoreResult.ok) {
    return { ok: false, wrongAnswers: [] };
  }

  const attempts = loadAttemptsByStudent(studentId);

  const wrongAnswers = [];
  attempts.forEach((attempt) => {
    const records = loadAnswerRecordsByAttempt(attempt.attemptId);
    records.forEach((record) => {
      if (record.isCorrect === false) {
        wrongAnswers.push({
          attemptId: record.attemptId,
          questionId: record.questionId,
          fieldId: record.fieldId,
          unit: record.unit,
          selectedChoice: record.selectedChoice,
          correctAnswer: record.correctAnswer,
          answeredAt: record.answeredAt,
          sourceType: attempt.sourceType,
          testSetId: attempt.testSetId
        });
      }
    });
  });

  wrongAnswers.sort(compareByAnsweredAtDesc);

  const resolved = await Promise.all(
    wrongAnswers.map(async (record) => {
      const question = await findQuestionByIdForField(record.fieldId, record.questionId);
      return {
        ...record,
        fieldLabel: SUBJECT_CONFIG[record.fieldId]?.label || record.fieldId,
        questionText: question ? question.question : null
      };
    })
  );

  return { ok: true, wrongAnswers: resolved, hasAttempts: attempts.length > 0 };
}
