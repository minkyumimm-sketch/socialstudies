import { applyFuriganaText } from "../features/furigana/furigana-apply.js";

export function renderChoiceQuestion(question, elements, onSelectChoice) {
  const {
    questionText,
    choicesContainer,
    answerInput,
    submitButton,
    answerResult,
    questionImage
  } = elements;

  applyFuriganaText(questionText, question.question || "問題文");

  if (question.imagePath) {
    questionImage.src = question.imagePath;
    questionImage.alt = question.question || "";
    questionImage.classList.remove("hidden");
  } else {
    questionImage.classList.add("hidden");
    questionImage.src = "";
    questionImage.alt = "";
  }

  choicesContainer.className = "choices";
  choicesContainer.innerHTML = "";

  answerInput.value = "";
  answerInput.style.display = "none";

  submitButton.style.display = "none";
  submitButton.disabled = false;

  const choices = Array.isArray(question.choiceArray)
    ? shuffleArray([...question.choiceArray])
    : [];

  if (!choices.length) {
    answerResult.textContent = "choices列が未設定です。";
    answerResult.classList.remove("correct");
    answerResult.classList.add("incorrect");
    return;
  }

  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.dataset.choiceValue = choice;
    applyFuriganaText(button, choice);

    button.addEventListener("click", () => {
      onSelectChoice(choice);
    });

    choicesContainer.appendChild(button);
  });
}

export function lockChoiceButtons(container, selectedChoice, correctAnswer, normalizeValue) {
  const buttons = container.querySelectorAll(".choice-button");

  buttons.forEach((button) => {
    button.disabled = true;

    // ふりがな表示時、button.textContentは<rt>の読みまで連結されて判定に使えなくなるため、
    // ボタン生成時に保持した原文(dataset.choiceValue)を判定に使う（DOM表示と判定データの分離）。
    const value = normalizeValue(button.dataset.choiceValue ?? button.textContent);

    if (value === normalizeValue(correctAnswer)) {
      button.classList.add("correct");
    } else if (value === normalizeValue(selectedChoice)) {
      button.classList.add("incorrect");
    }
  });
}

function shuffleArray(array) {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}