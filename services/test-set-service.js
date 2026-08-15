// services/test-set-service.js
//
// TestSet専用GAS Web Appとの通信（Task53）。既存services/gas-service.jsの
// GAS_WEB_APP_URL/postToGasとは別プロジェクトのため、独立した実装として持つ
// （既存student-service.js/gas-service.jsは一切変更しない）。
//
// 通信方式は既存gas-service.jsのpostToGasと同じパターン（POST・
// Content-Type: text/plain;charset=utf-8でJSON文字列を送る）を踏襲する。
// CORSプリフライトを避けるためのGAS Web App特有の実践的な回避策であり、
// Task50で確定済みの方式（docs/specification/gas-api-contract-v1.md 9.4節）。
//
// Task53で使用するのはloadSchools/saveTestSetの2関数。Task54で生徒用TestSet選択UIに
// 必要なloadTestSets/loadTestSetを追加した（このファイルの当初コメントで予告していた
// 拡張のとおり）。archiveTestSetは講師用TestSet編集機能が必要になった時点で追加する。

import { TEST_SET_GAS_WEB_APP_URL } from "../config/test-set-gas-config.js";

/**
 * active状態の学校一覧を取得する。
 * @returns {Promise<Array<{schoolId:string, schoolName:string}>>}
 */
export async function loadSchools() {
  const response = await fetch(`${TEST_SET_GAS_WEB_APP_URL}?action=getSchools`);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error || "getSchools failed");
  }

  return Array.isArray(result.schools) ? result.schools : [];
}

/**
 * 指定した学校・学年・学年度に対応する、status=activeのTestSet一覧を取得する。
 * @param {{schoolId:string, gradeId:string, academicYearId:string}} params
 * @returns {Promise<Array<{testSetId:string, examRoundLabel:string, label:string, questionCount:number}>>}
 */
export async function loadTestSets({ schoolId, gradeId, academicYearId }) {
  const query = new URLSearchParams({
    action: "getTestSets",
    schoolId: schoolId || "",
    gradeId: gradeId || "",
    academicYearId: academicYearId || ""
  });

  const response = await fetch(`${TEST_SET_GAS_WEB_APP_URL}?${query.toString()}`);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error || "getTestSets failed");
  }

  return Array.isArray(result.testSets) ? result.testSets : [];
}

/**
 * 指定したTestSetの詳細（構成問題のfieldId/questionId一覧）を取得する。
 * 問題本文は含まれない（正本は既存GitHub Pages側の問題CSV）。
 * @param {string} testSetId
 * @returns {Promise<{testSet:Object, questions:Array<{fieldId:string, questionId:string}>}>}
 */
export async function loadTestSet(testSetId) {
  const query = new URLSearchParams({ action: "getTestSet", testSetId: testSetId || "" });

  const response = await fetch(`${TEST_SET_GAS_WEB_APP_URL}?${query.toString()}`);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error || "getTestSet failed");
  }

  return { testSet: result.testSet, questions: Array.isArray(result.questions) ? result.questions : [] };
}

/**
 * TestSetを新規作成または更新する。
 * @param {{pin:string, testSet:Object, questions:Array<{fieldId:string, questionId:string}>}} payload
 * @returns {Promise<{ok:boolean, testSetId?:string, error?:string}>}
 */
export async function saveTestSet(payload) {
  const response = await fetch(TEST_SET_GAS_WEB_APP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "saveTestSet",
      ...payload
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  return response.json();
}
