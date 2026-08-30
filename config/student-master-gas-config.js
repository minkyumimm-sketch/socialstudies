// config/student-master-gas-config.js
//
// student-management-system（生徒情報の正本、別リポジトリ）が提供する
// 読み取り専用の生徒一覧JSON API（action=getActiveStudents）のURL定数。
// Web App URLはブラウザから常に見える情報であり秘密情報ではないため、
// 既存の3つのGAS URL（services/gas-service.js／config/test-set-gas-config.js／
// config/learning-record-gas-config.js）と同じ扱いでrepositoryへ実値を保持する。
//
// 【重要・デプロイ依存】このURLはstudent-management-system側で既に
// StudentScoreEntry/AttendanceWeb（page方式）用に本番稼働中のWeb Appと同一のものだが、
// action=getActiveStudents に応答する新コード（apps/student-master/PublicApi.gs・
// WebApp.gsのaction分岐）は、student-management-system側でこのURLへ「新しいバージョンを
// デプロイ」するまでは反映されない。デプロイ前にLS側をこのURLへ実際に切り替えると、
// 既存のpage方式フォールバック（HTML）がJSONの代わりに返り、生徒一覧取得が失敗する。
// そのため、student-management-system側の新バージョンデプロイが完了するまでは、
// LS側の本番切替（このファイルを参照する経路の実配線）を行わない／pushしないこと。
//
// 既存のservices/gas-service.jsのGAS_WEB_APP_URL（saveRecord等）、
// config/test-set-gas-config.jsのTEST_SET_GAS_WEB_APP_URL、
// config/learning-record-gas-config.jsのLEARNING_RECORD_GAS_WEB_APP_URLは変更しない
// （それぞれ別プロジェクトのため）。

export const STUDENT_MASTER_GAS_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbyfK0a5u4LoXvqEAVEYUt9_esE2m-MMt5kA4swhAf602xAZlqRkroL1uRq2ZHehpGrKLw/exec";
