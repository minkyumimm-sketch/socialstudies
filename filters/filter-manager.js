import { SUBJECT_CONFIG } from "../config/subjects.js";
import { MODE_FILTER_OPTIONS } from "../config/modes.js";
import { loadQuestions } from "../core/question-loader.js";
import { buildUniqueLabelOptions, setSelectOptions } from "./filter-options.js";

export function createFilterManager(params) {
  const {
    state,
    subjectSelect,
    unitFilterSelect,
    modeFilterSelect,
    subunitFilterSelect,
    normalizeQuestion,
    normalizeValue
  } = params;

  async function getNormalizedQuestionsForSubject(subject) {
    const normalizedSubject = String(subject || subjectSelect.value || "").trim();

    if (!normalizedSubject || !SUBJECT_CONFIG[normalizedSubject]) {
      return [];
    }

    if (Array.isArray(state.session.questionCacheBySubject?.[normalizedSubject])) {
      return state.session.questionCacheBySubject[normalizedSubject];
    }

    const loaded = await loadQuestions(SUBJECT_CONFIG[normalizedSubject].csvPath);
    const normalized = loaded
      .map((q) => normalizeQuestion(q, normalizedSubject))
      .filter((q) => q.status !== "inactive");

    state.session.questionCacheBySubject[normalizedSubject] = normalized;
    return normalized;
  }

  function syncModeFilterOptions() {
    const subject = String(subjectSelect.value || "").trim();
    const options = MODE_FILTER_OPTIONS[subject] || [{ value: "all", label: "すべて" }];
    const currentValue = String(modeFilterSelect.value || "all").trim();

    modeFilterSelect.innerHTML = "";

    options.forEach((option) => {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      modeFilterSelect.appendChild(el);
    });

    const allowed = options.some((option) => option.value === currentValue);
    modeFilterSelect.value = allowed ? currentValue : "all";
  }

  async function syncUnitOptionsOnly() {
    const subject = String(subjectSelect.value || "").trim();
    const questions = await getNormalizedQuestionsForSubject(subject);

    const unitOptions = [
      { value: "all", label: "すべて" },
      ...buildUniqueLabelOptions(
        questions.map((q) => q.unit),
        normalizeValue
      )
    ];

    setSelectOptions(unitFilterSelect, unitOptions, normalizeValue, "all");
  }

  async function syncSubunitOptionsOnly() {
    const subject = String(subjectSelect.value || "").trim();
    const unitFilter = String(unitFilterSelect.value || "all").trim();
    const modeFilter = String(modeFilterSelect.value || "all").trim();

    const questions = await getNormalizedQuestionsForSubject(subject);

    const filteredQuestions = questions.filter((q) => {
      const unitMatch =
        unitFilter === "all" ||
        normalizeValue(q.unit) === normalizeValue(unitFilter);

      const modeMatch =
        modeFilter === "all" ||
        normalizeValue(q.mode) === normalizeValue(modeFilter);

      return unitMatch && modeMatch;
    });

    const subunitOptions = [
      { value: "all", label: "すべて" },
      ...buildUniqueLabelOptions(
        filteredQuestions.map((q) => q.subunit),
        normalizeValue
      )
    ];

    setSelectOptions(subunitFilterSelect, subunitOptions, normalizeValue, "all");
  }

  async function syncFiltersForSubjectChange() {
    await syncUnitOptionsOnly();
    syncModeFilterOptions();
    await syncSubunitOptionsOnly();
  }

  return {
    getNormalizedQuestionsForSubject,
    syncModeFilterOptions,
    syncUnitOptionsOnly,
    syncSubunitOptionsOnly,
    syncFiltersForSubjectChange
  };
}