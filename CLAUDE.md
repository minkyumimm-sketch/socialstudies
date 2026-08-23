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
| `docs/operations/` | Git/GitHub運用の詳細（`git-github-operations-v1.md`）、問題管理運用の詳細（`question-management-v1.md`）、TestSet専用GAS/Spreadsheet構築手順（`test-set-gas-setup-v1.md`） | ブランチ・コミット・タグ・複数PC運用の具体手順を確認するとき（⑥は要約）／問題の追加・修正・Sheets↔CSV同期の具体手順を確認するとき／Phase4 TestSetのGAS・Spreadsheetを新規構築するとき |

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
- Phase5 学習分析（苦手問題・おすすめ問題・履歴）＋通常学習の想起ファーストUX実装
- Phase6 問題マスター大規模拡充（Task51.5で新設）
- （Phase6→Phase7ゲート）教室実機試用（Task51.5で新設）
- Phase7 スピードラン＋ランキング（Task51.5で旧Phase6「ランキング」＋旧Phase7「時間制限・タイムアタック」を統合）
- Phase8 （廃止、Task51.5。旧「画像・地図・並び替え強化」はPhase5/Phase6へ統合） ※番号は欠番とし、Phase9はそのまま維持
- Phase9 先生配信問題

## Current Phase

Phase3は完了。Phase8のうち画像付きchoice問題（40問）はPhase3完了後に前倒しで実装済み（実装済みのままPhase5「画像要素の付加方針」へ位置づけを整理、Task51.5）。

**Phase4（学校別テスト範囲）は完了。** Task56（2026-08-16実施）で本番active TestSet（`TS002`／伊興中学校／中2／`physics`3問）を使った最終E2Eを実施し、講師のTestSet作成〜生徒のTestSet実行〜History/Weakness/AnswerRecordとの既存経路統合まで、完了条件を満たすことを確認済み（詳細は`docs/architecture/ls-total-test-system-design-v1.md` 16章Phase4節「Task56実施結果」を参照）。E2Eに伴い判明した2件の既知事項（Home統計の再計算タイミング、Attempt/AnswerRecordの永続化方式）はTestSet固有の不具合ではなく、`docs/analysis/current-system-analysis.md` 11章・`docs/specification/domain-model-v1.md` 3.12.1節に記録済み。いずれもPhase4時点ではコード修正しない（前者はPhase5改善候補、後者は将来の技術的負債として記録）。

**Phase5（学習分析＋通常学習の想起ファーストUX実装）は次Phase。**

**Phase5-0（永続化設計確定・docs修正）を実施し、設計を確定した（2026-08-16実施・docs更新のみ、実装は未着手）。** 要点：
- Attempt/AnswerRecordの永続化先として、既存`saveRecord`（`services/gas-service.js`）を改造せず、**新規のAttempt/AnswerRecord専用GAS Web App＋専用Google Spreadsheetを追加**する（TestSet専用GASを既存本番GASと分離した方針を踏襲）。既存`saveRecord`は当面維持し新経路と並走させる（永久並走にはしない、停止時期は実機安定確認後に別途判断）。
- `features/storage/gas-storage.js`をStorageInterfaceへ単純DI差し替えする方式は不採用（同期StorageInterfaceと非同期GAS fetchの不一致のため）。**MemoryStorageを同期キャッシュ、GASを非同期永続化先**として併存させる（書き込み: Memory即時＋GAS非同期送信、読み込み: 生徒選択時にGASから一括取得しMemoryへ復元）。
- `features/weakness/`（既存実装：`weakness-rules.js`/`weakness-service.js`/`weakness-quiz-bridge.js`）を正式採用する。旧docsの`features/weak-questions/`という名称は新設しない（実装実態に合わせる）。
- Attemptへ`sourceType`（`normal`/`weak_review`/`dormant_review`/`testset`）・`testSetId`（TestSet起点のみ値あり）をオプション属性として追加する設計を確定。`schoolId`/`gradeId`/`academicYearId`はAttemptへ重複保存しない（`testSetId`経由の逆引きで対応）。

**Phase5-1（Home画面統計の再計算タイミング改善）は実装済み。** `app.js`に`returnToHome()`統一関数を新設し、History画面・講師画面・学校のテスト対策画面・start-screenの「ホームへ戻る」4経路すべてをこの関数へ統一。studentId選択中は`renderHomeForStudent()`を呼び直してHome統計（学習日数・苦手問題数等）を即時最新化する（GAS通信は増えない、`renderHomeForStudent`は同期・MemoryStorageのみ参照のため）。

**Phase5-2（Attempt/AnswerRecord専用GAS/Spreadsheet構築）は完了（2026-08-23実施）。** 新規Google Spreadsheet「LS総合テスト対策_学習記録」（`attempts`/`answer_records`の2シート、`docs/specification/data-schema-v1.md` §10準拠のヘッダー）と、新規Apps Scriptプロジェクト「LS総合テスト対策_学習記録API」（`Code.gs`/`SheetHelpers.gs`の本番2ファイル＋回帰テスト用`Test.gs`の3ファイル構成）を構築した。`startAttempt`/`saveAnswerRecord`/`completeAttempt`/`getStudentHistory`の4API（`docs/specification/gas-api-contract-v1.md` §5.1〜5.4）を実装し、`attempts`は`attemptId`主キー、`answer_records`は`attemptId`+`questionId`複合キーでのupsert、必須項目・値のvalidation、`LockService`による書き込み排他、ヘッダー整合性検証を備える。Apps Scriptエディタ上での内部単体テスト9件（正常系・upsert・存在しないAttemptへの操作拒否・validation・header validation）が全件成功。Web Appとしてdeploy済みで、外部HTTP経由の9ケーステスト（内部テストと同項目）も全件成功し、実Spreadsheet上でのupsert動作（同一キー再送で行が増殖しないこと）を目視確認済み。テスト用架空データ（内部テスト用`TEST_PHASE5_001`系・HTTPテスト用`TEST_PHASE5_HTTP_001`系、いずれも実在生徒データではない）はテスト後にcleanup済みで、現在両シートともデータ0件（ヘッダー行のみ）。既存の生徒管理・解答保存用GAS（`services/gas-service.js`）、TestSet専用GAS、既存学習記録Spreadsheetへの変更は一切なし。Web App URLはPhase5-3で`config/learning-record-gas-config.js`へ接続済み。

**Phase5-3（MemoryStorageへの書き込み時、新規GASへの非同期送信を追加）は完了（2026-08-23実施）。** 新規`config/learning-record-gas-config.js`（Web App URL）・`services/learning-record-service.js`（`startAttempt`/`saveAnswerRecord`/`completeAttempt`の3POSTラッパーのみ、`getStudentHistory`は未実装）・`features/history/learning-record-sync-integration.js`（送信順序制御）を新設し、既存`quiz-start-integration.js`/`answer-record-integration.js`/`attempt-complete-integration.js`の末尾へ1行ずつ追加してfire-and-forget送信を配線した（`app.js`は無変更）。MemoryStorage同期キャッシュはそのまま維持し、新GAS送信は保存成功後に非同期で行う（GAS通信失敗時もconsole.errorのみでQuizは継続、retry queueは実装しない）。`startAttempt`のPromiseを`Map<attemptId, Promise>`で追跡し、`saveAnswerRecord`/`completeAttempt`は対応する`startAttempt`の完了を待ってから送信する順序制御を実装（新GAS側の「該当attemptIdなし」エラーを回避）。`sourceType`/`testSetId`はPhase5-6で配線予定のため未送信、`getStudentHistory`によるMemoryStorage復元はPhase5-4で実装予定のため未着手。既存`saveRecord`（legacy GAS）・TestSet専用GASは無改修のまま並走を継続。実装過程で発見した既存バグ「`Attempt.startedAt`が常にnullで送信される」（`quiz-start-integration.js`の`createAttempt()`呼び出しが`startedAt`を渡していなかったため、Phase2 Task14-1由来）は、Phase5-3とは別コミット（`1078b93`「fix: record attempt start time」）で先に修正済み。headless Chrome（playwright-core）による実ブラウザ回帰テストで検証（新GAS・既存GAS・TestSet専用GASはすべてモック、本番Spreadsheetへの書き込みなし）。

**Phase5-4（生徒選択時に新学習記録GASから過去のAttempt/AnswerRecordを取得しMemoryStorageへ復元）は完了（2026-08-23実施）。** `services/learning-record-service.js`へ`fetchStudentLearningRecords(studentId)`（GET、`action=getStudentHistory`）を追加した（既存POST3関数は無変更）。新規`features/history/learning-record-restore-integration.js`の`restoreStudentLearningRecords(studentId)`が、取得した`attempts`/`answerRecords`を既存`createAttempt`/`saveAttempt`・`createAnswerRecord`/`saveAnswerRecord`経由でAttempt/AnswerRecord Repositoryへupsertする（`attemptId`／`attemptId::questionId`の既存keyベースupsertをそのまま利用、`memoryStorage.clear()`は不使用）。`app.js`は`handleHomeStudentSelect()`のみ配線：生徒選択時にまず現状のMemoryStorageでHomeを即時表示（既存`renderHomeForStudent()`と同じ同期呼び出し）し、裏で復元をfire-and-forget実行、成功時のみ「復元完了時点でも選択中studentIdが復元対象と一致している場合」に限りHomeを再描画する（生徒切替中の誤上書きを防ぐガード）。生徒選択時のみ取得し、`returnToHome()`は無変更のままGAS再取得を行わない。GAS取得失敗時はconsole.errorのみでMemoryStorageは現状維持し、生徒選択・通常学習は継続可能（「履歴取得失敗」と「履歴0件」を区別し、失敗時に0件で上書きすることはない）。`sourceType`/`testSetId`はAttemptモデルが未対応のため今回も配線せず（Phase5-6予定、GASレスポンスに含まれていても`createAttempt()`通過後は自動的に除外されることを実機確認済み）。実GAS（本番Web App URL、架空ID使用）で`completed`/`isCorrect`がJSON boolean型（`"TRUE"`/`"FALSE"`文字列ではない）で返ることを実測確認済み。headless Chromeによるブラウザテスト（Case1〜13、モックGAS）32/32 OK、Attempt/AnswerRecordモデル単体確認（Case14）・実GAS boolean型確認（Case15）もOK。A/B生徒切替競合・復元中Quiz開始競合・returnToHome非再取得・GAS失敗時継続・375px幅表示、いずれも実機確認済み。テストで本番Spreadsheetへ書き込んだ架空データ（`TEST_PHASE5_4_...`系）はテスト後にユーザーがcleanup済み（実在生徒データは未使用）。**Phase5-5（ブラウザリロードを跨いだ永続履歴復元の本番E2E確認）はまだ未着手。**

詳細な設計内容は`docs/architecture/ls-total-test-system-design-v1.md`（Phase5節・10.4節）、`docs/specification/domain-model-v1.md`（3.11/3.12節）、`docs/specification/gas-api-contract-v1.md`（5章）、`docs/specification/data-schema-v1.md`（10章）を参照。

Phase4はTask47（2026-08-13）でTestSet方式へ再設計済み。studentIdから学校・学年を自動判定せず、講師が問題マスターから問題を選定してTestSet（questionId固定集合）として保存し、生徒が学校・学年・TestSetを自ら選択して実行する。詳細は`docs/architecture/ls-total-test-system-design-v1.md` 9章を参照。

Task50（2026-08-13）でTestSetの保存・取得方式を確定：TestSet専用GAS Web App＋専用Google Spreadsheetを新設し、既存GAS（生徒一覧・解答保存用）とは完全に分離する。問題マスターは引き続きGitHub Pages CSV方式を維持する。TestSetに個人情報（studentId・氏名等）は保存しない。詳細なAPI仕様は`docs/specification/gas-api-contract-v1.md` 9章、構築手順は`docs/operations/test-set-gas-setup-v1.md`を参照。次のTaskはTask52（TestSet専用Spreadsheet＋GAS API基盤構築）。

Task51.5（2026-08-15、方針確定のみ・実装は未着手）で、Phase4以降のロードマップを整理した。通常学習は今後「問題表示→思い出せた/わからない→選択肢表示→回答」という想起ファーストUXを基本とする（既存`text`問題・rendererは削除しない、変換もしない）。想起状態と正誤は別概念として扱い、復習対象は「不正解 OR わからない→選択肢表示後に正解」とする。画像は独立した出題modeにせず既存modeへの付加要素とする（`map_click`のみ既存どおり独立維持）。通常学習とスピードランは明確に分離し、スピードランはPhase7へ位置づける。Phase6として「問題マスター大規模拡充」を新設し、その後に「教室実機試用」という独立ゲートを置く。詳細は`docs/architecture/ls-total-test-system-design-v1.md` 4.3節・10.3節・13.3節・16章を参照。

Task52（2026-08-15完了）でTestSet専用Google Spreadsheet・GAS Web Appを実際に構築し、`getSchools`/`getTestSets`/`getTestSet`/`saveTestSet`/`archiveTestSet`の5APIすべてを実環境で単体疎通確認済み（`school_master`に`SC001`登録済み、疎通確認用`TS001`は`archived`のまま記録として保持）。既存GASは無変更。詳細は`docs/operations/test-set-gas-setup-v1.md`を参照。

Task53（2026-08-15完了）で講師用問題選定UI（`teacher-screen`、`features/teacher/`）をLSアプリへ実装。学校選択→学年→学年度(自動算出)→テスト回→セット名→教科ごとのunit/subunit絞り込み→checkbox選定（教科横断で選択保持）→`saveTestSet`保存、のフローが動作する。**TestSet専用GAS Web App URLは秘密情報ではないため`config/test-set-gas-config.js`へ実値をrepository保持する方針へ確定**（既存`GAS_WEB_APP_URL`と同じ扱い）。講師PINは引き続きrepository・コードのどこにも保持せず、teacher-screenでのその場入力のみ。既存の生徒学習フロー・画面は無変更。

Task54（2026-08-15完了）で生徒用TestSet選択UI（`test-set-student-screen`、`features/test-set-student/`）を実装。学校選択→学年→TestSet一覧→開始前確認までの導線が動作する。studentIdからschoolId/gradeIdを自動判定しない（生徒がその都度自己選択）。「このテスト対策を始める」ボタンはTask55への接続点として明示的に分離されているが、Task54時点ではQuiz開始へは未接続（一時メッセージのみ）。

Task55（2026-08-15完了）でTestSet→既存QuestionSet/Attempt接続を実装。`features/test-set-runner/`がTestSetを`fieldId`ごとにグループ分割し、既存の単一fieldId Attempt実行フロー（`startAttemptForQuiz`/`completeAttempt`等、無改修）をグループ数だけ連続実行する（QuestionSetモデルの単一fieldId制約は維持）。生徒からは1つのTestSetとして連続実行に見える。最終グループ完了後は`test-set-student-screen`の完了ステップで問題数/正解数/不正解数を表示（既存`result-screen`はTestSet実行中は使わない）。History/Weaknessは既存のAttempt/AnswerRecord経路をそのまま通るため無改修で反映される（実地確認済み）。次はTask56（本番active TestSetでの最終E2E・375px総点検・Phase4最終レビュー）。
