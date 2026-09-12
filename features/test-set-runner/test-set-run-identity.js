// features/test-set-runner/test-set-run-identity.js
//
// Phase4E-0A: TestSet run identity（runId + reviewRound）の契約を検証する純粋関数群。
// DOM・GAS通信・test-set-runner.jsのrunnerState（モジュール内シングルトン）への依存を
// 一切持たない（plain dataのみを受け取り返す、test-set-review-model.jsと同じ設計方針）。
//
// 学習記録GAS側（docs/operations/learning-record-gas/RunIdentity.gs）の
// validateSaveAttemptProgressPayload_/handleStartAttemptが行う検証ルールと、
// この関数のルールは意図的に完全一致させている（GAS側は独立して再実装するが、
// 同じ正本仕様を指す。どちらかを変更する場合は両方を同時に見直すこと）。
//
// 【正式契約（Phase4E-0A監査で確定）】
// - runId: TestSet実行1回（通常group〜全review周〜任意反復）を一意に識別する。
//   sourceType="testset"/"testset_review"のときのみ必須、それ以外は指定禁止。
// - reviewRound: sourceType="testset"（通常group）は0固定、"testset_review"は1以上の整数。
//   それ以外のsourceTypeは指定禁止。

/**
 * @param {Object} params
 * @param {string} params.sourceType
 * @param {string|null|undefined} params.runId
 * @param {number|null|undefined} params.reviewRound
 * @returns {{ok:true}|{ok:false, errorMessage:string}}
 */
export function validateRunIdentity({ sourceType, runId, reviewRound }) {
  const trimmedRunId = String(runId ?? "").trim();
  const hasRunId = trimmedRunId.length > 0;
  const hasReviewRound = reviewRound !== null && reviewRound !== undefined && reviewRound !== "";

  if (sourceType === "testset") {
    if (!hasRunId) {
      return { ok: false, errorMessage: "sourceType=testsetの場合、runIdは必須です。" };
    }
    if (!hasReviewRound || Number(reviewRound) !== 0) {
      return { ok: false, errorMessage: "sourceType=testsetの場合、reviewRoundは0である必要があります。" };
    }
    return { ok: true };
  }

  if (sourceType === "testset_review") {
    if (!hasRunId) {
      return { ok: false, errorMessage: "sourceType=testset_reviewの場合、runIdは必須です。" };
    }
    if (!hasReviewRound || !Number.isInteger(Number(reviewRound)) || Number(reviewRound) < 1) {
      return { ok: false, errorMessage: "sourceType=testset_reviewの場合、reviewRoundは1以上の整数である必要があります。" };
    }
    return { ok: true };
  }

  // normal/weak_review/dormant_review（および空文字列＝起点不明の旧Attempt互換）は
  // runId/reviewRoundの指定自体を禁止する（既存sourceType/testSetIdルールと同じ設計方針）。
  if (hasRunId) {
    return { ok: false, errorMessage: `sourceType=${sourceType}ではrunIdを指定できません。` };
  }
  if (hasReviewRound) {
    return { ok: false, errorMessage: `sourceType=${sourceType}ではreviewRoundを指定できません。` };
  }
  return { ok: true };
}

/**
 * 指定した条件（studentId・testSetId・runId・sourceType・fieldId・reviewRound）に
 * 完全一致する完了済みAttemptを1件だけ選ぶ。
 *
 * test-set-review-model.jsのfindLatestCompletedAttemptForGroup()（completedAtの新しさで
 * 1件を選ぶ、tie時の挙動がJSエンジン依存という既知の制約を持つ既存関数、Phase4E監査で
 * 確認済み）とは異なり、この関数は「完全一致条件で0件または複数件ヒットした場合、
 * 推測で1件を選ばずfail-closedで失敗を返す」という設計にする（Phase4E-0A契約どおり）。
 * fieldIdの判定はAttempt自体にfieldId列が無いため、既存と同じくquestionSetIdの
 * 既定形式`<fieldId>__<coursePurposeId>__<slug>`から導出する。
 *
 * @param {import("../history/attempt-model.js").Attempt[]} attempts
 * @param {{studentId:string, testSetId:string, runId:string, sourceType:string, fieldId:string, reviewRound:number}} criteria
 * @returns {{ok:true, attempt:import("../history/attempt-model.js").Attempt}|{ok:false, reason:"not_found"|"duplicate"}}
 */
export function findAttemptForRunRound(attempts, { studentId, testSetId, runId, sourceType, fieldId, reviewRound }) {
  if (!studentId || !testSetId || !runId || !sourceType || !fieldId || reviewRound === null || reviewRound === undefined) {
    return { ok: false, reason: "not_found" };
  }

  const candidates = (Array.isArray(attempts) ? attempts : []).filter((attempt) => {
    const attemptFieldId = String(attempt?.questionSetId || "").split("__")[0];
    return (
      attempt?.studentId === studentId &&
      attempt?.testSetId === testSetId &&
      attempt?.runId === runId &&
      attempt?.sourceType === sourceType &&
      attemptFieldId === fieldId &&
      Number(attempt?.reviewRound) === Number(reviewRound) &&
      attempt?.completed === true
    );
  });

  if (candidates.length === 0) {
    return { ok: false, reason: "not_found" };
  }
  if (candidates.length > 1) {
    return { ok: false, reason: "duplicate" };
  }

  return { ok: true, attempt: candidates[0] };
}
