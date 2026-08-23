// config/learning-record-gas-config.js
//
// Attempt/AnswerRecord専用GAS Web AppのURL定数（Phase5-2で構築した、既存
// GAS_WEB_APP_URL（services/gas-service.js）ともTestSet専用GAS
// （config/test-set-gas-config.js）とも別プロジェクトの学習記録専用GAS）。
// Web App URLはブラウザから常に見える情報であり秘密情報ではないため、
// 既存の2つのGAS URLと同じ扱いでrepositoryへ実値を保持する
// （Task53のTestSet GAS URL方針を踏襲、Phase5-3で確定）。
//
// 既存のservices/gas-service.jsのGAS_WEB_APP_URL、
// config/test-set-gas-config.jsのTEST_SET_GAS_WEB_APP_URLは変更しない
// （それぞれ別プロジェクトのため）。

export const LEARNING_RECORD_GAS_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbxoqwwur9PKvjhJA4H8eSOLY43Z6FxOAY8_vxxWh79UdX7053YmsInuJo5XUS7HwVL1/exec";
