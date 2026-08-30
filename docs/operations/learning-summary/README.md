# LearningSummary.gs 運用手順書

- 作成日: 2026-08-30
- 位置づけ: Attempt/AnswerRecord専用GAS（学習記録GAS、`docs/specification/gas-api-contract-v1.md` 5章）へ追加設置する、講師向け集計シート生成スクリプトの正本コピー。本ファイル自体はこのリポジトリの実行環境からは一切参照されない（ビルド・アプリ本体のどこからもimportされない）。あくまで、別プロジェクトの学習記録Apps Scriptへ手動で反映するためのソースを、このリポジトリで版管理しておくための保管場所。
- 本番での動作確認: 2026-08-30、本番の学習記録Apps Scriptへ反映し`generateLearningSummarySheets()`を実行、テスト生徒（S0061/TEST_総合テスト、st_001〜st_006）のデータで正常動作を確認済み。同日、テストデータcleanup後に0件（ヘッダーのみ）での再生成もエラーなく確認済み。

---

## 1. 目的

`attempts`/`answer_records`（正本）から、講師が実際の教室運用で確認しやすい形の集計を、以下4シートとして生成する。

1. **生徒別成績**（studentId × 科目の大分類「社会/理科」）
2. **生徒別単元成績**（studentId × 分野ラベル「社会・歴史」等 × 単元）
3. **問題別成績**（questionId単位、TestSetをまたいで1問=1行、誤答率の高い順）
4. **間違い問題サマリー**（studentId × questionId、誤答歴が1回以上ある組み合わせのみ）

旧`都立社会アプリ`時代のstudent_summary/question_summary/wrong_only相当の機能を、現行のLS総合テスト対策のデータ構造（Attempt/AnswerRecord、TestSet、複数科目）に合わせて作り直したもの。

## 2. 本番GASへの反映方法

1. 学習記録専用GAS（Attempt/AnswerRecord専用のGoogle Apps Scriptプロジェクト）のApps Scriptエディタを開く。
2. 既存の`LearningSummary.gs`ファイルの中身を、このリポジトリの`LearningSummary.gs`の内容で**全置換**する（新規ファイルとして初めて追加する場合は「ファイル」→「+」→「スクリプト」で`LearningSummary`という名前のファイルを作成し、貼り付ける）。
3. 保存する。

## 3. `generateLearningSummarySheets()`の実行方法

1. Apps Scriptエディタ上部の関数選択ドロップダウンで`generateLearningSummarySheets`を選ぶ。
2. 「実行」ボタンを押す。
3. 実行完了後、「表示」→「実行数」または「表示」→「ログ」（Ctrl+Enter）で`Logger.log`の出力を確認する。生成された各シートの行数、生徒マスタ・TestSet名・問題文の解決件数が表示される。

## 4. 必要なScript Properties（3件）

Apps Scriptエディタの「プロジェクトの設定」→「スクリプト プロパティ」に、以下3つを設定する（未設定の場合は該当項目がIDのまま表示されるだけで、集計処理自体は止まらない）。

| キー | 値 |
|---|---|
| `STUDENT_MASTER_SPREADSHEET_ID` | student-management-systemの「生徒管理＿マスタ」SpreadsheetのID |
| `TESTSET_MASTER_SPREADSHEET_ID` | 「LS総合テスト対策_学校・テストセットマスター」SpreadsheetのID |
| `QUESTION_MASTER_SPREADSHEET_ID` | 「LS総合テスト対策_問題マスター」SpreadsheetのID |

Web App URL・PIN実値と同様、Spreadsheet IDそのものはこのリポジトリ・コードのどこにも記載しない方針を維持する。

## 5. 生成される4シート

| シート名 | 集計単位 | 主な列 |
|---|---|---|
| 生徒別成績 | studentId × 科目（大分類） | student_id, 生徒名, 学校, 学年, 科目, 回答数, 正解数, 不正解数, 正答率 |
| 生徒別単元成績 | studentId × 科目（分野ラベル） × 単元 | student_id, 生徒名, 科目, 単元, 回答数, 正解数, 不正解数, 正答率 |
| 問題別成績 | questionId | questionId, 科目, 単元, 問題文, 回答数, 正解数, 不正解数, 誤答率（誤答率降順ソート） |
| 間違い問題サマリー | studentId × questionId | student_id, 生徒名, 科目, 単元, questionId, 問題文, 総回答回数, 誤答回数, 正解回数, 誤答率, 最終回答結果, 最終回答日時, TestSet名 |

旧バージョンが作成した「間違い明細」シートは、このスクリプトからは一切使用・更新されない（削除するかどうかは運用側の判断に委ねる）。

## 6. completed=falseのAttemptの扱い

`Attempt.completed`の値に関わらず、`answer_records`に保存済みの全AnswerRecordを集計対象に含める（意図的な設計）。AnswerRecordは1問ごとに解答確定時点で独立して保存される「実際に起きた解答」の記録であり、`completed`は「セッション全体が最後まで完了したか」を示すだけのため。通信不安定等でAttemptが完了扱いにならなくても、既に保存された回答は除外しない。

## 7. retry（間違い直し）upsertによる既知の制約

`answer_records`は`attemptId::questionId`の複合キーでupsertされる仕様（`docs/specification/domain-model-v1.md` 3.12/3.12.1節、正本の仕様、本スクリプトからは変更しない）。そのため、同一Attempt内で間違い直しをした場合、最初の誤答（selectedChoice/isCorrect=false/answeredAt）は上書きされて残らない。本集計の「総回答回数」は、**別々のAttempt（別セッション）にまたがる回答回数の合算**であり、同一Attempt内の間違い直し1回分を独立した解答として復元することはできない。この制約は正本側の仕様変更なしには解消できないため、現状のまま扱っている。

## 8. 科目分類表の同期に関する注意

「社会/理科」の大分類、および科目キー→日本語ラベルの対応表（`FIELD_ID_TO_BROAD_CATEGORY_`/`FIELD_ID_TO_LABEL_`）は、学習アプリ側の`config/subjects.js`の内容を手動でミラーしたもの。GAS側はブラウザ側のESモジュールを直接importできないため、**`config/subjects.js`に新しい科目キーを追加した場合は、このファイルの対応表も手動で追記する必要がある**。追記を忘れても集計自体はクラッシュせず、未知の科目キーは「その他」大分類・キーそのものをラベルとして表示するフォールバックになる。

## 9. 正本と派生データの関係

- **正本**: 学習記録Spreadsheetの`attempts`/`answer_records`シート。
- **派生データ**: 本スクリプトが生成する4シート（生徒別成績・生徒別単元成績・問題別成績・間違い問題サマリー）。いつでも`generateLearningSummarySheets()`を再実行するだけで、正本の最新状態から作り直せる。手動で編集しない。

## 10. 将来の発展余地（今回は未着手）

現時点で学習記録GAS（このLearningSummary.gsを含む）は、`.clasp.json`等によるバージョン管理を持たない、Apps Scriptエディタ上での直接編集・手動貼り替え運用となっている。将来、このファイルの改修頻度が高まる場合は、`student-management-system`リポジトリ（`apps/student-master/`）と同様の、clasp管理下での`git`バージョン管理・`clasp push`による反映へ移行することを検討する余地がある（push前のdiff監査により、意図しない設定上書き等を検知できる利点がある）。今回はリポジトリ構成の大規模な変更を避けるため、このMarkdown+`.gs`ファイルによる参照コピーの保管に留める。
