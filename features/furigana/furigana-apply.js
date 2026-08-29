// features/furigana/furigana-apply.js
//
// renderer層から呼ばれる唯一の窓口。「ふりがな設定に応じて、指定した要素へ
// 安全にテキストを描画する」という1関数にまとめ、renderer側に形態素解析や
// DOM組み立てロジックを一切書かせない。
//
// OFF時: 従来通りプレーンテキスト描画（textContent代入と同じ見た目）。
// ON時: まずプレーンテキストを即時表示し、変換が完了し次第ふりがな付き表示へ
//       差し替える（辞書ロード中も問題文が消えない、失敗時は自動でプレーン
//       表示のまま、という要件を満たすための構造）。
//
// 同一要素に対して短時間で複数回呼ばれた場合（問題送りが速い等）、古い呼び出しの
// 変換が後から解決しても新しい表示を上書きしないよう、要素ごとに世代トークンを
// 持たせてガードする。

import { isFuriganaEnabled } from "./furigana-state.js";
import { convertToFuriganaSegments } from "./furigana-service.js";
import { renderPlainText, renderFuriganaSegments } from "./furigana-dom.js";

const renderTokens = new WeakMap();

/**
 * @param {HTMLElement} element
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function applyFuriganaText(element, text) {
  if (!element) return;

  const myToken = (renderTokens.get(element) || 0) + 1;
  renderTokens.set(element, myToken);

  if (!isFuriganaEnabled()) {
    renderPlainText(element, text);
    return;
  }

  // 変換完了まで問題文を消さない（プレースホルダではなく、まず通常表示を出す）。
  renderPlainText(element, text);

  const segments = await convertToFuriganaSegments(text);

  if (renderTokens.get(element) !== myToken) return; // 別の描画で上書き済み
  if (!isFuriganaEnabled()) return; // 変換待ち中にOFFへ切り替えられた
  if (!segments) return; // 変換失敗、プレーン表示のまま

  renderFuriganaSegments(element, segments);
}
