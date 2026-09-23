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

// 複数targetのhit corridorが同一地点で重なる場合(例: kiso/akaishi、shinano/tone)、
// クリック地点でhitしている.map-hit要素をすべて取得し、対応する.map-line祖先へ
// 正規化してdedupeする。候補が0/1件のときはここで確定し、後続のnearest計算は
// 呼び出し側で行わない(pointer-events:noneの要素はelementsFromPointの結果に
// 現れないため、40px hit corridor外は自然に0件となりfail-closedを維持する)。
function getCandidateLineGroups(clientX, clientY) {
  const hitElements = document.elementsFromPoint(clientX, clientY);
  const groups = [];

  hitElements.forEach((el) => {
    if (!(el instanceof Element) || !el.classList.contains("map-hit")) return;

    const lineGroup = el.closest(".map-line");
    if (lineGroup && !groups.includes(lineGroup)) groups.push(lineGroup);
  });

  return groups;
}

// 1つのvisual shape(path等)について、クリック地点(client座標=画面px空間)からの
// 最短距離の二乗を近似計算する。shape自身のgetScreenCTM()(=そのshapeのuser空間から
// 画面px空間への変換行列。responsive scaling・viewBox・nested transformをすべて
// 反映済み)でサンプリング点を画面px空間へ変換してから、同じ画面px空間にある
// クリック座標と比較する(クリック座標側は変換不要)。
// クリック座標とサンプリング点を異なる基準空間のまま比較しないよう、
// 常にこの「画面px空間」に統一している点が重要(getCTM()はnested要素では
// 期待通りの共通空間を返さないことを実機で確認済みのため使用しない)。
// geometry未対応・取得不能な場合はInfinityを返し、呼び出し側でそのcandidateを
// 除外できるようにする(fail-closed)。
function getShapeMinDistanceSq(shape, clientX, clientY) {
  if (typeof shape.getTotalLength !== "function" || typeof shape.getPointAtLength !== "function") {
    return Infinity;
  }

  let total;
  try {
    total = shape.getTotalLength();
  } catch {
    return Infinity;
  }
  if (!(total > 0)) return Infinity;

  const screenCtm = typeof shape.getScreenCTM === "function" ? shape.getScreenCTM() : null;
  if (!screenCtm) return Infinity;

  // サンプリング粒度: 20 shapeローカル単位おきを目安に4〜40点の範囲で分散させる
  // (Research prototypeと同一の粒度基準。粗すぎる誤判定・過剰samplingのどちらも避ける)。
  const steps = Math.min(40, Math.max(4, Math.round(total / 20)));
  let minDistSq = Infinity;

  for (let i = 0; i <= steps; i++) {
    const localPoint = shape.getPointAtLength((i / steps) * total);
    const transformed = new DOMPoint(localPoint.x, localPoint.y).matrixTransform(screenCtm);
    const dx = transformed.x - clientX;
    const dy = transformed.y - clientY;
    const distSq = dx * dx + dy * dy;

    if (distSq < minDistSq) minDistSq = distSq;
  }

  return minDistSq;
}

// lineGroup(.map-line、例: <g id="shinano">)配下の実visual geometry全体
// (370/251等の複数pathを含む)のうち、クリック地点に最も近いものとの距離の二乗を返す。
// 既存のgetLineVisualNodes()をそのまま再利用するため、setupSvgForLineMap()が
// 判定に使うのと同一のgeometry解決ロジックで一貫性を保つ。
function getLineGroupMinDistanceSq(lineGroup, clientX, clientY) {
  const visualNodes = getLineVisualNodes(lineGroup);
  let minDistSq = Infinity;

  visualNodes.forEach((shape) => {
    const distSq = getShapeMinDistanceSq(shape, clientX, clientY);
    if (distSq < minDistSq) minDistSq = distSq;
  });

  return minDistSq;
}

// 距離が同値(実質的なtie)の場合のdeterministic rule。DOM順序に暗黙依存しないよう、
// areaId(code-unit)昇順のものを優先する。通常データでtieはほぼ発生しない想定。
function candidateWinsTie(candidateId, currentBestId) {
  return candidateId < currentBestId;
}

// candidateが2件以上のときだけ呼ばれる。各candidateの実visual geometryとの
// 最短距離を比較し、最も近いlineGroupを返す。どのcandidateからも有効な
// geometry距離を得られなかった場合はnullを返し、誤ったtargetを推測しない(fail-closed)。
function resolveNearestLineGroup(candidates, clientX, clientY) {
  let best = null;
  let bestDistSq = Infinity;
  let bestAreaId = "";

  candidates.forEach((candidate) => {
    const distSq = getLineGroupMinDistanceSq(candidate, clientX, clientY);
    if (!Number.isFinite(distSq)) return;

    const candidateAreaId = String(candidate.dataset.areaId || "");

    if (
      distSq < bestDistSq ||
      (distSq === bestDistSq && candidateWinsTie(candidateAreaId, bestAreaId))
    ) {
      best = candidate;
      bestDistSq = distSq;
      bestAreaId = candidateAreaId;
    }
  });

  return best;
}

export function bindLineEvents(container, state) {
  const svgRoot = container.querySelector("svg");
  if (!svgRoot) return;

  svgRoot.addEventListener("click", (event) => {
    if (state.ui.answered) return;

    const candidateGroups = getCandidateLineGroups(event.clientX, event.clientY);

    let lineGroup;
    if (candidateGroups.length === 0) {
      // hit corridor外(fail-closed、既存挙動のまま)。
      return;
    } else if (candidateGroups.length === 1) {
      // 従来通り即採用。nearest計算は行わない。
      lineGroup = candidateGroups[0];
    } else {
      // 複数targetのhit corridorが重なる場合のみ、実visual geometryへの
      // 距離が最も近いtargetを選ぶ。
      lineGroup = resolveNearestLineGroup(candidateGroups, event.clientX, event.clientY);
      if (!lineGroup) return;
    }

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