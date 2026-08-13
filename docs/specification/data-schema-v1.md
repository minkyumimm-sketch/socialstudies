# データスキーマ仕様書 Ver.1（CSV設計）

- 作成日: 2026-08-03
- 位置づけ: `docs/architecture/ls-total-test-system-design-v1.md` の4章の詳細版
- 表記ルール（確定/仮決定/要確認）はメイン設計書と共通

---

## 1. 基本方針

### 1.1 確定事項

- CSVは**見出し行あり**の現行方式を維持する。列番号のハードコード（`row[15]`のような直接記述）は行わない。
- パース・正規化は既存の`core/question-loader.js`（汎用デリミタ対応パーサ）・`core/question-normalizer.js`（正規化）をそのまま流用する。新しい列を追加しても、`normalizeQuestion`は`{...question}`のスプレッドで未知列を保持するため、既存ロジックを壊さずに列を増やせる。
- 既存3ファイル（`japan_geo_questions.csv` / `world_geo_questions.csv` / `history_questions.csv`）の**既存列は削除・改名しない**。追加する場合は末尾に列を追加する形式とする。
- 理科用CSVは既存3ファイルへ行を混在させず、**新規ファイル**として追加する（`config/subjects.js`相当のマスタにCSVパスを1件追加するだけで済む既存の拡張パターンを踏襲）。

### 1.2 列追加時の後方互換性ルール（確定）

1. 新しい列は既存行では空欄でよい（`question-normalizer.js`は空文字列を許容する設計になっている）。
2. 既存の`mode`別必須列（4章参照）を変更しない。
3. 列の意味を変える場合（例: 将来`mapSelectionType`を実際に使うようにする等）は、別名の新列を追加し、旧列は「読み捨てられたまま残す」か「6章の整合性検査で警告を出しつつ廃止予告する」のいずれかとし、値の意味を無断で変更しない。

---

## 2. 共通列（既存・全mode共通）

現行の`japan_geo_questions.csv` / `world_geo_questions.csv`のヘッダーをベースとする。

| 列名 | 用途 | 必須 | 変更予定 |
|---|---|---|---|
| `questionId` | 一意なID | 実質必須 | 変更なし |
| `subject` | `fieldId`（3章参照、既存値は不変） | 必須 | 変更なし |
| `unit` | 単元（表示名兼キー） | 必須 | 変更なし |
| `subunit` | 分野 | 任意 | 変更なし |
| `difficulty` | 難易度 | 任意（現状未使用） | Phase5以降、苦手問題判定での活用を検討（列自体は追加不要、既存列を使う） |
| `mode` | 出題形式 | 必須 | 変更なし |
| `question` | 問題文 | 必須 | 変更なし |
| `answer` | 正解 | 必須 | 変更なし |
| `choices` | 選択肢（choiceモード用） | modeにより必須 | 変更なし |
| `explanation` | 解説文 | 任意 | 変更なし |
| `status` | ライフサイクル状態 | 任意 | **値の許容セットを4値（draft/active/hidden/archived）に統一（Phase1.5、メイン設計書5章参照）** |

---

## 3. mode固有列（既存）

| mode | 固有列 | 備考 |
|---|---|---|
| `map_click` | `svgAreaId`, `mapId`, `svgAreaIds` | 変更なし。6章の整合性検査対象 |
| `era`（history専用） | `eraCorrect` | 変更なし |
| `sort`（history専用） | `sortGroup`, `sortItems` | 変更なし |

---

## 4. 任意列（既存・現状未使用のものを含む）

| 列名 | 現状の利用状況 | 今回の設計判断 |
|---|---|---|
| `answerGroup` | 未使用 | 用途未確定のまま温存。Phase5以降で「関連問題のグルーピング」用途に転用可能かを再検討（**要確認**: 元々どういう意図で用意された列か、CSV作成者に確認が望ましい） |
| `relatedQuestionIds` | 未使用 | 同上 |
| `tags` | 未使用 | Phase5以降、苦手問題・おすすめ問題の絞り込みタグとして活用できる可能性がある。今回は列の意味を新たに定義しない |
| `answerAlias` | 正規化はされるが判定未接続 | Phase1.5以降の別課題として、`judges/answer-judge.js`への接続を将来検討（今回のスコープ外、確定バグではないため） |
| `mapSelectionType` | 未使用（実際の単一/複数は`MAP_CONFIGS`側で決定） | 現状維持。将来的にCSV側の意図を実際の判定に使うよう見直す場合は、6章の整合性検査に「`mapSelectionType`と`MAP_CONFIGS.selectionType`の不一致検出」ルールを追加できる |
| `year`（history） | 未使用 | 年表機能（社会）で活用予定。Phase8で接続を検討 |
| `documentId`（history） | 未使用 | 用途未確定のまま温存 |
| `timelineGroup`（history） | 未使用 | 年表機能で活用予定 |

**確定方針**: 上記の未使用列は、今回**削除しない**（Phase0レビューの「削除候補」に対する最終判断は将来のPhaseに委ねる）。

---

## 5. 新たに追加を検討する列（初期段階で必須か、後回しかを仕分け）

| 列（案） | 用途 | 区分 | 対応フェーズ |
|---|---|---|---|
| `questionSetId` | 所属する問題セットへの参照（任意。QuestionSet側からの選定条件だけで完結する場合は不要） | 後から追加 | Phase2以降、必要になった時点 |
| `timerSeconds` | 問題単位の制限時間 | 後から追加 | Phase7 |
| `imageUrl` | 理科の画像問題用の画像パス | 後から追加（理科CSV新規時に同時導入） | Phase8 |
| `stepOrder` / `stepItems` | 実験手順の並び替え用（既存`sortGroup`/`sortItems`の理科版としてそのまま流用可能、新列は不要の可能性が高い） | 既存列の流用を優先、不足時のみ追加 | Phase8 |

**確定方針**: 上記はいずれも「今すぐCSVへ追加する」前提にしない。各Phase着手時に、そのPhaseで実際に必要になった列だけを追加する。

---

## 6. CSVではなく別マスタ（Sheets等）で管理するもの

| データ | 管理場所 | 理由 |
|---|---|---|
| `QuestionSet` / `QuestionSetVersion` | Google Sheets（新設） | 塾スタッフによる更新頻度が高く、GitHub Pages再デプロイを都度要求するCSV方式は運用負荷が高い（domain-model-v1.md 4章参照） |
| `school_master` / `TestSet` / `TestSetQuestion`（学校テスト対策セット、Task47でTestRangeから改称） | TestSet専用Google Spreadsheet「LS総合テスト対策_学校・テストセットマスター」（新設、Task50で確定）。アクセスはTestSet専用GAS Web App経由（既存GASとは分離） | 学校ごとに異なる問題選定を塾スタッフが随時・即時に更新する運用を想定。問題マスターと異なりCSV+Git+Push方式では即時性要件を満たせない（domain-model-v1.md 3.15節参照） |
| `Attempt` / `AnswerRecord` | Google Sheets（既存の解答保存シートを拡張） | 生徒の行動ログであり、そもそも配信物ではない |
| `RankingRecord` | Google Sheets（新設） | 同上 |

---

## 7. GASまたはSheetsで管理するもの（導出データ）

| データ | 管理場所 | 理由 |
|---|---|---|
| `LearningSummary` | 初期は都度計算（GAS側）。パフォーマンス次第でSheetsへキャッシュ | AnswerRecordから再計算可能な導出データのため、まずは非正規化を避ける |
| `WeakQuestion` | 都度計算（学習アプリ側`features/weak-questions/`） | 同上。ルールが変わりやすい初期段階では、キャッシュを持つとルール変更のたびに再計算が必要になり複雑化する |

---

## 8. 理科CSV新規追加時の設計（Phase3）

### 8.1 ファイル構成（仮決定）

既存の`data/japan_geo_questions.csv`等と同じディレクトリに、分野ごとに新規ファイルを追加する。

```
data/
├── japan_geo_questions.csv   （既存・変更なし）
├── world_geo_questions.csv   （既存・変更なし）
├── history_questions.csv     （既存・変更なし）
├── biology_questions.csv     （新規）
├── chemistry_questions.csv   （新規）
├── physics_questions.csv     （新規）
└── earth_science_questions.csv （新規）
```

### 8.2 列構成（仮決定）

既存3ファイルの共通列（2章）＋各分野で必要なmode固有列のみを採用する。理科は`map_click`（地学の地形図等）・`era`（該当なし）・`sort`（実験手順、既存`sortGroup`/`sortItems`を流用）・`choice`・`text`のいずれかを使う想定とし、historyだけに存在する`eraCorrect`列は理科CSVには含めない（共通スキーマを汚さない）。

---

## 9. 整合性検査との対応関係

本データスキーマで定義した列は、メイン設計書6章の検査ルールと以下のように対応します。

| 検査ルール | 対応する列 |
|---|---|
| mode有効性 | `mode` |
| status許可値 | `status` |
| questionId重複 | `questionId` |
| mode別必須列充足 | `question`/`answer`/`choices`/`sortItems`/`eraCorrect`/`mapId`/`svgAreaId(s)`等 |
| subject（fieldId）存在確認 | `subject` |
| mapId存在確認 | `mapId` |
| svgAreaIds実在確認 | `svgAreaId`, `svgAreaIds` |
