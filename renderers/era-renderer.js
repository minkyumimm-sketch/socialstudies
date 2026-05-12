export function renderEraQuestion(question, elements, eraChoices, onSelectChoice) {
  const {
    questionText,
    choicesContainer,
    answerInput,
    submitButton,
    answerResult
  } = elements;

  questionText.textContent = question.question || "問題文";

  choicesContainer.className = "choices";
  choicesContainer.innerHTML = "";

  answerInput.value = "";
  answerInput.style.display = "none";

  submitButton.style.display = "none";
  submitButton.disabled = false;

  const choices = getEraChoices(question, eraChoices);

  if (!choices.length) {
    answerResult.textContent = "eraの選択肢設定がありません。";
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

function getEraChoices(question, eraChoices) {
  const answer = String(question.eraCorrect || question.answer || "").trim();
  const modern = Array.isArray(eraChoices?.modern) ? eraChoices.modern : [];
  const early = Array.isArray(eraChoices?.early) ? eraChoices.early : [];

  const modernSet = new Set(modern);
  return modernSet.has(answer) ? modern : early;
}