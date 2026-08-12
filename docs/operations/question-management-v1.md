# 問題管理運用ルール Ver.1

- 作成日: 2026-08-12
- 位置づけ: 問題（`data/*.csv`）の編集・追加・移行に関する運用ルールの正本。CLAUDE.mdからはこのファイルへ要約リンクする。
- 背景: Task41〜42で、問題管理をCSV直接編集からGoogle Sheets経由の運用へ移行した。全7科目473問についてround-trip検証（意味的差分0件）・`scripts/validate-questions.mjs`（Error/Warning/Critical 0件）を確認済み。

---

## 1. 正本の定義

**Google Sheets「LS総合テスト対策_問題マスター」を、問題内容編集の正本とする。**

- `data/*.csv`は、GitHub Pages配信用に生成された**配信用データ**であり、直接の編集対象ではない。
- 本番アプリ（`config/subjects.js`の`csvPath`）は、引き続きGitHub Pages上の`data/*.csv`のみを読み込む。**Google Sheetsへ直接依存させない**（Sheets障害・API制限・通信遅延を本番学習に持ち込まないため）。

## 2. シート構成

1科目1タブ。科目間でschemaを無理に統一しない（既存CSVの列構成をそのまま踏襲）。

| タブ名 | 対応CSV | 列数 |
|---|---|---|
| `biology` | `data/biology_questions.csv` | 15 |
| `chemistry` | `data/chemistry_questions.csv` | 15 |
| `physics` | `data/physics_questions.csv` | 15 |
| `earth_science` | `data/earth_science_questions.csv` | 15 |
| `japan_geo` | `data/japan_geo_questions.csv` | 19 |
| `world_geo` | `data/world_geo_questions.csv` | 19 |
| `history` | `data/history_questions.csv` | 21 |

理科4科目は共通14列＋`imagePath`。地理2科目は共通14列＋`svgAreaId`/`mapId`/`answerAlias`/`mapSelectionType`/`svgAreaIds`。historyは共通14列＋`answerAlias`/`sortGroup`/`sortItems`/`eraCorrect`/`year`/`documentId`/`timelineGroup`。

### 科目別mode一覧（実データ確認済み、2026-08-12時点）

| 科目 | 使用mode |
|---|---|
| biology | text, choice |
| chemistry | text, choice |
| physics | text, choice |
| earth_science | text, choice |
| japan_geo | map_click |
| world_geo | map_click |
| history | text, choice, era, sort |

Google Sheets上の`mode`列に入力規則（プルダウン）を設定する場合は、上表の科目ごとの実使用値のみを候補にする（他科目のmodeを候補に含めない）。

## 3. Sheets編集環境（ユーザー側で設定する項目）

Google SheetsはClaude Codeから直接操作できないため、以下は**ユーザー側で設定する**。

全7タブ共通で最低限：

- **1行目固定**（ヘッダー行が常に見える状態にする）
- **フィルタ設定**（全列に適用）
- **`status`列の入力規則**：`active` / `hidden` / `draft` / `archived` の4値のみ
- **`mode`列の入力規則**：上表「科目別mode一覧」の実使用値のみ
- **`questionId`列**：既存IDを直接変更しない列として扱う。完全ロックまでは不要だが、背景色を変える等で視覚的に区別することを推奨

## 4. questionIdの運用

- 既存の`questionId`は変更しない（過去の学習履歴・AnswerRecordとの対応が壊れるため）。
- 新規問題は「その科目CSVの現在の最大ID＋1」から連番で採番する（`bio_001`〜のように既存の接頭辞を踏襲）。
- 重複ID・空ID・不正prefixは`scripts/validate-questions.mjs`が検出する。新しい検証ロジックは不要。

## 5. 画像（imagePath）の扱い

- Google Sheetsの`imagePath`列には、**パス文字列のみ**を保存する（例: `assets/questions/biology-cell-comparison.svg`）。
- SVG本体・画像ファイルはSheetsへ保存せず、**従来どおりGitHubで管理**する（`assets/questions/`配下）。
- `scripts/validate-questions.mjs`の既存imagePath検証（相対パス・外部URL禁止・ファイル実在・SVG安全性）をそのまま利用する。

## 6. 問題追加・修正の正式フロー

```
Google Sheetsで編集
  ↓
対象タブをCSVでダウンロード（ファイル → ダウンロード → カンマ区切り形式）
  ↓
既存 data/*.csv との差分確認
  ↓
scripts/compare-question-csv.mjs で意味的差分を確認
  ↓
（意味的差分がある場合のみ）data/*.csv を更新
  ↓
scripts/validate-questions.mjs 実行（Error/Warning/Critical 0を確認）
  ↓
必要に応じてブラウザで動作確認
  ↓
git diff で変更範囲を確認
  ↓
commit
  ↓
push
  ↓
GitHub Pages反映確認
```

**「Sheetsを編集した瞬間に本番へ反映される」構造は採用しない。** 編集→検証→公開の境界を必ず残す。

### round-trip比較コマンド

```bash
node scripts/compare-question-csv.mjs data/<subject>_questions.csv "<Sheetsからダウンロードしたcsvのパス>"
```

questionIdをキーに、列追加/削除・行追加/削除・セル内容変更を検出する。BOM・CRLF/LF等のフォーマット差は自動的に無害と判定される（`core/question-loader.js`の`parseDelimitedText`を再利用しているため、本番アプリのCSV解釈と常に一致する）。

## 7. Claude Codeが問題を作成する場合の運用

Claude Codeが新規問題やCSV修正を作成した場合も、**Google Sheetsへ反映し、人間が確認する**フローに乗せる。「Claude Codeが作った問題だから別管理」という状態を作らない。

推奨手順：

1. Claude Codeが新規問題候補を、既存CSVと同じ列構成で作成する
2. 人間がGoogle Sheetsへ取り込み、内容を確認・必要なら修正する
3. 以降は本ドキュメント6章の正式フローに合流する（ダウンロード→比較→validator→commit）

Claude Codeが`data/*.csv`を直接編集して完了とする運用は行わない（Sheetsとの不整合を生むため）。

## 8. SheetsとCSVの同期ルール

- Google Sheetsだけを変更し、`data/*.csv`への反映を長期間放置しない。
- `data/*.csv`だけを直接変更し、Sheets側へ未反映のまま長期間放置しない。
- 同期は**1作業単位（1回の問題追加・修正セッション）ごとに完了させる**。次の編集セッションへ持ち越さない。

## 9. 旧社会アプリの扱い

- 旧社会アプリ（`japan_geo`/`world_geo`/`history`、計207問）は、Task41の調査でLS総合テスト側へ**完全移行済み**であることを確認済み（questionId・内容ともに完全一致、Phase1.5Bで修正した既知バグ1件を除く）。
- 追加で旧社会アプリから問題をコピーする必要はない。
- 旧社会アプリの`students`/学習履歴/GAS等は引き継がない（生徒情報は生徒管理システムが正本という既存方針を維持）。
- 旧社会アプリは当面**参照用**として残す（削除しない）。
