// features/common/id-utils.js
//
// 識別子生成の共通ユーティリティ。
// 参照: docs/specification/domain-model-v1.md 2.1節（識別子設計）
//
// attemptId は「crypto.randomUUID() 推奨、非対応環境向けフォールバックあり」という
// 設計判断（仮決定）に基づく。ここではフォールバック込みで1箇所に実装し、
// 各モデルが個別に乱数生成ロジックを持たないようにする。

export function generateAttemptId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // フォールバック: crypto.randomUUID が使えない環境向け（設計書2.1節の代替形式）
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
