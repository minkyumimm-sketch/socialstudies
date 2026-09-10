// features/weakness/weakness-list-renderer.js
//
// Phase4D-1+2: 苦手問題一覧画面のDOM描画専用モジュール。view model
// （features/weakness/weakness-list-service.jsのgetWeaknessListViewModel()の結果）を
// 受け取って描画するだけで、GAS通信・苦手判定・Attempt開始は一切行わない
// （features/history/history-renderer.jsと同じ「取得済みデータ→DOM描画」の位置づけ）。
//
// 日付・科目名・正答率の表示基準はfeatures/history/history-renderer.jsのgetSubjectLabel()/
// formatPercent()をそのまま再利用する（表示ロジックを複数箇所に分岐させない）。
//
// Phase4D-3: 「まとめて解く」（科目groupごと）ボタンを追加した。判定・sort順は一切変えず、
// 既存のviewModel.items（WeaknessServiceのscore降順→questionId昇順、既に確定済み）を
// fieldIdで先頭出現順にgroup化して表示するだけ（groupの並び自体も新しいsort基準を
// 持ち込まない）。「この1問を解く」は詳細画面（weakness-detail-renderer.js）側の責務。

import { getSubjectLabel, formatPercent } from "../history/history-renderer.js";

/**
 * @typedef {Object} WeaknessScreenElements
 * @property {HTMLElement} emptyMessage
 * @property {HTMLElement} errorMessage
 * @property {HTMLElement} list
 */

/**
 * 1件のitemを1枚のcard（button要素）として生成する。
 * questionIdが現在の問題マスタに存在しない場合（missing）は、そのcardのみ
 * 「現在利用できない問題です。」を表示し非活性にする（一覧全体は継続表示、Phase4D事前監査STEP5）。
 *
 * @param {import("./weakness-list-model.js").WeaknessListItem} item
 * @param {(item: Object) => void} onOpenDetail
 * @returns {HTMLButtonElement}
 */
function renderWeaknessListItem(item, onOpenDetail) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "weakness-list-item";
  card.dataset.questionId = item.questionId;

  const subject = document.createElement("span");
  subject.className = "weakness-list-item-subject";
  subject.textContent = getSubjectLabel(item.fieldId);
  card.appendChild(subject);

  const text = document.createElement("span");
  text.className = "weakness-list-item-question";

  if (!item.available) {
    text.textContent = "現在利用できない問題です。";
    card.appendChild(text);
    card.classList.add("weakness-list-item-unavailable");
    card.disabled = true;
    return card;
  }

  // CSV由来の問題文はXSS対策のためtextContent経由のみで挿入する（innerHTML不使用）。
  text.textContent = item.question?.question || "";
  card.appendChild(text);

  const stat = document.createElement("span");
  stat.className = "weakness-list-item-stat";
  stat.textContent = `正答率${formatPercent(item.correctRate)}（${item.answeredCount}問中${item.correctCount}問正解）`;
  card.appendChild(stat);

  card.addEventListener("click", () => onOpenDetail(item));

  return card;
}

/**
 * itemsをfieldId単位でgroup化する。groupの並びは、各fieldIdが元のitems配列内で
 * 最初に出現した順（＝WeaknessServiceが確定した既存順序から導かれる、新しいsort基準は
 * 持ち込まない）。group内のitem順も元の並びをそのまま維持する。
 *
 * @param {Array<Object>} items
 * @returns {Map<string, Array<Object>>}
 */
function groupItemsByField(items) {
  const groups = new Map();
  items.forEach((item) => {
    const fieldId = item?.fieldId || "";
    if (!groups.has(fieldId)) {
      groups.set(fieldId, []);
    }
    groups.get(fieldId).push(item);
  });
  return groups;
}

/**
 * 1つの科目groupの見出し＋「まとめて解く」ボタンを生成する。
 * 件数は既にWeaknessService/一覧view modelが確定済みのgroup内item数をそのまま表示するだけで、
 * ここで苦手判定・件数の再計算は行わない。
 *
 * @param {string} fieldId
 * @param {Array<Object>} groupItems
 * @param {(fieldId: string) => (Promise<void>|void)} onPracticeField
 * @returns {HTMLDivElement}
 */
function renderWeaknessFieldGroupHeader(fieldId, groupItems, onPracticeField) {
  const header = document.createElement("div");
  header.className = "weakness-field-group-header";

  const label = document.createElement("span");
  label.className = "weakness-field-group-label";
  label.textContent = `${getSubjectLabel(fieldId)}（${groupItems.length}問）`;
  header.appendChild(label);

  const practiceButton = document.createElement("button");
  practiceButton.type = "button";
  practiceButton.className = "primary-button weakness-field-group-practice-button";
  practiceButton.textContent = "まとめて解く";
  practiceButton.addEventListener("click", () => {
    practiceButton.disabled = true;
    Promise.resolve(onPracticeField(fieldId)).finally(() => {
      practiceButton.disabled = false;
    });
  });
  header.appendChild(practiceButton);

  return header;
}

/**
 * 【入口】studentIdに紐づく苦手問題一覧をDOMへ描画する。
 *
 * @param {import("./weakness-list-model.js").WeaknessListViewModel} viewModel
 * @param {WeaknessScreenElements} elements
 * @param {(item: Object) => void} [onOpenDetail] - card押下時（詳細画面遷移）
 * @param {(fieldId: string) => (Promise<void>|void)} [onPracticeField] - 科目group「まとめて解く」押下時
 */
export function renderWeaknessListScreen(viewModel, elements, onOpenDetail, onPracticeField) {
  elements.list.innerHTML = "";
  elements.errorMessage.textContent = "";

  const items = Array.isArray(viewModel?.items) ? viewModel.items : [];

  if (items.length === 0) {
    elements.emptyMessage.classList.remove("hidden");
    return;
  }

  elements.emptyMessage.classList.add("hidden");

  const groups = groupItemsByField(items);

  groups.forEach((groupItems, fieldId) => {
    const group = document.createElement("div");
    group.className = "weakness-field-group";

    if (typeof onPracticeField === "function") {
      group.appendChild(renderWeaknessFieldGroupHeader(fieldId, groupItems, onPracticeField));
    }

    groupItems.forEach((item) => {
      group.appendChild(renderWeaknessListItem(item, onOpenDetail));
    });

    elements.list.appendChild(group);
  });
}

/**
 * @param {WeaknessScreenElements} elements
 * @param {string} message
 */
export function showWeaknessListError(elements, message) {
  elements.list.innerHTML = "";
  elements.emptyMessage.classList.add("hidden");
  elements.errorMessage.textContent = message || "";
}
