# HomeService API

対象ファイル: `features/home/home-service.js`
作成: Phase2 Task17-1〜17-12完了時点の公開API整理（コード変更なし、ドキュメント化のみ）

---

## 概要

### HomeServiceの役割

- **ホーム画面という特定の画面**が必要とする情報を、HistoryServiceの公開APIを組み合わせて取得するFacade Service。
- HistoryServiceのように学習履歴データ自体を取得・集計するドメインロジックは持たない。**既存APIの呼び出し・組み合わせに徹する**（新しい集計・探索・比較ロジックを実装しない）。
- UI（`app.js`）とはまだ接続していない（Phase2時点ではAPI提供のみ）。

### 依存関係

```
config
  ↓
core
  ↓
features/history/history-service.js
  ↓
features/home/home-service.js → app.js（今後）
```

- HomeServiceが直接importするのは`features/history/history-service.js`の公開APIのみ（`getHistoryDashboard`・`getHistoryOverview`・`getLatestAttempt`・`getStudyPeriod`・`getCurrentStudyStreak`・`getStudiedFields`・`getFieldDashboards`）。
- `features/repository/`・`features/storage/`・`AttemptService`・`AnswerRecordService`・`QuestionSetService`へは一切直接アクセスしない。
- HomeService内の一部API（`hasHomeData`・`getHomeLatestAttempt`・`getHomeFieldList`・`getHomeFieldDashboards`・`getHomeOverviewData`・`getHomeDashboard`・`getHomeInitialData`・`getAvailableHomeSections`）は、HistoryServiceを直接呼ばず、**HomeService内の他の公開APIにのみ依存**する（HomeService内での多層合成）。

### 利用方針

- 新しい画面用データが必要になった場合は、まずHomeService内の既存APIで組み合わせられないか検討し、無ければHistoryServiceの該当APIを直接利用する新規APIを追加する。
- HomeServiceに独自の集計・比較・探索ロジックを持ち込まない（そのようなロジックが必要になった場合はHistoryService側に追加する）。

---

## 公開API一覧

### `getHomeData(studentId)`
- 引数: `studentId: string`
- 返り値: `{ historyDashboard }`
- 内部利用API: `getHistoryDashboard()`（HistoryService）
- 備考: `historyDashboard`は`getHistoryDashboard(studentId)`の返り値をそのまま格納。

### `getHomeOverview(studentId)`
- 引数: `studentId: string`
- 返り値: `{ historyOverview, latestAttempt }`
- 内部利用API: `getHistoryOverview()` / `getLatestAttempt()`（いずれもHistoryService）

### `getHomeStudyInfo(studentId)`
- 引数: `studentId: string`
- 返り値: `{ studyPeriod, studyStreak }`
- 内部利用API: `getStudyPeriod()` / `getCurrentStudyStreak()`（いずれもHistoryService）

### `getHomeFields(studentId)`
- 引数: `studentId: string`
- 返り値: `{ studiedFields, fieldDashboards }`
- 内部利用API: `getStudiedFields()` / `getFieldDashboards()`（いずれもHistoryService）
- 備考: `getFieldDashboards()`は`(studentId, fieldIds)`の2引数仕様のため、`getStudiedFields(studentId)`の結果から`fieldId`一覧を組み立てて渡している。

### `getHomeDashboard(studentId)`
- 引数: `studentId: string`
- 返り値: `{ overview, studyInfo, fields, historyDashboard }`
- 内部利用API: `getHomeOverview()` / `getHomeStudyInfo()` / `getHomeFields()` / `getHomeData()`（いずれもHomeService。HistoryServiceは直接呼ばない）

### `getHomeInitialData(studentId)`
- 引数: `studentId: string`
- 返り値: `{ dashboard }`
- 内部利用API: `getHomeDashboard()`（HomeService）

### `getAvailableHomeSections(studentId)`
- 引数: `studentId: string`
- 返り値: `{ overview, studyInfo, fields, dashboard }`
- 内部利用API: `getHomeOverview()` / `getHomeStudyInfo()` / `getHomeFields()` / `getHomeDashboard()`（いずれもHomeService）

### `hasHomeData(studentId)`
- 引数: `studentId: string`
- 返り値: `boolean`
- 内部利用API: `getHomeOverview()`（HomeService）。`historyOverview.hasHistory`を返す。

### `getHomeLatestAttempt(studentId)`
- 引数: `studentId: string`
- 返り値: `AttemptDetail | null`
- 内部利用API: `getHomeOverview()`（HomeService）。`latestAttempt`を返す。

### `getHomeFieldList(studentId)`
- 引数: `studentId: string`
- 返り値: `studiedFields`配列
- 内部利用API: `getHomeFields()`（HomeService）。`studiedFields`を返す。

### `getHomeFieldDashboards(studentId)`
- 引数: `studentId: string`
- 返り値: `fieldDashboards`配列
- 内部利用API: `getHomeFields()`（HomeService）。`fieldDashboards`を返す。

### `getHomeOverviewData(studentId)`
- 引数: `studentId: string`
- 返り値: `{ hasHomeData, latestAttempt, studyInfo }`
- 内部利用API: `hasHomeData()` / `getHomeLatestAttempt()` / `getHomeStudyInfo()`（いずれもHomeService）

---

## 現在のHomeServiceで取得できる情報

- **画面トップ全部入り**: `getHomeData` / `getHomeDashboard` / `getHomeInitialData` / `getAvailableHomeSections`（粒度・呼び出し窓口が異なるバリエーション）
- **上部概要表示**: `getHomeOverview` / `hasHomeData` / `getHomeLatestAttempt` / `getHomeOverviewData`
- **学習日数情報**: `getHomeStudyInfo`
- **科目情報**: `getHomeFields` / `getHomeFieldList` / `getHomeFieldDashboards`

公開API 12件（Task17-1〜17-12で追加）。
