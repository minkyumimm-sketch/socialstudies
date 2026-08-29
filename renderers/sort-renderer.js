import { applyFuriganaText } from "../features/furigana/furigana-apply.js";
import { buildFuriganaFragment } from "../features/furigana/furigana-dom.js";
import { isFuriganaEnabled } from "../features/furigana/furigana-state.js";
import { convertToFuriganaSegments } from "../features/furigana/furigana-service.js";

export function renderSortQuestion(question, elements, state, onReorder) {
  const {
    questionText,
    choicesContainer,
    answerInput,
    submitButton,
    answerResult
  } = elements;

  applyFuriganaText(questionText, question.question || "問題文");

  choicesContainer.className = "choices sort-list";
  choicesContainer.innerHTML = "";

  answerInput.value = "";
  answerInput.style.display = "none";

  submitButton.style.display = "inline-block";
  submitButton.disabled = false;

  answerResult.classList.remove("correct", "incorrect");

  const sourceItems = getSortDisplayItems(question);

  if (!sourceItems.length) {
    answerResult.textContent = "sortItems列が未設定です。";
    answerResult.classList.remove("correct");
    answerResult.classList.add("incorrect");
    return;
  }

  const currentIsValid =
    Array.isArray(state.ui.currentSortOrder) &&
    state.ui.currentSortOrder.length === sourceItems.length &&
    state.ui.currentSortOrder.every((item) => sourceItems.includes(item));

  if (!currentIsValid) {
    state.ui.currentSortOrder = shuffleArray(sourceItems);
  }

  drawSortList(choicesContainer, state, onReorder);
}

export function drawSortList(container, state, onReorder) {
  container.innerHTML = "";

  state.ui.currentSortOrder.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "sort-item";

    const text = document.createElement("div");
    text.className = "sort-item-text";
    renderSortItemText(text, index, item);

    const controls = document.createElement("div");
    controls.className = "sort-controls";

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "secondary-button sort-move-button";
    upButton.textContent = "↑";
    upButton.disabled = index === 0 || state.ui.answered;
    upButton.addEventListener("click", () => {
      if (state.ui.answered || index === 0) return;
      onReorder(index, index - 1);
    });

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "secondary-button sort-move-button";
    downButton.textContent = "↓";
    downButton.disabled = index === state.ui.currentSortOrder.length - 1 || state.ui.answered;
    downButton.addEventListener("click", () => {
      if (state.ui.answered || index === state.ui.currentSortOrder.length - 1) return;
      onReorder(index, index + 1);
    });

    controls.appendChild(upButton);
    controls.appendChild(downButton);
    row.appendChild(text);
    row.appendChild(controls);
    container.appendChild(row);
  });
}

// 「1. 」の番号部分はCSV由来ではなく表示用に付与する接頭辞のため、ふりがな変換の
// 対象外とし、item側だけをfurigana-service.jsへ渡す。drawSortList()は並び替えの
// たびに要素を作り直す（container.innerHTML=""）ため、古い変換が後から解決しても
// 既に破棄された要素に書き込むだけで実害はない（世代トークンのガードは不要）。
async function renderSortItemText(element, index, item) {
  const prefix = `${index + 1}. `;

  if (!isFuriganaEnabled()) {
    element.replaceChildren(document.createTextNode(`${prefix}${item}`));
    return;
  }

  element.replaceChildren(document.createTextNode(`${prefix}${item}`));

  const segments = await convertToFuriganaSegments(item);
  if (!isFuriganaEnabled() || !segments) return;

  element.replaceChildren(document.createTextNode(prefix), buildFuriganaFragment(segments));
}

function getSortDisplayItems(question) {
  const sortItemsArray = normalizeItemArray(question.sortItemsArray);
  const answerArray = normalizeItemArray(question.sortAnswerArray);
  const sortGroup = String(question.sortGroup || "").trim();

  let items = sortItemsArray;

  if (!items.length) {
    items = answerArray;
  }

  items = items.filter((item) => item && item !== sortGroup);

  if (items.length === 1 && items[0] === sortGroup && answerArray.length) {
    items = answerArray;
  }

  return uniqueArray(items);
}

function normalizeItemArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function uniqueArray(array) {
  return [...new Set(array)];
}

function shuffleArray(array) {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}