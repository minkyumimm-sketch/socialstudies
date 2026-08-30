// features/teacher/teacher-history-state.js
//
// 管理Phase M-2（講師用「生徒別の間違い問題確認」）専用の状態。
// teacher-state.js（TestSet作成・一覧・アーカイブ用）とは独立して持つ
// （生徒の学習フロー・M-1のTestSet選択状態のいずれにも混ぜない）。
//
// activeStudentsの取得には既存services/student-service.jsのloadActiveStudents(state)を
// そのまま再利用するが、この関数は渡されたstateオブジェクトの`session.activeStudents`へ
// 直接書き込む設計のため、core/state.js（生徒の学習フロー用の唯一のstate）は一切渡さず、
// この専用stateが持つ最小限のダミーshape（localSessionShell）を渡す。

/**
 * @returns {Object} 講師用「生徒別の間違い問題確認」セクション専用の初期state
 */
export function createTeacherHistoryState() {
  return {
    // loadActiveStudents(state)がstate.session.activeStudentsへ書き込むための最小限の入れ物。
    // core/state.jsの共有stateではない、このセクション専用のダミーオブジェクト。
    localSessionShell: { session: { activeStudents: [] } },

    selectedStudentId: "",
    selectedStudentDisplayName: "",

    wrongAnswers: [],
    historyFetched: false, // 一度でも取得に成功したか（0件表示と未取得を区別するため）
    loading: false,
    error: ""
  };
}
