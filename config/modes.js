export const MODE_LABELS = {
  text: "記述",
  choice: "選択",
  era: "時代当て",
  sort: "並び替え",
  map_click: "地図クリック"
};

const GEO_MODE_FILTER_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "text", label: "記述" },
  { value: "choice", label: "選択" },
  { value: "map_click", label: "地図クリック" }
];

const TEXT_CHOICE_MODE_FILTER_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "text", label: "記述" },
  { value: "choice", label: "選択" }
];

export const MODE_FILTER_OPTIONS = {
  japan_geo: GEO_MODE_FILTER_OPTIONS,
  world_geo: GEO_MODE_FILTER_OPTIONS,
  history: [
    { value: "all", label: "すべて" },
    { value: "text", label: "記述" },
    { value: "choice", label: "選択" },
    { value: "era", label: "時代当て" },
    { value: "sort", label: "並び替え" }
  ],
  biology: TEXT_CHOICE_MODE_FILTER_OPTIONS,
  chemistry: TEXT_CHOICE_MODE_FILTER_OPTIONS,
  physics: TEXT_CHOICE_MODE_FILTER_OPTIONS
};