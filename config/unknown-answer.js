// config/unknown-answer.js
//
// Phase2「わからない」ボタンの内部保存値・表示ラベルの唯一の定義元。
// AnswerRecord.selectedChoiceへ保存する値（UNKNOWN_ANSWER_VALUE）と、画面・M-2等で
// 表示する文言（UNKNOWN_ANSWER_LABEL）を分離する。表示文言を将来変更しても、
// 既に保存済みの学習履歴データ（selectedChoice値）とは結合しないようにするため。
//
// 空文字は既存app.jsのhandleAnswer()が「未回答」として扱う既存ガードに抵触するため
// 採用しない。実在の選択肢テキストと衝突しないよう、通常の日本語回答としては
// 現れない専用センチネル文字列を採用する。
//
// AnswerRecordモデル（features/history/answer-record-model.js）・GAS契約は無変更。
// selectedChoiceは元々自由文字列を許容するフィールドのため、新しい列・スキーマ変更は不要。

export const UNKNOWN_ANSWER_VALUE = "__UNKNOWN__";
export const UNKNOWN_ANSWER_LABEL = "わからない";

/**
 * @param {string} selectedChoice - AnswerRecord.selectedChoice等の保存値
 * @returns {boolean}
 */
export function isUnknownAnswer(selectedChoice) {
  return selectedChoice === UNKNOWN_ANSWER_VALUE;
}

/**
 * 保存値（内部センチネル）をそのまま画面へ表示せず、表示用ラベルへ変換する。
 * センチネル以外の値はそのまま返す（既存の表示ロジックへの影響なし）。
 * @param {string} selectedChoice
 * @returns {string}
 */
export function formatSelectedChoiceForDisplay(selectedChoice) {
  return isUnknownAnswer(selectedChoice) ? UNKNOWN_ANSWER_LABEL : selectedChoice;
}
