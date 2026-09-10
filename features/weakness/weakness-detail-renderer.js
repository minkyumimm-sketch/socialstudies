// features/weakness/weakness-detail-renderer.js
//
// Phase4D-1+2: 苦手問題「詳細」画面のDOM描画専用モジュール。view model
// （features/weakness/weakness-detail-model.jsのbuildWeaknessDetailViewModel()の結果）を
// 受け取って描画するだけで、GAS通信・苦手判定・Attempt開始は一切行わない。
//
// 問題文・解説はfeatures/furigana/furigana-apply.jsのapplyFuriganaText()を再利用し、
// 安全なDOM生成（innerHTML不使用、createTextNode経由）とふりがな設定の両方を
// 既存の仕組みのままquiz画面・履歴詳細画面と同じように適用する（新しいふりがな処理を作らない）。
//
// Phase4D-3: 「この1問を解く」ボタンを追加した。viewModel.availableがfalse
// （missing、または既存のavailable/status契約上browsable-but-not-startableな場合を含む）の
// 間は一切描画しない（既存の「現在利用できない問題です。」表示と同じ条件を再利用するだけで、
// 新しい判定基準は持ち込まない）。押下時の実際のAttempt開始処理（sourceType固定・
// resume競合guard等）はapp.js側の責務で、ここではコールバック呼び出しのみを行う。
// 仮のAttemptを作ってfeatures/history/history-detail-renderer.jsのフローへ押し込むことは
// しない（Phase4D事前監査の結論どおり、Weakness専用のview model・renderer構成を維持する）。

import { getSubjectLabel, formatPercent } from "../history/history-renderer.js";
import { applyFuriganaText } from "../furigana/furigana-apply.js";

/**
 * @typedef {Object} WeaknessDetailScreenElements
 * @property {HTMLElement} error
 * @property {HTMLElement} subjectLabel
 * @property {HTMLElement} stat
 * @property {HTMLElement} body
 */

/**
 * @param {import("./weakness-detail-model.js").WeaknessDetailViewModel} viewModel
 * @param {WeaknessDetailScreenElements} elements
 * @param {() => (Promise<void>|void)} [onStartSingleQuestion] - 「この1問を解く」押下時
 */
export function renderWeaknessDetailScreen(viewModel, elements, onStartSingleQuestion) {
  elements.error.textContent = "";
  elements.subjectLabel.textContent = getSubjectLabel(viewModel.fieldId);
  elements.stat.textContent = `正答率${formatPercent(viewModel.correctRate)}（${viewModel.answeredCount}問中${viewModel.correctCount}問正解）`;

  elements.body.innerHTML = "";

  if (!viewModel.available) {
    const unavailable = document.createElement("p");
    unavailable.className = "weakness-detail-unavailable";
    unavailable.textContent = "現在利用できない問題です。";
    elements.body.appendChild(unavailable);
    return;
  }

  const questionText = document.createElement("p");
  questionText.className = "weakness-detail-question";
  applyFuriganaText(questionText, viewModel.questionText || "");
  elements.body.appendChild(questionText);

  if (viewModel.imagePath) {
    const image = document.createElement("img");
    image.className = "weakness-detail-image";
    image.src = viewModel.imagePath;
    image.alt = "";
    elements.body.appendChild(image);
  }

  const correctAnswerLine = document.createElement("p");
  correctAnswerLine.className = "weakness-detail-correct-answer";
  correctAnswerLine.textContent = `正解：${viewModel.correctAnswer ?? "（未記録）"}`;
  elements.body.appendChild(correctAnswerLine);

  if (viewModel.explanation) {
    const explanationLine = document.createElement("p");
    explanationLine.className = "weakness-detail-explanation";
    const label = document.createElement("span");
    label.textContent = "解説：";
    explanationLine.appendChild(label);
    const body = document.createElement("span");
    applyFuriganaText(body, viewModel.explanation);
    explanationLine.appendChild(body);
    elements.body.appendChild(explanationLine);
  }

  if (typeof onStartSingleQuestion === "function") {
    const startButton = document.createElement("button");
    startButton.type = "button";
    startButton.className = "primary-button weakness-detail-start-button";
    startButton.textContent = "この1問を解く";
    startButton.addEventListener("click", () => {
      startButton.disabled = true;
      Promise.resolve(onStartSingleQuestion()).finally(() => {
        startButton.disabled = false;
      });
    });
    elements.body.appendChild(startButton);
  }
}

/**
 * @param {WeaknessDetailScreenElements} elements
 * @param {string} message
 */
export function showWeaknessDetailError(elements, message) {
  elements.body.innerHTML = "";
  elements.error.textContent = message || "";
}
