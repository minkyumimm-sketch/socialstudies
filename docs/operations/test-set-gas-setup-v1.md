# TestSet専用GAS / Spreadsheet 構築手順書 Ver.1

- 作成日: 2026-08-13（Task51）
- 位置づけ: Phase4「学校別テスト範囲」のTestSet機能で使用する、TestSet専用Google Spreadsheet・GAS Web Appを新規構築するための手順書。
- 前提: `docs/architecture/ls-total-test-system-design-v1.md` 9章・`docs/specification/gas-api-contract-v1.md` 9章で確定した設計に基づく。
- **構築状況（Task52、2026-08-15完了）**: 本手順書に沿ってSpreadsheet・GASプロジェクト（container-bound）・Web Appデプロイ・Script Properties（`TEACHER_PIN`）を実際に構築し、5APIすべての単体疎通確認が完了している。以下の手順は完了済みの記録として、また将来同様の基盤を再構築する場合の参照として残す。GAS Web App URL・PIN実値はrepositoryのどこにも記載しない方針を維持している。

---

## 0. 全体像

```
講師用UI ─┐
          ├─→ TestSet専用GAS Web App ──→ TestSet専用Google Spreadsheet
生徒用UI ─┘        （このドキュメントで構築）   （このドキュメントで構築）
```

既存の生徒一覧・解答保存用GAS（`services/gas-service.js`の`GAS_WEB_APP_URL`）は一切変更しない。TestSet専用の新しいSpreadsheet・GASプロジェクト・Web Appを1つずつ新規に作る。

---

## 1. Spreadsheet作成

1. Google Driveで新規Spreadsheetを作成する。
2. ファイル名を「**LS総合テスト対策_学校・テストセットマスター**」にする（問題マスター用Spreadsheet「LS総合テスト対策_問題マスター」とは別ファイル）。
3. タブ（シート）を3つ用意し、それぞれ以下のheader行（1行目）を入力する。

### `school_master`タブ

```
schoolId	schoolName	active
```

### `test_set`タブ

```
testSetId	schoolId	gradeId	academicYearId	examRoundLabel	label	status
```

### `test_set_questions`タブ

```
testSetId	fieldId	questionId
```

（タブ区切りでそのまま1行目へ貼り付け可能な形式で記載した）

4. 各タブとも1行目を固定表示にしておくことを推奨する（表示 → 固定 → 1行）。
5. この段階では実データを入力しない。

---

## 2. Apps Scriptプロジェクト作成

**推奨：container-bound script（Spreadsheetに紐づくApps Script）を第一候補とする。**

理由：
- 対象Spreadsheetが1つに固定されており、standalone scriptのようにSpreadsheet IDを別途コードへ埋め込む必要がない（設定箇所が減り、講師・運用者にとって管理がシンプル）。
- Spreadsheetを開けば同じ場所からApps Scriptへアクセスでき、運用者が「どのSpreadsheetのどのスクリプトか」を迷いにくい。
- 標準の`SpreadsheetApp.getActiveSpreadsheet()`でこのSpreadsheetを直接参照でき、コード量も少なく済む。

手順（一般的なApps Scriptの操作。正確なメニュー名はTask52実施時に実画面で確認すること）：

1. 手順1で作成したSpreadsheetを開く。
2. メニューから拡張機能（Extensions）→ Apps Script を選択する。
3. 新しいApps Scriptプロジェクトが、このSpreadsheetに紐づいた状態で開く。
4. プロジェクト名を分かりやすい名前に変更する（例：「LS総合テスト対策_TestSet GAS」）。
5. GASコード自体はTask52でClaude Codeが作成し、ここへ貼り付ける。本書はコードを含まない。

---

## 3. Script Properties設定（講師PIN）

書き込みAPI（`saveTestSet`/`archiveTestSet`）を保護する共有PINは、GASコード内に直接書かず、Script Propertiesへ保存する。

想定するproperty名候補：

```
TEACHER_PIN
```

手順（一般的なApps Scriptの操作）：

1. Apps Scriptエディタを開いた状態で、プロジェクトの設定（歯車アイコン、Project Settings）を開く。
2. 「スクリプト プロパティ」（Script properties）のセクションを探す。
3. プロパティを追加し、キーに`TEACHER_PIN`、値に実際のPIN文字列を入力する。
4. PINの実際の値は、この手順書・リポジトリ内のどのファイルにも記載しない。ユーザーが任意に決めて設定する。

**この手順はTask52実施時に、実際のApps Script画面を見ながら行うこと。**

---

## 4. Web Appとしてデプロイ

GASコード（Task52で作成）が完成した後の手順。

1. Apps Scriptエディタ右上の「デプロイ」（Deploy）→「新しいデプロイ」（New deployment）を選択する。
2. 種類の選択で「ウェブアプリ」（Web app）を選ぶ。
3. 「次のユーザーとして実行」（Execute as）は「自分」（Me）を選ぶ（GASの標準的な設定。生徒管理システム側のGASも同様の構成である可能性が高い）。
4. 「アクセスできるユーザー」（Who has access）は「全員」（Anyone）を選ぶ必要がある。理由：GitHub Pages上の生徒用UI・講師用UIは未ログイン状態のブラウザから直接GAS Web Appを叩く構成のため、Googleアカウント認証を必須にする設定（Anyone with Google account等）にすると、既存`getActiveStudents`と同様の仕組みで動作しなくなる。書き込み保護はGoogleアカウント認証ではなく共有PIN（3章）で行う。
5. デプロイを実行し、発行されたWeb App URLを控える。

**この手順の正確なメニュー文言・選択肢名は、Google側の仕様変更やUIバージョンにより本書作成時点の記載と異なる場合がある。Task52実施時に実際の画面を確認しながら進めること。**

---

## 5. URL取得後の扱い（Task53で確定）

デプロイ後に発行されるWeb App URL（`https://script.google.com/macros/s/.../exec`形式）は、既存の`services/gas-service.js`の`GAS_WEB_APP_URL`とは**別の定数として**アプリ側へ組み込む（既存の値を上書きしない）。

**Task53で`config/test-set-gas-config.js`（`TEST_SET_GAS_WEB_APP_URL`定数）として実装・確定した。** Web App URLはブラウザから常に見える公開情報であり秘密情報ではないため、既存`GAS_WEB_APP_URL`と同じ扱いでrepositoryへ実値を保持する。講師PIN（`TEACHER_PIN`）はこの定数とは全く別物であり、引き続きrepository・コード・docsのどこにも保持しない。

---

## 6. 疎通確認の順序（Task52で実施・完了済み）

GASコード実装・デプロイ完了後、以下の順で疎通確認を行う。**Task52（2026-08-15）ですべて完了。**

1. `getSchools`（学校0件の状態で空配列が返ることを確認）
2. `school_master`タブへテスト用の学校を1件手動追加し、`getSchools`で反映されることを確認 → `SC001`登録・反映確認済み
3. `saveTestSet`でテスト用TestSetを1件作成（PINあり）し、`test_set`/`test_set_questions`タブへ正しく書き込まれることを確認 → `TS001`作成・確認済み（`physics`/`phy_001`）
4. `saveTestSet`を同一`testSetId`で再送し、更新できること・`test_set_questions`に重複行が残らないことを確認 → 確認済み
5. `saveTestSet`をPIN誤りで呼び出し、拒否されることを確認 → 確認済み（Sheets側に変化なし）
6. `getTestSets`で該当TestSetが一覧取得できることを確認 → 確認済み
7. `getTestSet`で詳細（questions一覧）が取得できることを確認 → 確認済み
8. `archiveTestSet`でstatusが`archived`に変わることを確認、`getTestSets`（active限定）から除外されるが`getTestSet`では引き続き取得できることを確認 → 確認済み
9. 確認が終わったテストデータ（`TS001`）は、削除せず`archived`のまま疎通確認の記録として保持する（物理削除機能を設計上持たせていないため）

この段階ではLSアプリ本体（`app.js`等）との接続はまだ行っていない。GAS API単体の疎通確認までがTask52の範囲であり、講師用UI・生徒用UI・QuestionSet/Attempt接続はTask53以降で実施する。
