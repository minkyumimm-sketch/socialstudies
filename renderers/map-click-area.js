const WORLD_PHYSICAL_FEATURE_IDS = [
  "nile",
  "amazon",
  "andes",
  "rockies",
  "alps",
  "himalaya",
  "pacific_ocean",
  "atlantic_ocean_west",
  "atlantic_ocean_east",
  "indian_ocean",
  "mediterranean_sea",
  "africa",
  "asia",
  "europe",
  "south_america",
  "north_america",
  "oceania",
  "australia",
  "middle_east"
];

function hideNonTargetFeatures(svgRoot, visibleIds) {
  const visibleSet = new Set(visibleIds.map((id) => String(id).trim()));

  WORLD_PHYSICAL_FEATURE_IDS.forEach((id) => {
    svgRoot.querySelectorAll(`#${CSS.escape(id)}`).forEach((node) => {
      if (!(node instanceof Element)) return;
      node.style.display = visibleSet.has(id) ? "" : "none";
    });
  });
}

export function setupSvgForAreaMap(svgRoot, mapConfig) {
  svgRoot.querySelectorAll("*").forEach((el) => {
    el.style.pointerEvents = "";
  });

  hideNonTargetFeatures(svgRoot, mapConfig.selectableAreaIds || []);

  mapConfig.selectableAreaIds.forEach((id) => {
    svgRoot.querySelectorAll(`#${CSS.escape(id)}`).forEach((areaNode) => {
      if (!(areaNode instanceof Element)) return;

      areaNode.classList.add("map-area");
      areaNode.dataset.areaId = id;
      areaNode.style.pointerEvents = "all";
      areaNode.style.display = "";
    });
  });
}

export function bindAreaEvents(container, state, mapConfig) {
  const svgRoot = container.querySelector("svg");
  if (!svgRoot) return;

  svgRoot.addEventListener("click", (event) => {
    if (state.ui.answered) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const areaNode = target.closest(".map-area");
    if (!areaNode) return;

    const selectedId = String(areaNode.dataset.areaId || "").trim();
    if (!selectedId) return;

    const selectionType = String(mapConfig?.selectionType || "single").trim();
    const selectedSet = new Set(
      Array.isArray(state.ui.selectedMapAreaIds) ? state.ui.selectedMapAreaIds : []
    );

    if (selectionType === "multiple") {
      if (selectedSet.has(selectedId)) {
        selectedSet.delete(selectedId);
      } else {
        selectedSet.add(selectedId);
      }
    } else {
      selectedSet.clear();
      selectedSet.add(selectedId);
    }

    const nextIds = [...selectedSet];
    state.ui.selectedMapAreaIds = nextIds;
    state.ui.selectedMapAreaId = nextIds[0] || "";
    state.ui.selectedMapArea = nextIds.join("|");

    container.querySelectorAll(".map-area").forEach((item) => {
      item.classList.remove("is-selected");
    });

    nextIds.forEach((id) => {
      container.querySelectorAll(`#${CSS.escape(id)}`).forEach((item) => {
        item.classList.add("is-selected");
      });
    });
  });
}

export function lockAreaMapVisuals(container, selectedAreaIds, correctAreaIds, normalizeValue) {
  const areaNodes = container.querySelectorAll(".map-area");

  const normalizedSelectedSet = new Set(
    (Array.isArray(selectedAreaIds) ? selectedAreaIds : [])
      .map((id) => normalizeValue(id))
      .filter(Boolean)
  );

  const normalizedCorrectSet = new Set(
    (Array.isArray(correctAreaIds) ? correctAreaIds : [])
      .map((id) => normalizeValue(id))
      .filter(Boolean)
  );

  areaNodes.forEach((areaNode) => {
    const areaId = String(areaNode.dataset.areaId || "").trim();
    const normalizedAreaId = normalizeValue(areaId);

    areaNode.classList.remove("is-selected", "is-correct", "is-wrong", "is-dim");

    const isSelected = normalizedSelectedSet.has(normalizedAreaId);
    const isCorrect = normalizedCorrectSet.has(normalizedAreaId);

    if (isCorrect) {
      areaNode.classList.add("is-correct");
      return;
    }

    if (isSelected) {
      areaNode.classList.add("is-wrong");
      return;
    }

    if (normalizedSelectedSet.size > 0 || normalizedCorrectSet.size > 0) {
      areaNode.classList.add("is-dim");
    }
  });
}