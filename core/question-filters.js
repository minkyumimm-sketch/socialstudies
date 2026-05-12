export function filterQuestions(questions, filters, normalizeValue) {
  const {
    unitFilter = "all",
    modeFilter = "all",
    subunitFilter = "all"
  } = filters || {};

  return [...questions].filter((question) => {
    const unitMatch =
      unitFilter === "all" ||
      normalizeValue(question.unit) === normalizeValue(unitFilter);

    const modeMatch =
      modeFilter === "all" ||
      normalizeValue(question.mode) === normalizeValue(modeFilter);

    const subunitMatch =
      subunitFilter === "all" ||
      normalizeValue(question.subunit) === normalizeValue(subunitFilter);

    return unitMatch && modeMatch && subunitMatch;
  });
}