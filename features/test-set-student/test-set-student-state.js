// features/test-set-student/test-set-student-state.js
//
// 生徒用「学校のテスト対策」選択UI（test-set-student-screen）専用の状態。
// 既存state.session/state.quiz/state.ui（core/state.js）へは混ぜず、独立したstateとして持つ
// （features/teacher/teacher-state.jsと同じ方針）。
//
// studentIdはここでは一切扱わない。schoolId/gradeIdはstudentIdから自動判定せず、
// 生徒がその都度自己選択する値である（studentIdとschoolId/gradeIdの分離、Task54確定方針）。

import { computeCurrentAcademicYearId } from "../teacher/teacher-state.js";

/**
 * @returns {Object} 生徒用TestSet選択UIの初期state
 */
export function createTestSetStudentState() {
  return {
    schools: [],
    selectedSchoolId: "",
    selectedSchoolName: "",
    selectedGradeId: "",
    academicYearId: computeCurrentAcademicYearId(),
    testSets: [],
    selectedTestSetId: "",
    selectedTestSet: null // getTestSetレスポンス形（gas-api-contract-v1.md 9.3節）: {testSetId,schoolId,gradeId,academicYearId,examRoundLabel,label,status,questions:[{fieldId,questionId}]}
  };
}
