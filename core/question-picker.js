export function shuffleArray(array) {
  const copied = [...array];

  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }

  return copied;
}

export function pickQuestions(allQuestions, requestedCount) {
  return shuffleArray([...allQuestions]).slice(0, Math.min(requestedCount, allQuestions.length));
}