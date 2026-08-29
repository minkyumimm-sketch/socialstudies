// features/furigana/furigana-state.js
//
// ふりがなON/OFF状態の保持。Phase F-1時点ではlocalStorageへ保存せず、
// リロード後は常にOFFへ戻る（暫定仕様。将来Task5-8/5-9等での永続化検討はスコープ外）。
// 単一ページセッション中（次問題・retryをまたいでも）は維持される、モジュール
// スコープの単純な変数として持つ（既存core/state.jsへは混ぜない）。

let furiganaEnabled = false;

export function isFuriganaEnabled() {
  return furiganaEnabled;
}

export function setFuriganaEnabled(enabled) {
  furiganaEnabled = Boolean(enabled);
}
