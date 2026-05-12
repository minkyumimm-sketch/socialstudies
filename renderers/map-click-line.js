import { AREA_LABEL_MAP } from "./map-click-config.js";

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

  const isVisible = visibleSet.has(id);

node.style.display = isVisible ? "" : "none";

node.querySelectorAll("*").forEach((child) => {
  if (!(child instanceof Element)) return;
  child.style.display = isVisible ? "" : "none";
});
    });
  });
  const baseMap = svgRoot.querySelector("#world_base");

if (baseMap instanceof Element) {
  baseMap.style.display = "";

  baseMap.querySelectorAll("*").forEach((child) => {
    if (!(child instanceof Element)) return;
    child.style.display = "";
  });
}
}

export function clearLineVisualClasses(lineGroup) {
  lineGroup.classList.remove("is-selected", "is-correct", "is-wrong", "is-dim");
}

export function addVisualClassToLine(lineGroup, className) {
  lineGroup.classList.add(className);
}

export function getLineGroups(svgRoot, selectableAreaIds) {
  return selectableAreaIds
    .flatMap((id) => [...svgRoot.querySelectorAll(`#${CSS.escape(id)}`)])
    .filter((el) => el instanceof Element);
}

function getLineHitNodes(lineGroup) {
  const hitGroups = lineGroup.querySelectorAll(".map-hit, [id$='_hit']");
  const nodes = [];

  hitGroups.forEach((group) => {
    if (!(group instanceof Element)) return;

    const shapes = group.querySelectorAll(
      "path, polyline, polygon, line, rect, circle, ellipse"
    );

    if (shapes.length > 0) {
      shapes.forEach((shape) => {
        if (shape instanceof Element) nodes.push(shape);
      });
    } else {
      nodes.push(group);
    }
  });

  if (nodes.length > 0) return nodes;

  return [lineGroup];
}

function getLineVisualNodes(lineGroup) {
  const visualGroups = lineGroup.querySelectorAll(".map-visual, [id$='_visual']");
  const nodes = [];

  visualGroups.forEach((group) => {
    if (!(group instanceof Element)) return;

    const shapes = group.querySelectorAll(
      "path, polyline, polygon, line, rect, circle, ellipse"
    );

    if (shapes.length > 0) {
      shapes.forEach((shape) => {
        if (shape instanceof Element) nodes.push(shape);
      });
    } else {
      nodes.push(group);
    }
  });

  if (nodes.length > 0) return nodes;

  const shapeNodes = lineGroup.querySelectorAll(
    "path, polyline, polygon, line, rect, circle, ellipse"
  );

  if (shapeNodes.length > 0) {
    return [...shapeNodes].filter((el) => el instanceof Element);
  }

  return [lineGroup];
}

export function setupSvgForLineMap(svgRoot, mapConfig) {
  svgRoot.classList.add("map-click-line-svg");

  svgRoot.querySelectorAll("*").forEach((el) => {
    el.style.pointerEvents = "none";
  });

  hideNonTargetFeatures(svgRoot, mapConfig.selectableAreaIds || []);

  const lineGroups = getLineGroups(svgRoot, mapConfig.selectableAreaIds);

 lineGroups.forEach((group) => {
  const areaId = String(group.id || "").trim();
  const areaLabel = AREA_LABEL_MAP[areaId] || areaId;

  group.classList.add("map-line");
  group.dataset.areaId = areaId;
  group.dataset.areaLabel = areaLabel;
  group.style.display = "";

  const hitNodes = getLineHitNodes(group);
  const visualNodes = getLineVisualNodes(group);

hitNodes.forEach((node) => {
  if (!(node instanceof Element)) return;

  node.classList.add("map-hit", "line-hit");
  node.dataset.areaId = areaId;
  node.dataset.areaLabel = areaLabel;
  node.style.pointerEvents = "stroke";
  node.style.display = "";
});

visualNodes.forEach((node) => {
  if (!(node instanceof Element)) return;

  node.classList.add("line-shape", "map-visual", "line-visual");
  node.dataset.areaId = areaId;
  node.dataset.areaLabel = areaLabel;
  node.style.pointerEvents = "none";
  node.style.display = "";
});
});
}

export function bindLineEvents(container, state) {
  const svgRoot = container.querySelector("svg");
  if (!svgRoot) return;

  svgRoot.addEventListener("click", (event) => {
    if (state.ui.answered) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const lineGroup = target.closest(".map-line");
    if (!lineGroup) return;

    const selectedId = String(lineGroup.dataset.areaId || "").trim();
    const selectedLabel = String(lineGroup.dataset.areaLabel || "").trim();

    if (!selectedId) return;

    state.ui.selectedMapAreaId = selectedId;
    state.ui.selectedMapArea = selectedLabel;

    container.querySelectorAll(".map-line").forEach((item) => {
      clearLineVisualClasses(item);
    });

    container.querySelectorAll(`.map-line[data-area-id="${selectedId}"]`).forEach((item) => {
      addVisualClassToLine(item, "is-selected");
    });
  });
}

export function lockLineMapVisuals(container, selectedAreaId, correctAreaId, normalizeValue) {
  const lineGroups = container.querySelectorAll(".map-line");
  const normalizedSelected = normalizeValue(selectedAreaId);
  const normalizedCorrect = normalizeValue(correctAreaId);

  lineGroups.forEach((lineGroup) => {
    const areaId = String(lineGroup.dataset.areaId || "").trim();
    const normalizedAreaId = normalizeValue(areaId);

    clearLineVisualClasses(lineGroup);

    if (normalizedAreaId === normalizedCorrect) {
      addVisualClassToLine(lineGroup, "is-correct");
    } else if (
      normalizedAreaId === normalizedSelected &&
      normalizedSelected !== normalizedCorrect
    ) {
      addVisualClassToLine(lineGroup, "is-wrong");
    } else {
      addVisualClassToLine(lineGroup, "is-dim");
    }
  });
}