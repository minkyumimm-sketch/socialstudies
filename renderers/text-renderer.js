import { applyFuriganaText } from "../features/furigana/furigana-apply.js";

export function renderTextQuestion(question, elements) {
  const {
    questionText,
    choicesContainer,
    answerInput,
    submitButton
  } = elements;

  applyFuriganaText(questionText, question.question || "問題文");

  choicesContainer.className = "choices";
  choicesContainer.innerHTML = "";

  answerInput.value = "";
  answerInput.style.display = "block";
  answerInput.setAttribute("autocomplete", "off");
  answerInput.setAttribute("autocapitalize", "off");
  answerInput.setAttribute("autocorrect", "off");
  answerInput.setAttribute("spellcheck", "false");

  submitButton.style.display = "inline-block";
  submitButton.disabled = false;

  answerInput.focus();
}