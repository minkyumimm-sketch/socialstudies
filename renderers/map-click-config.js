const PREFECTURE_SVG_FILE_PATH = "./assets/map-full.svg";
const RIVER_MAP_SVG_FILE_PATH = "./assets/map-river-latest.svg";
const MOUNTAIN_MAP_SVG_FILE_PATH = "./assets/map-mountains.svg";
const PENINSULA_MAP_SVG_FILE_PATH = "./assets/map-peninsula-sea-current-tide.svg";
const COAST_MAP_SVG_FILE_PATH = "./assets/map-coast.svg";
const WORLD_MAP_SVG_FILE_PATH = "./assets/map-world.svg";
const ASIA_MAP_SVG_FILE_PATH = "./assets/map-asia.svg";
const EUROPE_MAP_SVG_FILE_PATH = "./assets/map-europe.svg";
const WORLD_PHYSICAL_MAP_SVG_FILE_PATH =
  "./assets/map-world-physical.svg";

const PREFECTURE_IDS = [
  "hokkaido", "aomori", "iwate", "miyagi", "akita", "yamagata", "fukushima",
  "ibaraki", "tochigi", "gunma", "saitama", "chiba", "tokyo", "kanagawa",
  "niigata", "toyama", "ishikawa", "fukui", "yamanashi", "nagano",
  "gifu", "shizuoka", "aichi", "mie",
  "shiga", "kyoto", "osaka", "hyogo", "nara", "wakayama",
  "tottori", "shimane", "okayama", "hiroshima", "yamaguchi",
  "tokushima", "kagawa", "ehime", "kochi",
  "fukuoka", "saga", "nagasaki", "kumamoto", "oita", "miyazaki", "kagoshima", "okinawa"
];

const RIVER_IDS = [
  "tone",
  "shinano"
];

const MOUNTAIN_IDS = [
  "ouu",
  "hida",
  "kiso",
  "akaishi",
  "chugoku",
  "shikoku",
  "kyushu"
];

const PENINSULA_IDS = [
  "peninsula_01",
  "peninsula_02",
  "peninsula_03",
  "peninsula_04",
  "peninsula_05",
  "peninsula_06",
  "peninsula_07",
  "peninsula_08",
  "peninsula_09",
  "peninsula_10",
  "peninsula_11",
  "peninsula_12",
  "peninsula_13",
  "peninsula_14"
];

const COAST_IDS = [
  "rias_01",
  "rias_02",
  "rias_03",
  "rias_04",
  "rias_05",
  "rias_06"
];

const WORLD_COUNTRY_IDS = [
  "JP",
  "CN",
  "KR",
  "KP",
  "IN",
  "TH",
  "VN",
  "KH",
  "PH",
  "ID",
  "MY",
  "SG",
  "SA",

  "DE",
  "GB",
  "FR",
  "IT",
  "ES",
  "PT",
  "NL",
  "CH",
  "SE",
  "NO",
  "RU",

  "EG",
  "NG",
  "ZA",
  "GH",
  "KE",
  "CI",

  "CA",
  "US",
  "MX",
  "DO",
  "CU",
  "BR",
  "AR",
  "CL",
  "PE",
  "CO",

  "AU",
  "NZ"
];

const ASIA_COUNTRY_IDS = [
  "CN",
  "KR",
  "IN",
  "TH",
  "VN",
  "KH",
  "PH",
  "ID",
  "MY",
  "SG",
  "SA"
];

const EUROPE_COUNTRY_IDS = [
  "DE",
  "GB",
  "FR",
  "IT",
  "ES",
  "PT",
  "NL",
  "CH",
  "SE",
  "NO",
  "RU"
];

const WORLD_RIVER_IDS = [
  "nile",
  "amazon"
];

const WORLD_MOUNTAIN_IDS = [
  "andes",
  "rockies",
  "alps",
  "himalaya"
];

const WORLD_SEA_IDS = [
  "pacific_ocean",
  "atlantic_ocean_west",
  "atlantic_ocean_east",
  "indian_ocean",
  "mediterranean_sea"
];

const WORLD_CONTINENT_IDS = [
  "africa",
  "asia",
  "europe",
  "south_america",
  "north_america",
  "oceania",
  "australia",
  "middle_east"
];

const SVG_SOURCES = {
  prefecture: {
    path: PREFECTURE_SVG_FILE_PATH,
    cacheKey: "prefecture"
  },

  river: {
    path: RIVER_MAP_SVG_FILE_PATH,
    cacheKey: "river"
  },

  mountain: {
    path: MOUNTAIN_MAP_SVG_FILE_PATH,
    cacheKey: "mountain"
  },

  peninsula: {
    path: PENINSULA_MAP_SVG_FILE_PATH,
    cacheKey: "peninsula"
  },

  coast: {
    path: COAST_MAP_SVG_FILE_PATH,
    cacheKey: "coast"
  },

  world: {
    path: WORLD_MAP_SVG_FILE_PATH,
    cacheKey: "world"
  },

  worldPhysical: {
  path: WORLD_PHYSICAL_MAP_SVG_FILE_PATH,
  cacheKey: "worldPhysical"
},

  asia: {
  path: ASIA_MAP_SVG_FILE_PATH,
  cacheKey: "asia"
},

europe: {
  path: EUROPE_MAP_SVG_FILE_PATH,
  cacheKey: "europe"
},
};

const svgTextCache = {
  prefecture: "",
  river: "",
  mountain: "",
  peninsula: "",
  coast: "",
  world: "",
  asia: "",
  europe: "",
  worldPhysical: ""
};

function createPrefectureMapConfig(title) {
  return {
    title,
    selectableAreaIds: [...PREFECTURE_IDS],
    svgSource: "prefecture",
    rendererType: "prefecture",
    selectionType: "single"
  };
}

function createLineMapConfig(title, selectableAreaIds, svgSource, lineKind) {
  return {
    title,
    selectableAreaIds: [...selectableAreaIds],
    svgSource,
    rendererType: "line",
    selectionType: "single",
    lineKind
  };
}

function createAreaMapConfig(title, selectableAreaIds, svgSource, selectionType = "multiple") {
  return {
    title,
    selectableAreaIds: [...selectableAreaIds],
    svgSource,
    rendererType: "area",
    selectionType
  };
}

export const MAP_CONFIGS = {
  japan_full_pref: createPrefectureMapConfig("全国47都道府県"),
  japan_hokkaido_tohoku_pref: createPrefectureMapConfig("北海道・東北地方"),
  japan_kanto_pref: createPrefectureMapConfig("関東地方"),
  japan_chubu_pref: createPrefectureMapConfig("中部地方"),
  japan_kinki_pref: createPrefectureMapConfig("近畿地方"),
  japan_chugoku_shikoku_pref: createPrefectureMapConfig("中国・四国地方"),
  japan_kyushu_pref: createPrefectureMapConfig("九州地方"),

  japan_rivers_main: createLineMapConfig(
    "河川",
    RIVER_IDS,
    "river",
    "river"
  ),

  japan_mountains_main: createLineMapConfig(
    "山脈・山地",
    MOUNTAIN_IDS,
    "mountain",
    "mountain"
  ),

  japan_peninsula: createAreaMapConfig(
    "半島",
    PENINSULA_IDS,
    "peninsula",
    "multiple"
  ),

  japan_coast: createAreaMapConfig(
    "海岸",
    COAST_IDS,
    "coast",
    "multiple"
  ),

  world_countries_edu: createAreaMapConfig(
    "世界地図",
    WORLD_COUNTRY_IDS,
    "world",
    "single"
  ),

  asia_countries_edu: createAreaMapConfig(
  "アジア地図",
  ASIA_COUNTRY_IDS,
  "asia",
  "single"
),

europe_countries_edu: createAreaMapConfig(
  "ヨーロッパ地図",
  EUROPE_COUNTRY_IDS,
  "europe",
  "single"
),

world_rivers_edu: createLineMapConfig(
  "世界の河川",
  WORLD_RIVER_IDS,
  "worldPhysical",
  "river"
),

world_mountains_edu: createLineMapConfig(
  "世界の山脈",
  WORLD_MOUNTAIN_IDS,
  "worldPhysical",
  "mountain"
),

world_seas_edu: createAreaMapConfig(
  "世界の海洋",
  WORLD_SEA_IDS,
  "worldPhysical",
  "single"
),

world_continents_edu: createAreaMapConfig(
  "世界の大陸",
  WORLD_CONTINENT_IDS,
  "worldPhysical",
  "single"
),

};

export const AREA_LABEL_MAP = {
  hokkaido: "北海道",
  aomori: "青森県",
  iwate: "岩手県",
  miyagi: "宮城県",
  akita: "秋田県",
  yamagata: "山形県",
  fukushima: "福島県",
  ibaraki: "茨城県",
  tochigi: "栃木県",
  gunma: "群馬県",
  saitama: "埼玉県",
  chiba: "千葉県",
  tokyo: "東京都",
  kanagawa: "神奈川県",
  niigata: "新潟県",
  toyama: "富山県",
  ishikawa: "石川県",
  fukui: "福井県",
  yamanashi: "山梨県",
  nagano: "長野県",
  gifu: "岐阜県",
  shizuoka: "静岡県",
  aichi: "愛知県",
  mie: "三重県",
  shiga: "滋賀県",
  kyoto: "京都府",
  osaka: "大阪府",
  hyogo: "兵庫県",
  nara: "奈良県",
  wakayama: "和歌山県",
  tottori: "鳥取県",
  shimane: "島根県",
  okayama: "岡山県",
  hiroshima: "広島県",
  yamaguchi: "山口県",
  tokushima: "徳島県",
  kagawa: "香川県",
  ehime: "愛媛県",
  kochi: "高知県",
  fukuoka: "福岡県",
  saga: "佐賀県",
  nagasaki: "長崎県",
  kumamoto: "熊本県",
  oita: "大分県",
  miyazaki: "宮崎県",
  kagoshima: "鹿児島県",
  okinawa: "沖縄県",

  tone: "利根川",
  shinano: "信濃川",

  ouu: "奥羽山脈",
  hida: "飛騨山脈",
  kiso: "木曽山脈",
  akaishi: "赤石山脈",
  chugoku: "中国山地",
  shikoku: "四国山地",
  kyushu: "九州山地",

  peninsula_01: "下北半島",
  peninsula_02: "津軽半島",
  peninsula_03: "男鹿半島",
  peninsula_04: "牡鹿半島",
  peninsula_05: "能登半島",
  peninsula_06: "房総半島",
  peninsula_07: "伊豆半島",
  peninsula_08: "渥美半島・知多半島",
  peninsula_09: "丹後半島",
  peninsula_10: "紀伊半島",
  peninsula_11: "島根半島",
  peninsula_12: "佐田岬半島",
  peninsula_13: "西彼杵半島",
  peninsula_14: "薩摩半島",

  rias_01: "三陸海岸",
  rias_02: "若狭湾",
  rias_03: "志摩半島",
  rias_04: "宇和海",
  rias_05: "宇和海",
  rias_06: "大村湾",

JP: "日本",
CN: "中国",
KR: "韓国",
KP: "北朝鮮",

IN: "インド",
TH: "タイ",
VN: "ベトナム",
KH: "カンボジア",
PH: "フィリピン",
ID: "インドネシア",
MY: "マレーシア",
SG: "シンガポール",
SA: "サウジアラビア",

DE: "ドイツ",
GB: "イギリス",
FR: "フランス",
IT: "イタリア",
ES: "スペイン",
PT: "ポルトガル",
NL: "オランダ",
CH: "スイス",
SE: "スウェーデン",
NO: "ノルウェー",
RU: "ロシア",

EG: "エジプト",
NG: "ナイジェリア",
ZA: "南アフリカ",
GH: "ガーナ",
KE: "ケニア",
CI: "コートジボワール",

CA: "カナダ",
US: "アメリカ合衆国",
MX: "メキシコ",
DO: "ドミニカ共和国",
CU: "キューバ",
BR: "ブラジル",
AR: "アルゼンチン",
CL: "チリ",
PE: "ペルー",
CO: "コロンビア",

AU: "オーストラリア",
NZ: "ニュージーランド",

nile: "ナイル川",
amazon: "アマゾン川",

andes: "アンデス山脈",
rockies: "ロッキー山脈",
alps: "アルプス山脈",
himalaya: "ヒマラヤ山脈",

pacific_ocean: "太平洋",
atlantic_ocean_west: "大西洋",
atlantic_ocean_east: "大西洋",
indian_ocean: "インド洋",
mediterranean_sea: "地中海",

africa: "アフリカ",
asia: "アジア",
europe: "ヨーロッパ",
north_america: "北アメリカ大陸",
south_america: "南アメリカ大陸",
oceania: "オセアニア",
australia: "オーストラリア",
middle_east: "中東",
};

async function fetchTextFile(path) {
  const res = await fetch(path);

  if (!res.ok) {
    throw new Error(`SVG読込失敗: ${path}`);
  }

  return res.text();
}

export async function loadSvgTextBySource(svgSource) {
  const sourceKey = String(svgSource || "").trim();
  const source = SVG_SOURCES[sourceKey];

  if (!source) {
    throw new Error(`svgSource不明: ${sourceKey}`);
  }

  if (svgTextCache[source.cacheKey]) {
    return svgTextCache[source.cacheKey];
  }

  svgTextCache[source.cacheKey] = await fetchTextFile(source.path);

  return svgTextCache[source.cacheKey];
}

export async function loadMapSvgText(mapConfig) {
  const svgSource = String(mapConfig?.svgSource || "").trim();

  if (!svgSource) {
    throw new Error(`mapConfig に svgSource がありません`);
  }

  return loadSvgTextBySource(svgSource);
}

export function getMapConfig(question) {
  const mapId = String(question?.mapId || "").trim();

  return MAP_CONFIGS[mapId] || MAP_CONFIGS.japan_full_pref;
}

export function getMapAreaLabelById(areaId) {
  return AREA_LABEL_MAP[String(areaId || "").trim()] || "";
}

export function getAllPrefectureIds() {
  return [...PREFECTURE_IDS];
}