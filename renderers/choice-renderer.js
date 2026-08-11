export function renderChoiceQuestion(question, elements, onSelectChoice) {
  const {
    questionText,
    choicesContainer,
    answerInput,
    submitButton,
    answerResult,
    questionImage
  } = elements;

  questionText.textContent = question.question || "問題文";

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
    button.textContent = choice;

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

    const value = normalizeValue(button.textContent);

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