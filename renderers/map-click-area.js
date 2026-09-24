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

// クリック地点(client座標)を、svgRoot自身のuser空間(getBBox/isPointInFillが実際に
// 使っている座標系。実機検証の結果、祖先group(例: world_base)のtransformの有無に
// 関わらず、shape自身が独自のtransformを持たない限りはこの空間と一致することを
// 確認済み)へ変換する。line-type実装時、nested要素へgetCTM()を呼ぶと期待通りの
// 共通空間を返さない実機不具合を経験しており、今回も個々のshapeへgetScreenCTM()/
// getCTM()を呼ぶ方式(祖先groupのtransform分だけ非uniformなscaleを含む不整合な値を
// 返すことを実機で確認済み)は採用せず、svgRoot自身に対してのみこのAPIを使う。
function getRootPointFromClient(svgRoot, clientX, clientY) {
  if (typeof svgRoot.getScreenCTM !== "function") return null;

  const screenCtm = svgRoot.getScreenCTM();
  if (!screenCtm) return null;

  const transformed = new DOMPoint(clientX, clientY).matrixTransform(screenCtm.inverse());
  return { x: transformed.x, y: transformed.y };
}

// svgRoot user空間上の点を、shape自身のtransform属性(あれば)を考慮したそのshape固有の
// local空間(isPointInFillが実際に判定に使う座標系)へ変換する。shape自身が
// transform属性を持たない場合はrootPointをそのまま返す(祖先のtransformは
// getRootPointFromClient()側で既に吸収されているため、ここではshape自身の分だけを
// 追加で考慮すればよいことを実機で確認済み)。SVGTransformList.consolidate()で
// shape自身のtransform行列を直接読み取る方式を使い、getCTM()/getScreenCTM()を
// nested要素へは一切呼ばない。
function getShapeLocalPoint(shape, rootPoint) {
  let ownMatrix = null;
  try {
    const transformList = shape.transform && shape.transform.baseVal;
    const consolidated = transformList && typeof transformList.consolidate === "function"
      ? transformList.consolidate()
      : null;
    ownMatrix = consolidated ? consolidated.matrix : null;
  } catch {
    ownMatrix = null;
  }

  if (!ownMatrix) return rootPoint;

  try {
    const local = new DOMPoint(rootPoint.x, rootPoint.y).matrixTransform(ownMatrix.inverse());
    return { x: local.x, y: local.y };
  } catch {
    return null;
  }
}

// 1つの.map-area要素(target)を構成する実際のfill geometry(path/polygon等)を返す。
// targetがgroupで複数の子shapeを持つ場合は子shapeすべてを対象とし、
// target自身が単一shapeの場合はそれ自身を対象とする
// (line-type側のgetLineVisualNodes()と同じ「子孫優先、なければ自分自身」の方針)。
// isPointInFillに対応しないnodeは対象から除外する。
function getAreaFillShapes(areaNode) {
  const descendants = [...areaNode.querySelectorAll("path, polygon, rect, circle, ellipse, polyline, line")]
    .filter((el) => typeof el.isPointInFill === "function");

  if (descendants.length > 0) return descendants;
  if (typeof areaNode.isPointInFill === "function") return [areaNode];
  return [];
}

// クリック地点(svgRoot user空間のrootPoint)が実際にfillへ含まれるtargetだけを
// candidateとして集める。containerの現在表示中mapに存在する.map-area(document全体でも
// 別mapでもない)のみを対象とし、isPointInFill()というbrowser native geometry APIで
// 判定する(elementsFromPoint()は塗りつぶされた重複shapeを列挙しないことをResearchで
// 実機確認済みのため使用しない)。同一areaIdが複数DOM要素にまたがっていても
// 1 candidateへdedupeする。shape自身がtransform属性を持つ場合はgetShapeLocalPoint()で
// そのshape固有のlocal空間へ変換してから判定する。
function getAreaCandidates(container, rootPoint) {
  const seen = new Map();

  container.querySelectorAll(".map-area").forEach((areaNode) => {
    const areaId = String(areaNode.dataset.areaId || "").trim();
    if (!areaId || seen.has(areaId)) return;

    const shapes = getAreaFillShapes(areaNode);
    const isHit = shapes.some((shape) => {
      const localPoint = getShapeLocalPoint(shape, rootPoint);
      if (!localPoint) return false;

      try {
        return shape.isPointInFill(localPoint);
      } catch {
        return false;
      }
    });

    if (isHit) seen.set(areaId, areaNode);
  });

  return [...seen.values()];
}

// targetのbbox面積(width*height)を返す。取得不能・0面積・例外時はnullを返し、
// 呼び出し側でそのcandidateを優先度比較から除外できるようにする(fail-closed寄り)。
function getAreaBBoxArea(areaNode) {
  if (typeof areaNode.getBBox !== "function") return null;

  try {
    const bbox = areaNode.getBBox();
    if (!bbox || !(bbox.width > 0) || !(bbox.height > 0)) return null;
    return bbox.width * bbox.height;
  } catch {
    return null;
  }
}

// bbox面積が同値(実質的なtie)の場合のdeterministic rule。DOM paint順に暗黙依存しないよう
// areaId(code-unit)昇順のものを優先する(line-type実装と同じ設計方針)。
function areaCandidateWinsTie(candidateId, currentBestId) {
  return candidateId < currentBestId;
}

// candidateが2件以上のときだけ呼ばれる。「より具体的(bbox面積が小さい)targetを優先する」
// という一般ルールで最も具体的なtargetを選ぶ。特定のtarget ID(australia/oceania等)へは
// 一切依存しない。有効な面積を持つcandidateが1つも無い場合はnullを返し、
// 誤ったtargetを推測しない(fail-closed)。
function resolveMostSpecificAreaNode(candidates) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  let best = null;
  let bestArea = Infinity;
  let bestAreaId = "";

  candidates.forEach((candidate) => {
    const area = getAreaBBoxArea(candidate);
    if (area === null) return;

    const candidateAreaId = String(candidate.dataset.areaId || "");

    if (
      area < bestArea ||
      (area === bestArea && areaCandidateWinsTie(candidateAreaId, bestAreaId))
    ) {
      best = candidate;
      bestArea = area;
      bestAreaId = candidateAreaId;
    }
  });

  return best;
}

export function bindAreaEvents(container, state, mapConfig) {
  const svgRoot = container.querySelector("svg");
  if (!svgRoot) return;

  svgRoot.addEventListener("click", (event) => {
    if (state.ui.answered) return;

    const rootPoint = getRootPointFromClient(svgRoot, event.clientX, event.clientY);
    if (!rootPoint) return;

    const candidates = getAreaCandidates(container, rootPoint);
    const areaNode = resolveMostSpecificAreaNode(candidates);
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