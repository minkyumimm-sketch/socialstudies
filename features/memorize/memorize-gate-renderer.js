// features/memorize/memorize-gate-renderer.js
//
// 暗記モード-1 STEP M1-2: 「想起ゲート」のDOM描画専用モジュール。
//
// 責務は以下のみ：
//   - 「思い出した」「わからない」の2ボタンを描画する
//   - 押下直後に両ボタンを同期的にdisabledにする（二重タップ・交差連打防止）
//   - 押下されたボタンに対応するcallback（onRecalled / onUnknown）を呼ぶ
//   - ゲートDOMの削除（clear）
//
// このファイルが「知らない」もの（意図的な責務分離）：
//   - GAS通信・本番API
//   - features/memorize/memorize-runner.js等のRound進行state
//   - AnswerRecord・question judge（正誤判定）
//   - History・AttemptProgress
//   - 「これがmemorizeのsourceTypeである」という判断そのもの
//     （呼び出し元がこの関数を呼ぶかどうかで判断する。ここでは判断しない）
//
// core/question-screen-controller.jsからは、renderers.renderMemorizeGateという
// 関数参照として注入される（既存のrenderChoiceQuestion等と同じ注入パターン）。
// coreがこのファイルを直接importすることはない（features → core の依存方向を守る）。

const GATE_CLASS = "memorize-gate";
const RECALLED_BUTTON_CLASS = "memorize-gate-recalled-button";
const UNKNOWN_BUTTON_CLASS = "memorize-gate-unknown-button";

/**
 * 想起ゲート（思い出した / わからない の2ボタン）を描画する。
 *
 * @param {Object} params
 * @param {HTMLElement} params.container - ゲートを描画する親要素（既存choicesContainerを想定）。
 *   呼び出し前の内容は破棄される（container.innerHTML = ""）。
 * @param {() => void} params.onRecalled - 「思い出した」押下時に一度だけ呼ばれるコールバック。
 * @param {() => void} params.onUnknown - 「わからない」押下時に一度だけ呼ばれるコールバック。
 * @returns {() => void} ゲートDOMを削除するクリーンアップ関数（冪等、複数回呼んでも安全）。
 */
export function renderMemorizeGate({ container, onRecalled, onUnknown }) {
  container.innerHTML = "";

  const gate = document.createElement("div");
  gate.className = GATE_CLASS;

  const recalledButton = document.createElement("button");
  recalledButton.type = "button";
  recalledButton.className = RECALLED_BUTTON_CLASS;
  recalledButton.textContent = "思い出した";

  const unknownButton = document.createElement("button");
  unknownButton.type = "button";
  unknownButton.className = UNKNOWN_BUTTON_CLASS;
  unknownButton.textContent = "わからない";

  // 二重タップ・交差連打防止: どちらかが押された時点でhandledをtrueにし、
  // 以後どちらのボタンのclickも一切処理しない（disabledの反映を待たず同期的に防止する）。
  let handled = false;

  function disableBoth() {
    recalledButton.disabled = true;
    unknownButton.disabled = true;
  }

  function clearGate() {
    if (gate.parentNode) {
      gate.parentNode.removeChild(gate);
    }
  }

  recalledButton.addEventListener("click", () => {
    if (handled) return;
    handled = true;
    disableBoth();
    clearGate();
    onRecalled();
  });

  unknownButton.addEventListener("click", () => {
    if (handled) return;
    handled = true;
    disableBoth();
    clearGate();
    onUnknown();
  });

  gate.appendChild(recalledButton);
  gate.appendChild(unknownButton);
  container.appendChild(gate);

  return clearGate;
}
