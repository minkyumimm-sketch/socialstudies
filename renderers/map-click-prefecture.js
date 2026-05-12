import { AREA_LABEL_MAP } from "./map-click-config.js";

export function getAreaIdFromClassList(classList) {
  return classList.find((cls) =>
    Object.prototype.hasOwnProperty.call(AREA_LABEL_MAP, cls)
  ) || "";
}

export function getPrefectureShapes(prefecture) {
  return prefecture.querySelectorAll("path, polygon, rect, circle, ellipse, polyline");
}

export function clearPrefectureVisualClasses(prefecture) {
  prefecture.classList.remove("is-selected", "is-correct", "is-wrong", "is-dim");

  getPrefectureShapes(prefecture).forEach((shape) => {
    shape.classList.remove("is-selected", "is-correct", "is-wrong", "is-dim");
  });
}

export function addVisualClassToPrefecture(prefecture, className) {
  prefecture.classList.add(className);

  getPrefectureShapes(prefecture).forEach((shape) => {
    shape.classList.add(className);
  });
}

export function setupSvgForPrefectureMap(svgRoot, mapConfig) {
  svgRoot.querySelectorAll("*").forEach((el) => {
    el.style.pointerEvents = "none";
  });

  const prefectures = svgRoot.querySelectorAll("g.prefecture");

  prefectures.forEach((prefecture) => {
    const classList = Array.from(prefecture.classList);
    const areaId = getAreaIdFromClassList(classList);

    if (!areaId) return;

    prefecture.dataset.areaId = areaId;
    prefecture.dataset.areaLabel = AREA_LABEL_MAP[areaId];
    prefecture.classList.add("map-prefecture");

    const isSelectable = mapConfig.selectableAreaIds.includes(areaId);

    if (!isSelectable) {
      prefecture.classList.add("map-disabled");
    }

    getPrefectureShapes(prefecture).forEach((shape) => {
      shape.dataset.areaId = areaId;
      shape.dataset.areaLabel = AREA_LABEL_MAP[areaId];
      shape.classList.add("map-shape");
      shape.style.pointerEvents = isSelectable ? "auto" : "none";
    });

    prefecture.querySelectorAll("text").forEach((text) => {
      text.style.pointerEvents = "none";
    });
  });
}

export function bindPrefectureEvents(container, state) {
  container.querySelectorAll(".map-shape").forEach((shape) => {
    shape.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.ui.answered) return;

      const target = event.currentTarget;
      if (!(target instanceof Element)) return;

      const selectedId = String(target.dataset.areaId || "").trim();
      const selectedLabel = String(target.dataset.areaLabel || "").trim();

      if (!selectedId) return;

      const prefecture = target.closest(".map-prefecture");
      if (!prefecture || prefecture.classList.contains("map-disabled")) return;

      state.ui.selectedMapAreaId = selectedId;
      state.ui.selectedMapArea = selectedLabel;

      container.querySelectorAll(".map-prefecture").forEach((item) => {
        clearPrefectureVisualClasses(item);
      });

      addVisualClassToPrefecture(prefecture, "is-selected");
    });
  });
}

export function lockPrefectureMapVisuals(container, selectedAreaId, correctAreaId, normalizeValue) {
  const prefectures = container.querySelectorAll(".map-prefecture");
  const normalizedSelected = normalizeValue(selectedAreaId);
  const normalizedCorrect = normalizeValue(correctAreaId);

  prefectures.forEach((prefecture) => {
    const areaId = String(prefecture.dataset.areaId || "").trim();
    const normalizedAreaId = normalizeValue(areaId);

    clearPrefectureVisualClasses(prefecture);

    if (normalizedAreaId === normalizedCorrect) {
      addVisualClassToPrefecture(prefecture, "is-correct");
    } else if (
      normalizedAreaId === normalizedSelected &&
      normalizedSelected !== normalizedCorrect
    ) {
      addVisualClassToPrefecture(prefecture, "is-wrong");
    } else {
      addVisualClassToPrefecture(prefecture, "is-dim");
    }
  });
}