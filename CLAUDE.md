# CLAUDE.md

このファイルは「LS総合テスト対策」プロジェクトにおける、Claude Codeによる全開発の**正本（Single Source of Truth）**です。ここに書かれたルールは、指示が無い限り常に適用してください。詳細な分析・設計・仕様の記録は`docs/`配下にあり、本ファイルはそこから導かれる実務ルールの要約です。内容に矛盾が生じた場合は、`docs/architecture/ls-total-test-system-design-v1.md`を正とし、本ファイルを更新してください。

---

## ① プロジェクト概要

- 正式名称: **LS総合テスト対策**。現行実装は「都立社会アプリ」（社会科・地理歴史のクイズアプリ）を土台に、段階的に発展させている。
- 対象教科: **社会**（日本地理・世界地理・歴史。実装済み）＋ **理科**（生物・化学・物理・地学。Phase3で追加済み、計266問）。
- 学習目的: **定期テスト対策** ＋ **都立高校入試対策**（学校別テスト範囲・入試範囲の両方に対応する設計、詳細は⑨命名規則参照）。
- 技術構成: GitHub Pages配信の静的サイト。ビルドツール・フレームワークなしの素のES Modules。Google Apps Script（GAS）＋ Google Sheetsと連携。
- 生徒管理: 生徒ID・氏名・学校・学年・在籍状態・ログイン情報は、**既存の生徒管理システム（外部GAS）がSingle Source of Truth**。本アプリ側に生徒情報を複製しない。学習履歴・問題別成績・ランキング等、本アプリ固有のデータのみ本アプリ側（GAS＋Sheets）で管理する。
- 正式リポジトリ: `https://github.com/minkyumimm-sketch/socialstudies`（GitHub Pages: `https://minkyumimm-sketch.github.io/socialstudies/`）。開発フォルダは`Documents\GitHub\ls-total-test`。

---

## ② 最優先原則（すべての作業に共通）

1. **既存機能を壊さない。**
2. **最小限の変更を優先する**（便乗修正・過剰な設計変更をしない）。
3. **責務分離を維持する**（③のレイヤー構造を守る）。
4. **`app.js`を肥大化させない**（新しいロジックは`core`/`renderers`/`services`/`features`等へ。`app.js`は配線役に徹する）。
5. **1バグ＝1コミット＝1push。** 複数の修正・大規模拡張と混ぜて同時に変更しない（Phase1.5Bで確立・実証済みの原則）。
6. **コミット・push・ブランチ作成は、ユーザーの指示があった場合のみ実行する。** Claude Codeが自己判断で行わない。

---

## ③ ディレクトリ構成と責務

| フォルダ | 責務 |
|---|---|
| `config/` | 静的マスタ定数（科目・出題形式・時代選択肢など） |
| `core/` | 画面非依存のドメインロジック（状態管理・CSV読込/正規化・出題選定・採点・画面遷移） |
| `data/` | CSV問題データ |
| `filters/` | フィルタUI連携（単元・分野・出題形式セレクトの動的同期） |
| `judges/` | 正誤判定（DOM非依存の純粋関数群） |
| `renderers/` | 出題形式別・地図クリック方式別のDOM描画 |
| `services/` | 外部連携（GAS通信・生徒データ） |
| `features/` | **Phase2以降に新設。** ランキング・苦手問題・タイマー・学校別テスト範囲・先生配信問題など、横断的な新機能を1機能＝1サブフォルダで格納する（`docs/architecture/ls-total-test-system-design-v1.md` 1.3節） |
| `docs/` | 分析・設計・仕様・運用ドキュメント（④参照） |

新規ファイルの置き場所に迷ったら、実装前にユーザーへ確認する。

---

## ④ ドキュメント参照先

| フォルダ | 役割 | 参照するタイミング |
|---|---|---|
| `docs/analysis/` | Phase0現状分析（`current-system-analysis.md`）・Phase0レビュー（`phase0-review.md`）。確定バグの根拠・優先順位・採点結果など | 現状把握、過去の判断の根拠確認 |
| `docs/architecture/` | 全体設計書Ver.1（`ls-total-test-system-design-v1.md`）、Phase単位の実装計画（`phase1.5b-implementation-plan-v1.md`等） | 設計判断の全体像、フェーズ実装前の確認 |
| `docs/specification/` | ドメインモデル・データスキーマ・GAS API契約・ランキング仕様の詳細 | 個別領域（データ構造・API・ランキング計算等）の詳細設計を確認するとき |
| `docs/operations/` | Git/GitHub運用の詳細（`git-github-operations-v1.md`）、問題管理運用の詳細（`question-management-v1.md`） | ブランチ・コミット・タグ・複数PC運用の具体手順を確認するとき（⑥は要約）／問題の追加・修正・Sheets↔CSV同期の具体手順を確認するとき |

---

## ⑤ データルール

### CSV
- `data/`配下のCSVは**1行目をヘッダー行とする前提**で実装されている（`core/question-loader.js`）。この前提を崩さない。
- 列の追加・削除・順序変更、実データ（問題文・選択肢・解説・答えなど）の編集は、**指示があった場合のみ**行う。
- 既存3ファイル（`japan_geo_questions.csv`/`world_geo_questions.csv`/`history_questions.csv`）の既存列は変更しない。新しい列は末尾に追加する形で後方互換を保つ（`docs/specification/data-schema-v1.md`）。
- 科目キー（`japan_geo`/`world_geo`/`history`）は不変。書き換えない。
- `status`列は`active`/`hidden`/`draft`/`archived`の4値のみを使用する。`inactive`は不採用（`docs/architecture/ls-total-test-system-design-v1.md` 5章、Phase1.5Bで対応済み）。

### 問題管理（Google Sheets正本）
- 問題内容の編集は、Google Sheets「LS総合テスト対策_問題マスター」（1科目1タブ）を正本とする。`data/*.csv`はGitHub Pages配信用の生成物であり、直接の編集対象ではない。本番アプリはGoogle Sheetsへ直接依存しない。
- Claude Codeが新規問題を作成する場合も、CSVを直接編集して完了とせず、Google Sheetsへ反映して人間が確認する運用に乗せる。
- Sheets編集後は、`scripts/compare-question-csv.mjs`でround-trip差分を確認し、`scripts/validate-questions.mjs`を通してから`data/*.csv`へ反映・commitする。
- 詳細な運用フロー・シート構成・入力規則・Sheets↔CSV同期ルールは`docs/operations/question-management-v1.md`を参照。

### SVG
- `assets/*.svg`のid・class・data-name・構造は、`renderers/map-click-prefecture.js`/`map-click-line.js`/`map-click-area.js`の描画ロジックと密結合している。編集する場合は、対応するCSV・`MAP_CONFIGS`との整合性を必ず確認し、同一SVGを使う全問題の回帰確認を行う。
- SVGを編集する前に、対象ファイルのローカルバックアップ（Git管理外でよい）を取る（確定バグ#4対応で確立した手順）。

### GAS
- `services/gas-service.js`の`GAS_WEB_APP_URL`、およびGAS連携仕様の変更は、必ず事前にユーザーへ相談する。
- 生徒管理システム（外部GAS。本アプリ用GASと同一プロジェクトの可能性があり未確認、`docs/architecture/...` 1.2節参照）が生徒情報のSingle Source of Truth。新規GAS APIは`docs/specification/gas-api-contract-v1.md`の契約を参照して設計する。

---

## ⑥ Git運用

- **ブランチ戦略**: GitHub Flow。`main`は常にGitHub Pagesへ反映されて問題ない状態を保つ。修正・機能追加は短命のfeatureブランチで行い、`main`へマージ後に削除する。
- **ブランチ命名**: `fix/<内容>`（バグ修正）、`phase<N>/<内容>`（フェーズ単位の機能追加）、`docs/<内容>`（ドキュメントのみ）、`chore/<内容>`（雑務）。
- **コミットメッセージ**: 軽量Conventional Commits（`fix:`/`feat:`/`docs:`/`chore:`/`refactor:`/`test:`）。バグ修正時は対応する確定バグ番号を本文に明記する（例: `fix: 出題形式フィルタのキー不一致を修正（確定バグ#1）`）。
- **レビュー**: 1人開発のため正式なPRレビューは必須にしないが、コミット前に必ず`git diff`をユーザーへ提示し、意図した範囲のみの変更であることを確認してから、ユーザーの指示でコミットする。
- **push**: `main`へのマージ後にpushし、マージ済みのfeatureブランチは削除する。
- 詳細は`docs/operations/git-github-operations-v1.md`を参照。

---

## ⑦ テスト方針（Phase1.5Bで確立した標準手順）

コード・出題ロジック・UIに影響する変更を行う場合、以下を標準手順とする。

1. **修正前の再現確認**: 可能な場合、現在のコードで不具合が実際に再現することを確認する。
2. **最小限の修正を実施**。
3. **実ブラウザでの回帰確認**:
   - リポジトリ内にNode製の最小限の静的サーバーを一時的に起動する（`package.json`不要、Node標準機能のみ）。
   - **リポジトリ外**（一時領域）にブラウザ自動操作ツール（例: playwright-core）を一時導入し、システムに既存のブラウザ（Chrome等）を使ってヘッドレスで実際の本番コードパスを実行する。
   - DOM状態・判定結果（正誤判定・フィルタ選択肢など）・コンソールエラーの有無を確認する。
   - 確認後、一時サーバー・一時導入したツールは片付ける（リポジトリには一切残さない）。
4. **`git diff`で変更が意図した対象ファイル・箇所のみであることを確認する。**
5. **`git status`で対象外ファイルが変更されていないことを確認する。**
6. 上記すべてをクリアしてから、ユーザーの指示でコミットする。

自動テスト基盤（`node:test`等）は現状未導入。導入時期・段階的な範囲は`docs/architecture/ls-total-test-system-design-v1.md` 15章を参照し、指示があるまで新規整備しない。

---

## ⑧ アーキテクチャ原則

- **`features/`追加方針**: Phase2以降の横断的な新機能（ランキング・苦手問題・タイマー・学校別テスト範囲・先生配信問題）は`features/<機能名>/`に集約する。既存の`core/`（出題エンジン）・`renderers/`（描画）の役割・意味は変えない。
- **責務分離**: 1ファイル1責務を維持する。出題形式ディスパッチ（`QUESTION_MODE_HANDLERS`）・地図描画戦略（`MAP_RENDERERS`）のようなテーブル駆動パターンは、新機能・新形式の追加時も踏襲する（既存パターンをif/elseの羅列に戻さない）。
- **依存方向**: `config` ← `core` ← (`filters`/`judges`/`renderers`/`services`/`features`) ← `app.js`。`app.js`はこれらを組み合わせる薄いエントリポイントであり、新規ロジックの置き場所にしない。`features/*`は`core/`のドメインロジックに依存してよいが、`renderers/`・`services/`の実装詳細に過度に依存しない。
- **設計思想**: CSV駆動の問題管理（問題追加にコード変更を要さない）を維持する。ビルドツール・フレームワークを新規に持ち込まない。既存の良い設計（戦略パターン、ディスパッチテーブル、CSVパーサ等）を尊重し、全面書き換えを提案・実行しない。

---

## ⑨ 命名規則

- **学習目的の正式名称は`coursePurposeId`とする。値は`regular_exam`（定期テスト対策）／`entrance_exam`（都立高校入試対策）を採用する。**
- **`studyType`（値: `regular_test`/`exam_prep`）は不採用。** 過去のローカル環境の一部で検討されていた名称だが、本プロジェクトでは使用しない。
- `mode`（`question.mode`／`MODE_FILTER_OPTIONS`）は**出題形式**（`text`/`choice`/`era`/`sort`/`map_click`）専用の名称として維持し、学習目的（`coursePurposeId`）と混同しない。
- 既存の科目キー（`japan_geo`/`world_geo`/`history`）は不変。将来の`fieldId`／`subjectId`体系は`docs/architecture/ls-total-test-system-design-v1.md` 3章、`docs/specification/domain-model-v1.md`を参照。

---

## ⑩ 注意事項

### 触れてはいけない／要相談な箇所
- `services/gas-service.js`の`GAS_WEB_APP_URL`、およびGAS連携仕様の変更（⑤参照）。
- CSV実データ（問題内容そのもの）の指示なしの書き換え。
- `renderers/map-click-prefecture.js`/`map-click-line.js`/`map-click-area.js`のSVG結合ロジック（各SVGファイルのid・class構造と密結合しており、変更すると広範囲の地図問題が同時に壊れるリスクが高い）。

### 個人情報の取り扱い
- 生徒の氏名・ID・回答履歴などの個人情報を扱う。ログ出力・コミットメッセージ・サンプルコードに実在の生徒名・得点等を含めない。

### 既知の技術的負債
- 確定バグ4件はPhase1.5Bで解消済み。それ以外の技術的負債・改善余地の詳細は、重複記載を避けるため本ファイルには書かず、`docs/analysis/current-system-analysis.md`・`docs/analysis/phase0-review.md`を参照すること。

---

## 開発フェーズ

正式なフェーズ定義は`docs/architecture/ls-total-test-system-design-v1.md` 16章を正本とする。矛盾が生じた場合は同章を優先し、以下は要約に留める（各Phaseの目的・完了条件等の詳細は同章参照）。

- Phase0 現状分析（完了）
- Phase1 設計（完了）
- Phase1.5 安定化フェーズ／確定バグ修正（完了）
- Phase2 基盤整備（生徒ID・学校・学年・学習履歴）
- Phase3 理科・社会統合（完了。理科4分野・計266問を追加済み）
- Phase4 学校別テスト範囲
- Phase5 学習分析（苦手問題・おすすめ問題・履歴）
- Phase6 ランキング
- Phase7 時間制限・タイムアタック
- Phase8 画像・地図・並び替え強化
- Phase9 先生配信問題

## Current Phase

Phase3は完了。Phase8のうち画像付きchoice問題（40問）はPhase3完了後に前倒しで実装済みだが、実験手順並び替え・地図問題拡張は未着手のためPhase8全体は未完了。次に着手すべき本来の実装対象はPhase4（学校別テスト範囲）。
