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
//
// Phase4E-1: 全問正解まで自動反復（round2以降）に対応するため、resume対象がround2以降でも
// 安全に復元できるよう「周チェーン」の再構築へ拡張した。round1のreviewGroupsは通常group結果
// （results、周0の誤答）から、roundNのreviewGroupsは必ず「round(N-1)の全fieldの完了済み
// review結果」から導出する（round1→round2→…→resume対象roundの順に1本の鎖として辿る）。
// 「直近の」「最新の」completedAtでの推測は、周0→周1の遷移だけでなく周N→周N+1の遷移でも
// 一切行わない（loadValidatedReviewResult()参照）。

import { groupQuestionsByField } from "./test-set-runner.js";
import {
  buildTestSetReviewGroups,
  findReviewGroupIndex,
  resolveReviewGroupsForRound
} from "./test-set-review-model.js";
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
 * Phase4E-1: 指定したround・fieldIdの完了済みreview Attemptを1件だけ取得し、
 * resultsエントリ（{fieldId, correct, total, initialWrongQuestionIds}）として検証・整形する。
 * studentId/testSetId/runId/reviewRoundの完全一致1件のみを正とし（findAttemptForRunRound、
 * 0件・複数件はfail-closed）、initialWrongQuestionIdsの情報不明・score範囲外・
 * totalCount不一致・questionIds外の誤答混入のいずれかがあれば復元不能として{ok:false}を返す。
 * round1（通常group結果からのreviewGroups生成）・round2以降の周チェーン再構築の両方から
 * 共通で使う（重複実装をしない）。
 *
 * @returns {{ok:true, result:{fieldId:string, correct:number, total:number, initialWrongQuestionIds:string[]}}|{ok:false}}
 */
function loadValidatedReviewResult({ attempts, studentId, testSetId, runId, round, reviewGroup }) {
  const found = findAttemptForRunRound(attempts, {
    studentId,
    testSetId,
    runId,
    sourceType: "testset_review",
    fieldId: reviewGroup.fieldId,
    reviewRound: round
  });

  if (!found.ok) return { ok: false };
  const attempt = found.attempt;

  if (attempt.initialWrongQuestionIds === null || attempt.initialWrongQuestionIds === undefined) {
    return { ok: false };
  }
  if (attempt.score < 0 || attempt.score > attempt.totalCount) {
    return { ok: false };
  }
  if (attempt.totalCount !== reviewGroup.questionIds.length) {
    return { ok: false };
  }
  if (!isSubsetOf(attempt.initialWrongQuestionIds, reviewGroup.questionIds)) {
    return { ok: false };
  }

  return {
    ok: true,
    result: {
      fieldId: reviewGroup.fieldId,
      correct: attempt.score,
      total: attempt.totalCount,
      initialWrongQuestionIds: attempt.initialWrongQuestionIds
    }
  };
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

  // Phase4E-2: 初回誤答集合（通常group結果resultsから組み立てたもの）は、round1の対象で
  // あると同時に、「もう一度復習する」によるcycle境界roundの対象でもある正本。
  // 最終roundのreviewResultsからは絶対に組み立てない（Phase4E-2の正式UXどおり）。
  const initialReview = buildTestSetReviewGroups(results);
  if (!initialReview.available || initialReview.groups.length === 0) {
    return { ok: false, errorMessage: REJECT_MESSAGE };
  }

  // Phase4E-1: round1のreviewGroupsは通常group結果（results、周0の誤答）から、
  // round2以降のreviewGroupsは直前roundの「全field」の完了済みreview結果から、
  // 順に導出する（round2はround1結果から、round3はround2結果から…と完全に連鎖させる。
  // 「最新のcompletedAt」等での推測は一切行わない）。resume対象がround1なら
  // このループは1回のみ実行され、Phase4E-0A時点の挙動と完全に同じになる。
  //
  // Phase4E-2: 直前roundが全問正解（誤答0）だったroundは「もう一度復習する」による
  // cycle境界であり、その場合だけ初回誤答集合へ戻る（resolveReviewGroupsForRound）。
  // 周チェーン自体は途切れず、runId・reviewRoundの単調増加もそのまま維持される
  // （過去cycle・過去roundのAttemptはreviewRound完全一致条件により混入しない）。
  let chainResults = results; // 直前round（最初はround0=通常group）の結果
  let currentRoundGroups = null;

  for (let round = 1; round <= reviewRound; round += 1) {
    const reviewBuild = resolveReviewGroupsForRound(chainResults, initialReview.groups);
    if (!reviewBuild.available || reviewBuild.groups.length === 0) {
      return { ok: false, errorMessage: REJECT_MESSAGE };
    }
    currentRoundGroups = reviewBuild.groups;

    if (round === reviewRound) {
      // resume対象のround自身: progress.fieldIdの位置を特定し、questionIdsが
      // 完全一致（順序・件数・ID）することを確認する（TestSet定義変更検知、STEP33/34/81/82）。
      const currentReviewIndex = findReviewGroupIndex(currentRoundGroups, progress.fieldId);
      if (currentReviewIndex === -1) {
        return { ok: false, errorMessage: REJECT_MESSAGE };
      }
      if (!arraysEqualInOrder(currentRoundGroups[currentReviewIndex].questionIds, progress.questionIds)) {
        return { ok: false, errorMessage: REJECT_MESSAGE };
      }

      // currentReviewIndexより前のreviewGroup（このroundの中で先に完了済みのfield）を
      // 1件ずつ復元する（STEP36-40/83-90と同じ考え方）。1件でも不足・重複・不整合が
      // あれば復元不能。
      const reviewResults = [];
      for (let i = 0; i < currentReviewIndex; i += 1) {
        const loaded = loadValidatedReviewResult({
          attempts, studentId, testSetId, runId, round, reviewGroup: currentRoundGroups[i]
        });
        if (!loaded.ok) {
          return { ok: false, errorMessage: REJECT_MESSAGE };
        }
        reviewResults.push(loaded.result);
      }

      return {
        ok: true,
        runnerData: {
          testSetLabel: String(testSet?.label || ""),
          testSetId,
          groups,
          currentGroupIndex: groups.length - 1,
          results,
          reviewGroups: currentRoundGroups,
          currentReviewIndex,
          reviewResults,
          runId,
          currentReviewRound: reviewRound
        }
      };
    }

    // resume対象より前のround: 全fieldが完了済みのはずなので、全件を完全復元して
    // 次round（round+1）のreviewGroups生成の元データにする。1件でも不足・重複・
    // 不整合があれば、周チェーン自体が壊れているため復元不能（過去round混入防止）。
    const fullRoundResults = [];
    for (const reviewGroup of currentRoundGroups) {
      const loaded = loadValidatedReviewResult({
        attempts, studentId, testSetId, runId, round, reviewGroup
      });
      if (!loaded.ok) {
        return { ok: false, errorMessage: REJECT_MESSAGE };
      }
      fullRoundResults.push(loaded.result);
    }
    chainResults = fullRoundResults;
  }

  // reviewRound>=1が保証されているため、ループは必ず`round === reviewRound`のiterationで
  // returnする。ここへ到達することはないが、静的解析・将来の変更対策として明示しておく。
  return { ok: false, errorMessage: REJECT_MESSAGE };
}
