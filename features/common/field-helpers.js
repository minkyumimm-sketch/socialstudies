// features/common/field-helpers.js
//
// 各モデルで共通して使う、軽量なフィールド正規化ユーティリティ。
// core/question-normalizer.js 等、既存コードの正規化スタイル（trim・型変換）を踏襲する。
// モデル同士が直接依存し合わないよう、共通処理はこの層にのみ置く。

export function toTrimmedString(value) {
  return String(value ?? "").trim();
}

export function toBooleanFlag(value) {
  return Boolean(value);
}

export function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}
