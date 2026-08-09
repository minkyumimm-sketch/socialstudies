# WeaknessService API

対象ファイル: `features/weakness/weakness-rules.js`（判定ルール）・`features/weakness/weakness-service.js`（Facade）
作成: Phase2 Task18-1〜18-5完了時点の公開API整理（Task18-6、コード変更なし・ドキュメント化のみ）

---

## 1. WeaknessServiceの役割

WeaknessServiceは、**HistoryServiceが提供する学習履歴（AnswerRecord）から、苦手問題・復習推奨（久しぶり）問題を判定して返す読み取り専用のFacade Service**である。

- `docs/architecture/ls-total-test-system-design-v1.md` 10章（苦手問題・おすすめ問題）の初期ルールベース案を実装したもの。
- HistoryService・HomeServiceと同じ設計思想（Repository・Storageへは一切直接アクセスせず、既存Serviceの公開APIのみを組み合わせる薄いFacade）を踏襲する。
- 学習履歴データ自体の取得・並び替え・日付集計はHistoryServiceの責務のままとし、WeaknessServiceは「questionId単位に集約した上で、苦手・復習推奨の判定を加える」という新しい軸（問題単位の判定）のみを担当する。

## 2. HistoryServiceとの責務分離

| | HistoryService | WeaknessService |
|---|---|---|
| 集約の軸 | 生徒（studentId）単位、Attempt単位、fieldId（科目）単位 | questionId（問題）単位 |
| 提供する情報 | 学習履歴の生データ・集計・日付情報 | 苦手判定・復習推奨判定というドメイン固有の評価結果 |
| データ取得元 | Repository経由のAttempt/AnswerRecord/QuestionSet | HistoryServiceの公開API（`getStudentHistory()`）のみ |

WeaknessServiceは`getStudentHistory()`が返す`AttemptDetail[]`（`{attempt, questionSet, answerRecords}`の配列）を唯一のデータ取得元とし、HistoryServiceのドメインロジック（学習日付計算・並び替え・科目集約等）を再実装しない。questionId単位の解答統計（`QuestionStats`）への集約は、HistoryServiceにまだ存在しない新しい集約軸のため、WeaknessService内の非公開ヘルパー（`buildQuestionStatsList`）としてのみ実装している。

## 3. 読み取り専用であること

`weakness-rules.js`・`weakness-service.js`のいずれにも`save`・`create`・`delete`に相当する処理は存在しない。全ての公開APIは`get*`（取得）または`has*`（存在確認）の形であり、保存・生成・削除は一切行わない。

## 4. Repository / Storage / 各ドメインServiceへ直接アクセスしないこと

`weakness-service.js`のimportは以下の2つのみ。
```js
import { getStudentHistory } from "../history/history-service.js";
import { scoreQuestionWeakness, isDormantQuestion } from "./weakness-rules.js";
```
`features/repository/`・`features/storage/`・`features/history/attempt-service.js`・`features/history/answer-record-service.js`・`features/question-set/question-set-service.js`への直接importは存在しない。`weakness-rules.js`に至ってはimport自体が一切無く、他のどのファイルにも依存しない。

## 5. questionId単位で集約すること

非公開ヘルパー`buildQuestionStatsList(studentId)`が、`getStudentHistory(studentId)`から得た全AttemptのAnswerRecordを`questionId`をキーに`Map`へ集約し、問題ごとの`answeredCount`・`correctCount`・`incorrectCount`・`correctRate`・`lastAnsweredAt`・`lastIsCorrect`を算出する。同一Attempt内での同一問題の再解答は元々AnswerRecordの複合キー（`attemptId`+`questionId`）により1件に収束済みのため、複数Attemptにまたがる場合のみ件数が積み上がる。

## 6. 苦手判定ルールをweakness-rules.jsへ分離していること

判定の実アルゴリズム（条件・閾値）は`weakness-rules.js`に完全に閉じている。`weakness-service.js`側は`scoreQuestionWeakness()`・`isDormantQuestion()`を呼ぶだけで、閾値や条件式を一切持たない。将来ルールベースからAI推薦等へ切り替える場合も、`weakness-rules.js`の中身を差し替えるだけで済む構造（`MAP_RENDERERS`・`QUESTION_MODE_HANDLERS`と同じテーブル駆動の思想）。

---

## 7. 公開API一覧

`weakness-rules.js`（判定ルール、2件）＋`weakness-service.js`（Facade、7件）＝計**9件**。

## 8. 各APIの詳細

### `scoreQuestionWeakness(questionStats)` （weakness-rules.js）
- 引数: `questionStats: QuestionStats`（1問分の解答統計）
- 返り値: `{ score: number, matchedConditions: string[] }`
- 用途: 1問分の解答統計から、苦手問題の該当条件数（スコア）と該当条件名の一覧を算出する純粋関数。
- 内部で利用しているルール: `WEAKNESS_CONDITIONS`テーブル（`recentIncorrect`＝直近不正解／`lowAccuracy`＝累計5回以上・正答率50%未満／`highIncorrectCount`＝誤答3回以上）の該当数を単純加算。

### `isDormantQuestion(questionStats, options?)` （weakness-rules.js）
- 引数: `questionStats: QuestionStats`, `options?: { dormantDays?: number, today?: Date }`
- 返り値: `boolean`
- 用途: 1問分の解答統計が「復習推奨（久しぶり）」に該当するかを判定する純粋関数。最終解答日時が無ければ`false`。
- 内部ロジック: `lastAnsweredAt`から`today`（省略時は現在時刻）までの経過日数が`dormantDays`（省略時30日）以上かを判定。

### `getWeakQuestions(studentId)` （weakness-service.js）
- 引数: `studentId: string`
- 返り値: `Array<QuestionStats & { score: number, matchedConditions: string[] }>`（score降順・同スコアはquestionId昇順、score=0は除外）
- 用途: 生徒の苦手問題一覧を取得する基礎判定API。
- 内部で利用している既存API: `buildQuestionStatsList()`（非公開）／`scoreQuestionWeakness()`（weakness-rules.js）

### `getDormantQuestions(studentId, options?)` （weakness-service.js）
- 引数: `studentId: string`, `options?: { dormantDays?: number, today?: Date }`（`isDormantQuestion()`にそのまま渡す）
- 返り値: `QuestionStats[]`（最終解答日時が古い順）
- 用途: 生徒の復習推奨（久しぶり）問題一覧を取得する基礎判定API。
- 内部で利用している既存API: `buildQuestionStatsList()`（非公開）／`isDormantQuestion()`（weakness-rules.js）

### `getWeakQuestionsByField(studentId, fieldId)` （weakness-service.js）
- 引数: `studentId: string`, `fieldId: string`
- 返り値: `getWeakQuestions()`と同じ形の配列（指定fieldIdのみ）
- 用途: 苦手問題一覧を科目で絞り込む。
- 内部で利用している既存API: `getWeakQuestions()`のみ（新たな探索・判定は行わない）

### `getWeakFields(studentId)` （weakness-service.js）
- 引数: `studentId: string`
- 返り値: `Array<{ fieldId: string, weakQuestionCount: number, questions: ReturnType<typeof getWeakQuestions> }>`（weakQuestionCount降順、同数はfieldId昇順）
- 用途: 苦手問題をfieldId単位に集約する（「苦手が多い科目」表示用）。
- 内部で利用している既存API: `getWeakQuestions()`のみ

### `getWeakSummary(studentId)` （weakness-service.js）
- 引数: `studentId: string`
- 返り値: `{ studentId: string, weakQuestionCount: number, dormantQuestionCount: number }`
- 用途: 苦手問題・復習推奨の件数サマリー。
- 内部で利用している既存API: `getWeakQuestions()` / `getDormantQuestions()`

### `getWeakDashboard(studentId)` （weakness-service.js）
- 引数: `studentId: string`
- 返り値: `{ summary: ReturnType<typeof getWeakSummary>, weakFields: ReturnType<typeof getWeakFields>, dormantQuestions: ReturnType<typeof getDormantQuestions> }`
- 用途: 苦手問題関連情報を1回でまとめて取得する統合窓口（HistoryServiceの`getHistoryDashboard()`と同じ位置づけ）。
- 内部で利用している既存API: `getWeakSummary()` / `getWeakFields()` / `getDormantQuestions()`

### `hasWeakQuestions(studentId)` （weakness-service.js）
- 引数: `studentId: string`
- 返り値: `boolean`
- 用途: 苦手問題が1件以上存在するかの軽量判定（バッジ表示・条件分岐向け）。
- 内部で利用している既存API: `getWeakSummary()`のみ

---

## 9. API同士の依存関係

```
getStudentHistory()（HistoryService）
        │
        ▼
buildQuestionStatsList()（非公開・questionId単位に集約）
        │
        ├──▶ scoreQuestionWeakness()（weakness-rules.js） ──▶ getWeakQuestions()
        │                                                          │
        │                                                          ├──▶ getWeakQuestionsByField()
        │                                                          ├──▶ getWeakFields()
        │                                                          └──▶ getWeakSummary() ──▶ hasWeakQuestions()
        │                                                                     │
        └──▶ isDormantQuestion()（weakness-rules.js） ──▶ getDormantQuestions() ┘
                                                                    │
                                                                    ▼
                                                            getWeakDashboard()
                                                        （getWeakSummary・getWeakFields・
                                                          getDormantQuestionsを統合）
```

- `buildQuestionStatsList()`（非公開）が唯一のHistoryService呼び出し元。これより上位の公開APIは全て`buildQuestionStatsList()`の直接・間接の呼び出し結果を再利用し、`getStudentHistory()`を重複して呼ばない設計（`getWeakQuestions()`・`getDormantQuestions()`がそれぞれ独立に`buildQuestionStatsList()`を呼ぶため、両方を同時に使う`getWeakDashboard()`では学習履歴の取得・集約が実質2回走る点は、HomeService側の`getHomeDashboard()`と同様の既知のトレードオフ）。
- `getWeakDashboard()`は最上位の統合APIで、これ以上の合成APIは無い。

## 10. 将来HomeService/UI/GASへ接続する際の位置づけ

- **HomeServiceからの利用**: HomeServiceは既にHistoryServiceのみに依存する設計（`docs/home-service-api.md`参照）だが、今後WeaknessServiceの情報（苦手問題・復習推奨）をホーム画面に表示する場合、HomeServiceはWeaknessServiceの公開APIを追加で組み合わせる形になる想定（HistoryServiceを直接呼ぶのと同じ立ち位置で、WeaknessServiceもHomeServiceの合成対象に加わる）。
- **UI（app.js）からの利用**: 現時点でWeaknessServiceはUIと未接続。将来的にはHomeService経由でapp.jsから呼ばれる想定であり、app.js・UIコードがWeaknessServiceを直接importすることは想定しない（HistoryServiceについても同様の方針が既に確立している）。
- **GAS連携**: 現時点でWeaknessServiceはGAS（`services/gas-service.js`）と一切接続していない。苦手問題の判定はクライアント側のローカルデータ（Repository/Storage経由でHistoryServiceが取得するAttempt/AnswerRecord）のみで完結しており、外部送信・保存は行わない。

---

## 付記: フォルダ名について

現在の正式な実装パスは`features/weakness/`である。design doc（`docs/architecture/ls-total-test-system-design-v1.md` 10.2節）には`features/weak-questions/`という表記があるが、これは初期設計時点の仮称であり、実装時に`features/weakness/`が採用され、Task18-1〜18-5を通じて一貫してこの名称で開発が進められている。**`features/weakness/`を正式名称として採用し、design doc側の`features/weak-questions/`表記は将来的にdesign doc自体を更新する対象とする**（実装パスをdesign docの表記に合わせるためだけのリネーム・リファクタは行わない）。
