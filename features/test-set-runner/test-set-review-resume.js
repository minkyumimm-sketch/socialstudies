// features/test-set-runner/test-set-review-resume.js
//
// Phase3D-4B-3: ブラウザリロード等で失われたrunnerStateを、testset_review progressから
// 安全に再構築するためのpure関数群。DOM・GAS通信・test-set-runner.jsのrunnerState
// （モジュール内シングルトン）への依存を一切持たない（plain dataのみを受け取り返す）。
//
// 通常TestSet resume（features/test-set-runner/test-set-runner.js の restoreRunnerState）は
// 本番稼働中の既存機能であり、このファイルはそれを壊さずに再利用する
// （groupQuestionsByFieldを共有、大規模リファクタしない）。
//
// Phase4E-0A: 旧実装は runId が存在しないため、過去に同一TestSetをreview済みのcompleted
// Attemptが混入するリスクを「今回runの通常group最終完了時刻から現在resume対象のreview
// Attempt開始時刻まで」の時間窓で実用上抑制するのみだった（数学的完全保証ではない、
// Phase3D-4B設計監査で確認済みの既存制約）。Phase4E-0Aのrun identity監査で、この
// completedAt/time-window方式では同一run内の複数review周を安全に判別できないと判明したため、
// studentId/testSetId/runId/sourceType/fieldId/reviewRoundの完全一致（findAttemptForRunRound、
// test-set-run-identity.js）へ置き換えた。0件・複数件はいずれもfail-closedで復元不能とし、
// completedAtでの推測選択・時間窓での絞り込みは一切行わない。

import { groupQuestionsByField } from "./test-set-runner.js";
import { buildTestSetReviewGroups, findReviewGroupIndex } from "./test-set-review-model.js";
import { findAttemptForRunRound } from "./test-set-run-identity.js";

const REJECT_MESSAGE = "前回の間違い直しの続きを再開できませんでした。テスト対策画面からもう一度お試しください。";

function isSubsetOf(ids, allowedIds) {
  const allowedSet = new Set(allowedIds);
  return (Array.isArray(ids) ? ids : []).every((id) => allowedSet.has(id));
}

function arraysEqualInOrder(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

/**
 * testset_review progressから、review再開に必要なrunnerState復元用plain dataを組み立てる。
 * 検証途中で1件でも不整合が見つかった場合、推測補完・部分復元は一切行わず即座に
 * {ok:false}を返す（Phase3D-4B設計監査「old data final contract」「error final contract」の結論、
 * Phase4E-0A正式契約「重複keyはfail-closed」を踏襲）。
 *
 * @param {Object} params
 * @param {{testSetId:string, label:string}} params.testSet - loadTestSet()のtestSet部分
 * @param {Array<{fieldId:string, questionId:string}>} params.questions - loadTestSet()のquestions部分
 * @param {Object} params.progress - getAttemptProgress()が返すprogress（sourceType==="testset_review"、
 *   Phase4E-0Aで追加された`runId`/`reviewRound`を含む想定。旧データ（runId空・reviewRound欠落）は
 *   下記STEP22のvalidationでREJECTされ、新複数周resumeの対象にはならない）
 * @param {Array<import("../history/attempt-model.js").Attempt>} params.priorAttempts - 同一studentIdの既存Attempt一覧
 *   （resume対象のcurrent review Attempt自身も含む、loadAttemptsByStudentの既存契約どおり）
 * @returns {{ok:true, runnerData:Object}|{ok:false, errorMessage:string}}
 */
export function prepareTestSetReviewResumePlan({ testSet, questions, progress, priorAttempts }) {
  const testSetId = String(testSet?.testSetId || "");
  const attempts = Array.isArray(priorAttempts) ? priorAttempts : [];
  const studentId = String(progress?.studentId || "");
  const runId = String(progress?.runId || "");
  const reviewRound = Number(progress?.reviewRound);

  // STEP22: progress基本validation（Phase4E-0A: runId/reviewRoundも必須化。
  // 旧データ・本番GAS未反映時はrunIdが空のためここで必ずREJECTされ、旧完了済みAttemptを
  // 使った推測復元へは一切フォールバックしない）。
  if (
    progress?.sourceType !== "testset_review" ||
    !testSetId ||
    !studentId ||
    !runId ||
    !Number.isInteger(reviewRound) ||
    reviewRound < 1 ||
    !progress?.fieldId ||
    !Array.isArray(progress?.questionIds) ||
    progress.questionIds.length === 0
  ) {
    return { ok: false, errorMessage: REJECT_MESSAGE };
  }

  // STEP241/242: resume対象の現在review Attempt自体の整合性を確認する
  // （Phase4E-0A: runId/reviewRoundもprogressと完全一致することを追加で要求する）。
  const currentAttempt = attempts.find((attempt) => attempt?.attemptId === progress.attemptId);
  const currentAttemptFieldId = String(currentAttempt?.questionSetId || "").split("__")[0];
  if (
    !currentAttempt ||
    currentAttempt.sourceType !== "testset_review" ||
    currentAttempt.testSetId !== testSetId ||
    currentAttempt.runId !== runId ||
    Number(currentAttempt.reviewRound) !== reviewRound ||
    currentAttemptFieldId !== progress.fieldId ||
    currentAttempt.completed === true
  ) {
    return { ok: false, errorMessage: REJECT_MESSAGE };
  }

  // STEP25: 通常TestSet groupsの再構築は既存groupQuestionsByFieldをそのまま使う（別group化禁止）。
  const groups = groupQuestionsByField(Array.isArray(questions) ? questions : []);

  // STEP30/224-228: 通常group全件について、完了済みAttemptから結果を復元する。
  // studentId/testSetId/runId/fieldId/reviewRound=0の完全一致1件のみを正とする
  // （0件・複数件はいずれもfail-closed）。
  const results = [];

  for (const group of groups) {
    const found = findAttemptForRunRound(attempts, {
      studentId,
      testSetId,
      runId,
      sourceType: "testset",
      fieldId: group.fieldId,
      reviewRound: 0
    });

    if (!found.ok) {
      return { ok: false, errorMessage: REJECT_MESSAGE };
    }
    const latest = found.attempt;

    if (latest.initialWrongQuestionIds === null || latest.initialWrongQuestionIds === undefined) {
      return { ok: false, errorMessage: REJECT_MESSAGE };
    }
    if (!isSubsetOf(latest.initialWrongQuestionIds, group.questionIds)) {
      return { ok: false, errorMessage: REJECT_MESSAGE };
    }

    results.push({
      fieldId: group.fieldId,
      correct: latest.score,
      total: latest.totalCount,
      initialWrongQuestionIds: latest.initialWrongQuestionIds
    });
  }

  // STEP32: reviewGroupsを再生成する（3D-4B-1のbuildTestSetReviewGroupsをそのまま利用）。
  const reviewBuild = buildTestSetReviewGroups(results);
  if (!reviewBuild.available || reviewBuild.groups.length === 0) {
    return { ok: false, errorMessage: REJECT_MESSAGE };
  }

  // STEP33/34/81/82: progress.fieldIdに一致するreviewGroupを特定し、
  // questionIdsが完全一致（順序・件数・ID）することを確認する（TestSet定義変更検知）。
  const currentReviewIndex = findReviewGroupIndex(reviewBuild.groups, progress.fieldId);
  if (currentReviewIndex === -1) {
    return { ok: false, errorMessage: REJECT_MESSAGE };
  }
  if (!arraysEqualInOrder(reviewBuild.groups[currentReviewIndex].questionIds, progress.questionIds)) {
    return { ok: false, errorMessage: REJECT_MESSAGE };
  }

  // STEP36-40/83-90: currentReviewIndexより前のreviewGroup全件について、
  // 完了済みreview Attemptを1件ずつ復元する（同一runId・同一reviewRound内の他fieldの結果）。
  // 1件でも不足・重複・不整合があれば復元不能。
  const reviewResults = [];

  for (let i = 0; i < currentReviewIndex; i += 1) {
    const reviewGroup = reviewBuild.groups[i];

    const foundReview = findAttemptForRunRound(attempts, {
      studentId,
      testSetId,
      runId,
      sourceType: "testset_review",
      fieldId: reviewGroup.fieldId,
      reviewRound
    });

    if (!foundReview.ok) {
      return { ok: false, errorMessage: REJECT_MESSAGE };
    }
    const latestReview = foundReview.attempt;

    if (latestReview.initialWrongQuestionIds === null || latestReview.initialWrongQuestionIds === undefined) {
      return { ok: false, errorMessage: REJECT_MESSAGE };
    }
    if (latestReview.score < 0 || latestReview.score > latestReview.totalCount) {
      return { ok: false, errorMessage: REJECT_MESSAGE };
    }
    if (latestReview.totalCount !== reviewGroup.questionIds.length) {
      return { ok: false, errorMessage: REJECT_MESSAGE };
    }
    if (!isSubsetOf(latestReview.initialWrongQuestionIds, reviewGroup.questionIds)) {
      return { ok: false, errorMessage: REJECT_MESSAGE };
    }

    reviewResults.push({
      fieldId: reviewGroup.fieldId,
      correct: latestReview.score,
      total: latestReview.totalCount,
      initialWrongQuestionIds: latestReview.initialWrongQuestionIds
    });
  }

  return {
    ok: true,
    runnerData: {
      testSetLabel: String(testSet?.label || ""),
      testSetId,
      groups,
      currentGroupIndex: groups.length - 1,
      results,
      reviewGroups: reviewBuild.groups,
      currentReviewIndex,
      reviewResults,
      runId,
      currentReviewRound: reviewRound
    }
  };
}
