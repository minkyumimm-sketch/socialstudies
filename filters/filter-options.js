export function buildUniqueLabelOptions(values, normalizeValue) {
  const seen = new Map();

  values.forEach((rawValue) => {
    const value = String(rawValue || "").trim();
    if (!value) return;

    const key = normalizeValue(value);
    if (!key) return;

    if (!seen.has(key)) {
      seen.set(key, value);
    }
  });

  return Array.from(seen.values()).map((value) => ({
    value,
    label: value
  }));
}

export function setSelectOptions(selectElement, options, normalizeValue, fallbackValue = "all") {
  const currentValue = String(selectElement?.value || fallbackValue).trim();

  if (!selectElement) return;

  selectElement.innerHTML = "";

  options.forEach((option) => {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    selectElement.appendChild(el);
  });

  const allowed = options.some(
    (option) => normalizeValue(option.value) === normalizeValue(currentValue)
  );

  selectElement.value = allowed ? currentValue : fallbackValue;
}