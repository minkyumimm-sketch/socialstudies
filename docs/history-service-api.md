# HistoryService API

対象ファイル: `features/history/history-service.js`
作成: Phase2（Task16-1〜16-18）完了時点の公開API整理（Phase3着手前のドキュメント化のみ、コード変更なし）

---

## 概要

### HistoryServiceの役割

- QuestionSet・Attempt・AnswerRecordという3つのドメインの「保存済みデータの取得（読み取り専用）」を1箇所に統合するファサードService。
- 保存（save）・生成（create）は一切行わない。取得・集計・並び替えのみを担当する。
- UI（`app.js`）や今後の画面（ホーム画面・履歴画面・プロフィール・ダッシュボード等）は、`features/repository/`・`features/storage/`・各ドメインの個別Service（`attempt-service.js`・`answer-record-service.js`・`question-set/question-set-service.js`）へ直接アクセスせず、本HistoryServiceだけを見れば学習履歴に関する情報を取得できる構造にする。

### 依存関係

```
config
  ↓
core
  ↓
features/history/attempt-service.js ─┐
features/history/answer-record-service.js ─┤→ features/history/history-service.js → app.js（今後）
features/question-set/question-set-service.js ─┘
```

- HistoryServiceが直接importするのは、上記3つの既存Serviceの読み取り系APIのみ（`loadAttempt`・`loadAttemptsByStudent`・`loadAnswerRecordsByAttempt`・`loadQuestionSet`）。
- `features/repository/`・`features/storage/`へは一切直接アクセスしない。
- Task16-2以降に追加した公開APIは、原則としてHistoryService内の既存公開API（`getStudentHistory`等）や、さらに上位の既存公開API（`getStudyDayCount`・`getLatestAttempt`等）にのみ依存し、Repository・Storage・各ドメインServiceへ新たに直接アクセスすることはない（各APIのJSDocに明記済み）。

### 利用方針

- 新しい画面・機能からHistoryServiceの情報を使う場合は、まず本一覧から目的に合うAPIを探し、無ければ「①基礎的な取得API」を組み合わせて新しい公開APIを追加する（既存の比較・集計・探索ロジックの重複実装はしない。非公開ヘルパー `getRecencyKey` / `compareTimestamps` / `sortHistoryByRecency` / `getMaxTimestamp` / `findLatestHistoryEntry` / `summarizeHistory` / `getDatePart` / `toUtcDayTimestamp` が既に存在するため、日付比較・並び替え・集計処理を新規実装する前に必ず確認する）。
- 保存・生成・削除など、読み取り以外の責務は今後もHistoryServiceに追加しない（既存の設計方針を維持する）。

---

## 一覧

### 履歴取得

学習履歴（Attempt・QuestionSet・AnswerRecordの組）そのものを取得する基礎的なAPI群。

#### `getAttempt(attemptId)`
- 引数: `attemptId: string`
- 返り値: `Attempt | null`
- 内部で利用している既存API: `attempt-service.js` の `loadAttempt()`

#### `getAttemptsByStudent(studentId)`
- 引数: `studentId: string`
- 返り値: `Attempt[]`
- 内部で利用している既存API: `attempt-service.js` の `loadAttemptsByStudent()`

#### `getAnswerRecordsForAttempt(attemptId)`
- 引数: `attemptId: string`
- 返り値: `AnswerRecord[]`
- 内部で利用している既存API: `answer-record-service.js` の `loadAnswerRecordsByAttempt()`

#### `getQuestionSetForAttempt(attempt)`
- 引数: `attempt: Attempt`
- 返り値: `QuestionSet | null`
- 内部で利用している既存API: `question-set-service.js` の `loadQuestionSet()`

#### `getAttemptDetail(attemptId)`
- 引数: `attemptId: string`
- 返り値: `{ attempt, questionSet, answerRecords } | null`（AttemptDetail）
- 内部で利用している既存API: `getAttempt()` / `getQuestionSetForAttempt()` / `getAnswerRecordsForAttempt()`

#### `getStudentHistory(studentId)`
- 引数: `studentId: string`
- 返り値: `AttemptDetail[]`（`{ attempt, questionSet, answerRecords }` の配列）
- 内部で利用している既存API: `getAttemptsByStudent()` / `getQuestionSetForAttempt()` / `getAnswerRecordsForAttempt()`
- 備考: Task16-2以降のほぼ全ての公開APIの起点となる、学習履歴取得の中核API。

#### `getLatestAttempt(studentId)`
- 引数: `studentId: string`
- 返り値: `AttemptDetail | null`（`completedAt`優先・無ければ`startedAt`で比較した最新1件）
- 内部で利用している既存API: `getStudentHistory()`（＋非公開ヘルパー `findLatestHistoryEntry`）

#### `getStudentHistoryList(studentId, options = {})`
- 引数: `studentId: string`, `options: { order?: "asc"|"desc", limit?: number }`
- 返り値: `{ studentId, totalCount, items: AttemptDetail[] }`
- 内部で利用している既存API: `getStudentHistory()`（＋非公開ヘルパー `sortHistoryByRecency`）
- 備考: `order`省略時は`"desc"`（新しい順）。`limit`は数値のみ有効。

#### `hasHistory(studentId)`
- 引数: `studentId: string`
- 返り値: `boolean`（Attemptが1件以上存在するか）
- 内部で利用している既存API: `getStudentHistory()`（`.length`確認のみ）

---

### 集計

学習履歴を数値・件数として集計するAPI群。

#### `getStudentHistorySummary(studentId)`
- 引数: `studentId: string`
- 返り値: `{ studentId, attemptCount, completedAttemptCount, totalQuestions, answeredQuestions, correctAnswers, overallCorrectRate, latestAttempt, latestCompletedAt }`
- 内部で利用している既存API: `getStudentHistory()`（＋非公開ヘルパー `summarizeHistory`）

#### `getHistoryOverview(studentId)`
- 引数: `studentId: string`
- 返り値: `{ hasHistory, firstStudyDate, latestStudyDate, totalStudyDays, currentStudyStreak, daysSinceLastStudy }`
- 内部で利用している既存API: `hasHistory()` / `getStudyPeriod()` / `getCurrentStudyStreak()` / `getDaysSinceLastStudy()`
- 備考: ホーム画面・プロフィール・ダッシュボードが「このAPIだけ」で主要情報を取得できるようにするための統合窓口。

---

### 日付

学習日（`YYYY-MM-DD`）を基準とした集計・判定API群。いずれも新たな履歴探索を行わず、`getStudyDayCount()`が返す重複なし昇順の`studyDates`配列を再利用する。

#### `getStudyDayCount(studentId)`
- 引数: `studentId: string`
- 返り値: `{ totalStudyDays, studyDates: string[] }`（`studyDates`は`YYYY-MM-DD`の重複なし昇順配列）
- 内部で利用している既存API: `getStudentHistory()`（＋非公開ヘルパー `getRecencyKey` / `getDatePart`）
- 日付取得ルール: `completedAt`優先、無ければ`startedAt`、どちらも無ければそのAttemptは除外。

#### `getLatestStudyDate(studentId)`
- 引数: `studentId: string`
- 返り値: `string | null`（`YYYY-MM-DD`、無ければ`null`）
- 内部で利用している既存API: `getStudyDayCount()`（`studyDates`の末尾）

#### `getFirstStudyDate(studentId)`
- 引数: `studentId: string`
- 返り値: `string | null`（`YYYY-MM-DD`、無ければ`null`）
- 内部で利用している既存API: `getStudyDayCount()`（`studyDates`の先頭）

#### `getStudyPeriod(studentId)`
- 引数: `studentId: string`
- 返り値: `{ firstStudyDate, latestStudyDate, totalStudyDays }`
- 内部で利用している既存API: `getFirstStudyDate()` / `getLatestStudyDate()` / `getStudyDayCount()`

#### `getCurrentStudyStreak(studentId)`
- 引数: `studentId: string`
- 返り値: `{ currentStreak, latestStudyDate }`
- 内部で利用している既存API: `getStudyDayCount()`（＋非公開ヘルパー `toUtcDayTimestamp`）
- 判定ルール: 最新日から1日ずつ遡り、日付が連続する限りカウント。1日でも空けば打ち切り。

#### `getDaysSinceLastStudy(studentId, today = new Date())`
- 引数: `studentId: string`, `today?: Date`（省略時は現在時刻）
- 返り値: `{ latestStudyDate, daysSinceLastStudy }`（`latestStudyDate`が無ければ両方`null`）
- 内部で利用している既存API: `getLatestStudyDate()`（＋非公開ヘルパー `getDatePart` / `toUtcDayTimestamp`）

---

### 科目別

`fieldId`（`japan_geo` / `world_geo` / `history` 等）単位で学習履歴を扱うAPI群。`fieldId`はAttempt自体ではなくQuestionSet側の情報のため、いずれもQuestionSetの有無を踏まえた実装になっている。

#### `getStudentHistoryByField(studentId, fieldId)`
- 引数: `studentId: string`, `fieldId: string`
- 返り値: `{ studentId, fieldId, attempts: AttemptDetail[], summary }`（`summary`は`getStudentHistorySummary()`と同じ形）
- 内部で利用している既存API: `getStudentHistory()`（＋非公開ヘルパー `summarizeHistory`）

#### `getLatestField(studentId)`
- 引数: `studentId: string`
- 返り値: `{ fieldId, questionSetId, version, completedAt, startedAt } | null`
- 内部で利用している既存API: `getLatestAttempt()`
- 備考: QuestionSetが見つからない場合は`fieldId`のみ`null`（関数全体が`null`になるのはAttemptが1件も無い場合のみ）。

#### `getStudiedFields(studentId)`
- 引数: `studentId: string`
- 返り値: `{ fieldId, attemptCount, latestCompletedAt, latestStartedAt }[]`（`fieldId`昇順）
- 内部で利用している既存API: `getStudentHistory()`（＋非公開ヘルパー `getMaxTimestamp`）

---

### ダッシュボード

画面表示用に、複数の既存APIの結果を1回でまとめて取得する統合API群。いずれも新たな履歴探索を行わない。

#### `getHistoryDashboard(studentId)`
- 引数: `studentId: string`
- 返り値: `{ overview, studiedFields, latestAttempt }`
- 内部で利用している既存API: `getHistoryOverview()` / `getStudiedFields()` / `getLatestAttempt()`

#### `getFieldDashboard(studentId, fieldId)`
- 引数: `studentId: string`, `fieldId: string`
- 返り値: `{ fieldId, summary, latestAttempt }`
- 内部で利用している既存API: `getStudentHistoryByField()` / `getLatestAttempt()`
- 備考: `latestAttempt`は、全科目を通じた最新Attempt（`getLatestAttempt()`の結果）が指定`fieldId`と一致する場合のみ返し、一致しなければ`null`。

#### `getFieldDashboards(studentId)`
- 引数: `studentId: string`
- 返り値: `getFieldDashboard()`と同じ形の配列（`getStudiedFields()`と同じ順序＝`fieldId`昇順）
- 内部で利用している既存API: `getStudiedFields()` / `getFieldDashboard()`

---

## 現在のHistoryServiceで取得できる情報

- **単一Attemptの詳細**: Attempt本体、参照しているQuestionSet、紐づくAnswerRecord一覧（`getAttempt` / `getQuestionSetForAttempt` / `getAnswerRecordsForAttempt` / `getAttemptDetail`）
- **生徒の学習履歴一覧**: 全件（`getStudentHistory`）、新しい順・古い順・件数制限付き（`getStudentHistoryList`）、直近1件（`getLatestAttempt`）、有無の判定（`hasHistory`）
- **生徒の学習成績サマリー**: Attempt数・完了数・出題数・解答数・正答数・正答率・最新Attempt（`getStudentHistorySummary`）
- **科目（fieldId）別の情報**: 科目ごとのAttempt一覧・サマリー（`getStudentHistoryByField`）、直近学習していた科目の簡易情報（`getLatestField`）、学習済み科目の一覧と科目別件数・最終日時（`getStudiedFields`）
- **学習日・学習期間**: 学習した日付の一覧と累計日数（`getStudyDayCount`）、最新／最初の学習日（`getLatestStudyDate` / `getFirstStudyDate`）、学習期間まとめ（`getStudyPeriod`）、連続学習日数（`getCurrentStudyStreak`）、前回学習からの経過日数（`getDaysSinceLastStudy`）
- **画面表示用の統合情報**: 学習状況の主要指標まとめ（`getHistoryOverview`）、ホーム画面トップ用の一括情報（`getHistoryDashboard`）、科目別カード用の一括情報（`getFieldDashboard` / `getFieldDashboards`）

以上、公開API 23件（Task16-1〜16-18で追加・整備）。
