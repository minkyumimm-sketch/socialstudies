import {
  getMapConfig,
  loadMapSvgText,
  getMapAreaLabelById,
  getAllPrefectureIds
} from "./map-click-config.js";

import {
  setupSvgForPrefectureMap,
  bindPrefectureEvents,
  lockPrefectureMapVisuals
} from "./map-click-prefecture.js";

import {
  setupSvgForLineMap,
  bindLineEvents,
  lockLineMapVisuals
} from "./map-click-line.js";

import {
  setupSvgForAreaMap,
  bindAreaEvents,
  lockAreaMapVisuals
} from "./map-click-area.js";

const MAP_RENDERERS = {
  prefecture: {
    setup(svgRoot, mapConfig) {
      setupSvgForPrefectureMap(svgRoot, mapConfig);
    },
    bind(container, state) {
      bindPrefectureEvents(container, state);
    },
    lock(container, selectedAreaId, correctAreaId, normalizeValue) {
      lockPrefectureMapVisuals(container, selectedAreaId, correctAreaId, normalizeValue);
    }
  },

  line: {
    setup(svgRoot, mapConfig) {
      setupSvgForLineMap(svgRoot, mapConfig);
    },
    bind(container, state) {
      bindLineEvents(container, state);
    },
    lock(container, selectedAreaId, correctAreaId, normalizeValue) {
      lockLineMapVisuals(container, selectedAreaId, correctAreaId, normalizeValue);
    }
  },

  area: {
    setup(svgRoot, mapConfig) {
      setupSvgForAreaMap(svgRoot, mapConfig);
    },
    bind(container, state, mapConfig) {
      bindAreaEvents(container, state, mapConfig);
    },
    lock(container, selectedAreaIds, correctAreaIds, normalizeValue) {
      lockAreaMapVisuals(container, selectedAreaIds, correctAreaIds, normalizeValue);
    }
  }
};

function getMapRenderer(mapConfig) {
  const rendererType = String(mapConfig?.rendererType || "").trim();
  const renderer = MAP_RENDERERS[rendererType];

  if (!renderer) {
    throw new Error(`未対応の rendererType です: ${rendererType}`);
  }

  return renderer;
}

function prepareMapQuestionUi(elements) {
  const questionText = elements?.questionText;
  const choicesContainer = elements?.choicesContainer;
  const answerInput = elements?.answerInput;
  const submitButton = elements?.submitButton;
  const answerResult = elements?.answerResult;
  const mapClickContainer = elements?.mapClickContainer;
  const mapClickStatus = elements?.mapClickStatus;

  if (
    !questionText ||
    !choicesContainer ||
    !answerInput ||
    !submitButton ||
    !answerResult ||
    !mapClickContainer
  ) {
    console.error("map_click 用DOM取得失敗");
    return null;
  }

  choicesContainer.className = "choices";
  choicesContainer.innerHTML = "";
  choicesContainer.style.display = "none";

  answerInput.value = "";
  answerInput.style.display = "none";

  submitButton.style.display = "inline-block";
  submitButton.disabled = false;
  submitButton.textContent = "解答";

  answerResult.classList.remove("correct", "incorrect");
  answerResult.style.color = "";

  mapClickContainer.innerHTML = `<div class="map-loading">地図を読み込み中...</div>`;
  mapClickContainer.style.display = "block";

  if (mapClickStatus) {
    mapClickStatus.textContent = "";
    mapClickStatus.style.display = "none";
  }

  return {
    questionText,
    mapClickContainer
  };
}

function ensureMapSelectionState(state) {
  if (!Array.isArray(state?.ui?.selectedMapAreaIds)) {
    state.ui.selectedMapAreaIds = [];
  }
}

export async function renderMapClickQuestion(question, elements, state) {
  const prepared = prepareMapQuestionUi(elements);
  if (!prepared) return;

  const { questionText, mapClickContainer } = prepared;
  questionText.textContent = question.question || "地図問題";

  ensureMapSelectionState(state);
  state.ui.selectedMapArea = "";
  state.ui.selectedMapAreaId = "";
  state.ui.selectedMapAreaIds = [];

  try {
    const mapConfig = getMapConfig(question);
    const renderer = getMapRenderer(mapConfig);
    const svgText = await loadMapSvgText(mapConfig);

    mapClickContainer.innerHTML = svgText;

    const svgRoot = mapClickContainer.querySelector("svg");
    if (!svgRoot) {
      throw new Error("SVG要素が見つかりません");
    }

    svgRoot.classList.add("map-click-svg");

    renderer.setup(svgRoot, mapConfig);
    renderer.bind(mapClickContainer, state, mapConfig);
  } catch (error) {
    console.error("地図描画失敗:", error);
    mapClickContainer.innerHTML = `
      <div class="map-error">
        地図の読み込みに失敗しました。<br>
        <code>assets 内のSVGファイル名と id を確認してください。</code>
      </div>
    `;
  }
}

function splitAnswerIds(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function lockMapClickVisuals(container, selectedAreaId, correctAreaId, normalizeValue) {
  if (!container) return;

  const areaNodes = container.querySelectorAll(".map-area");
  if (areaNodes.length > 0) {
    const selectedAreaIds = splitAnswerIds(selectedAreaId);
    const correctAreaIds = splitAnswerIds(correctAreaId);
    MAP_RENDERERS.area.lock(container, selectedAreaIds, correctAreaIds, normalizeValue);
    return;
  }

  const lineGroups = container.querySelectorAll(".map-line");
  const rendererType = lineGroups.length > 0 ? "line" : "prefecture";
  const renderer = MAP_RENDERERS[rendererType];

  renderer.lock(container, selectedAreaId, correctAreaId, normalizeValue);
}

export function resetMapClickArea(elements) {
  const mapClickContainer = elements?.mapClickContainer;
  const mapClickStatus = elements?.mapClickStatus;
  const choicesContainer = elements?.choicesContainer;
  const answerInput = elements?.answerInput;

  if (mapClickContainer) {
    mapClickContainer.innerHTML = "";
    mapClickContainer.style.display = "none";
  }

  if (mapClickStatus) {
    mapClickStatus.textContent = "";
    mapClickStatus.style.display = "none";
  }

  if (choicesContainer) {
    choicesContainer.style.display = "";
  }

  if (answerInput) {
    answerInput.value = "";
    answerInput.style.display = "none";
  }
}

export function getSelectedMapArea(state) {
  return String(state?.ui?.selectedMapArea || "").trim();
}

export function getSelectedMapAreaId(state) {
  return String(state?.ui?.selectedMapAreaId || "").trim();
}

export function getSelectedMapAreaIds(state) {
  return Array.isArray(state?.ui?.selectedMapAreaIds)
    ? [...state.ui.selectedMapAreaIds]
    : [];
}

export function getSelectedMapAnswer(state) {
  const ids = getSelectedMapAreaIds(state);
  if (ids.length > 0) {
    return ids;
  }
  return getSelectedMapAreaId(state);
}

export { getMapAreaLabelById, getAllPrefectureIds };