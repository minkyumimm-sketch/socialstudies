// config/test-set-gas-config.js
//
// TestSet専用GAS Web AppのURL定数（Task50-52で構築した、既存GAS_WEB_APP_URLとは
// 別プロジェクトのTestSet専用GAS）。Web App URLはブラウザから常に見える情報であり
// 秘密情報ではないため、既存GAS_WEB_APP_URL（services/gas-service.js）と同じ扱いで
// repositoryへ実値を保持する（Task53で確定）。
//
// 講師PIN（TEACHER_PIN）はこのファイル・repository内のどこにも保持しない。
// PINはGAS側のScript Propertiesにのみ存在し、講師がteacher-screenでその場入力した値を
// メモリ上のstateにのみ保持してAPIへ送信する（features/teacher/teacher-state.js参照）。
//
// 既存のservices/gas-service.jsのGAS_WEB_APP_URLは変更しない（別プロジェクトのため）。

export const TEST_SET_GAS_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbzZnhMfK-YLMu1eSLflY0gX7k4xC5O8Ed5EWrc_0I8NY4mue0dpAH9TUcZIkoRSzrow3Q/exec";
