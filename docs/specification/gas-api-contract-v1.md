# GAS API契約仕様書 Ver.1

- 作成日: 2026-08-03
- 位置づけ: `docs/architecture/ls-total-test-system-design-v1.md` の7章の詳細版
- 表記ルール（確定/仮決定/要確認）はメイン設計書と共通
- **本ドキュメントは論理的なAPI契約（インターフェース設計）のみを扱い、具体的なGASコードは記述しません。**
- 既存2API（`getActiveStudents`, `saveRecord`）は置き換えず維持し、新規APIは各Phaseで必要になった時点で実装します。今回のPhase1では設計のみです。

---

## 0. 前提となる要確認事項

以下が未確認のため、実装時の判断がこの確認結果に依存します（メイン設計書 1.2節、19.1節参照）。

- 学習記録用GASと生徒管理GASが実際に同一プロジェクトか別プロジェクトか
- 既存`getActiveStudents`のレスポンスに`schoolId`が含まれているか（現行は`grade`のみ）
- 現行APIに「本人のstudentIdでしか自分のデータを取得できない」認可チェックがあるか

---

## 1. `getActiveStudents`（既存・維持）

| 項目 | 内容 |
|---|---|
| 目的 | 有効な生徒一覧を取得する（生徒名オートコンプリート用） |
| リクエスト | `GET ?action=getActiveStudents` |
| レスポンス | `{ ok: true, students: [{ student_id, display_name, grade, active }] }` |
| 必須項目 | なし（一覧取得のみ） |
| エラー | `{ ok: false, error: string }` |
| 冪等性 | 冪等（GET・副作用なし） |
| 認証・本人確認 | **要確認**: 現状は誰でも全生徒一覧を取得できる可能性がある（クライアントコードからは認可チェックの有無を確認できない） |
| 既存APIからの移行方法 | 変更なし。将来`schoolId`を含める場合は、レスポンスへのフィールド追加のみで後方互換（既存フィールドは維持） |

---

## 2. `saveRecord`（既存・段階拡張）

| 項目 | 内容 |
|---|---|
| 目的 | 1問ごとの解答結果を保存する |
| リクエスト（現行） | `POST { action:"saveRecord", studentId, name, subject, questionId, unit, question, selectedChoice, correctAnswer, isCorrect }` |
| リクエスト（拡張案・Phase2以降） | 現行フィールドに加え `attemptId, fieldId, coursePurposeId, questionSetId, questionSetVersion, responseTimeSeconds, timedOut` を**追加**（既存フィールドは削除しない） |
| レスポンス | `{ ok: true }` または `{ ok: false, error }` |
| 必須項目（現行） | `studentId`, `name`, `subject`, `questionId` |
| エラー | 必須項目欠落、GAS側の書き込み失敗 |
| 冪等性 | **現状は非冪等**（同じリクエストを2回送ると2行保存される可能性が高い、要確認）。Phase2で`attemptId + questionId`を一意キーとした冪等化を検討（8章参照） |
| 認証・本人確認 | **要確認**: `studentId`をクライアントが自己申告する形式であり、なりすまし防止のチェックがあるか不明 |
| 既存APIからの移行方法 | 新フィールドは任意項目として追加し、未送信でも動作するようGAS側を後方互換に保つ（クライアント側の`buildSavedSubjectName`合成文字列は段階的に個別フィールド送信へ置き換える。メイン設計書6.4参照） |

---

## 3. 生徒認証／本人確認（新規・仮称 `authenticateStudent`）

| 項目 | 内容 |
|---|---|
| 目的 | ログイン強化（現状は名簿から選ぶだけで、実質的な本人確認が無い） |
| リクエスト（仮） | `POST { action:"authenticateStudent", studentId, verificationCode? }` |
| レスポンス（仮） | `{ ok: true, sessionToken? }` |
| 必須項目 | `studentId` |
| エラー | 該当生徒なし、確認コード不一致 |
| 冪等性 | 冪等にできる設計とする（同じ認証情報での複数回リクエストは同じ結果を返す） |
| 認証・本人確認 | 本APIの主目的そのもの。**要確認**: 塾での運用実態（教室内タブレット共有か、個人スマホか）によって必要な強度が変わる |
| 既存APIからの移行方法 | 新規。当面は未実装のまま、現行の「名簿選択のみ」の方式を維持してよい（**仮決定**: 優先度は低い） |

---

## 4. 生徒プロフィール取得（Task47で不採用）

**Task47（2026-08-13）で不採用と判定。** 学校別テスト範囲（Phase4）はTestSet方式へ再設計され、`studentId`から`schoolId`/`gradeId`を自動判定する必要がなくなったため、本APIは現時点で導入しない。学校・学年は生徒自身がアプリ上で選択する。歴史的記録として本項は残すが、実装対象ではない。

| 項目 | 内容（不採用時点の設計） |
|---|---|
| 目的（旧） | `studentId`から`schoolId`・`gradeId`を取得し、学校別テスト範囲の絞り込みに使う |
| リクエスト（旧・仮） | `GET ?action=getStudentProfile&studentId=...` |
| レスポンス（旧・仮） | `{ ok: true, studentId, schoolId, gradeId }` |

---

## 5. 学習開始記録（新規・仮称 `startAttempt`）

| 項目 | 内容 |
|---|---|
| 目的 | Attemptの開始をサーバに記録し、途中終了も検知できるようにする |
| リクエスト（仮） | `POST { action:"startAttempt", attemptId, studentId, questionSetId, questionSetVersion, startedAt }` |
| レスポンス（仮） | `{ ok: true }` |
| 必須項目 | `attemptId`, `studentId`, `questionSetId`, `questionSetVersion` |
| エラー | 必須項目欠落 |
| 冪等性 | 冪等にする（同じ`attemptId`で複数回送っても1レコードのまま上書き） |
| 認証・本人確認 | `studentId`の自己申告に依存（3番の認証強化と連動） |
| 既存APIからの移行方法 | 新規。Phase2で導入。導入前は「Attempt開始」という概念自体がサーバ側に記録されない（現行は解答保存のみ） |

---

## 6. 挑戦完了（新規・仮称 `completeAttempt`）

| 項目 | 内容 |
|---|---|
| 目的 | Attemptを完了としてマークし、ランキング反映の起点にする（完了判定の要） |
| リクエスト（仮） | `POST { action:"completeAttempt", attemptId, score, totalCount, rawTimeSeconds, missCount }` |
| レスポンス（仮） | `{ ok: true, penalizedTimeSeconds, isNewBest }` |
| 必須項目 | `attemptId`, `score`, `totalCount` |
| エラー | 該当`attemptId`なし（`startAttempt`未実施）、既に完了済み |
| 冪等性 | 冪等にする（同じ`attemptId`への2回目の完了リクエストは何もしない、または同じ結果を返す） |
| 認証・本人確認 | `startAttempt`時の`studentId`と一致するかの確認が望ましい |
| 既存APIからの移行方法 | 新規。Phase2で「完了」の概念を導入、Phase6で内部的に`upsertBestRecord`を呼び出す形に拡張 |

---

## 7. 苦手問題取得（新規・仮称 `getWeakQuestions`）

| 項目 | 内容 |
|---|---|
| 目的 | 生徒ごとの苦手問題一覧を取得する |
| リクエスト（仮） | `GET ?action=getWeakQuestions&studentId=...&fieldId=...` |
| レスポンス（仮） | `{ ok: true, weakQuestions: [{ questionId, score, reasons: [...] }] }` |
| 必須項目 | `studentId` |
| エラー | 該当生徒なし |
| 冪等性 | 冪等（GET・副作用なし） |
| 認証・本人確認 | 本人以外の苦手問題を取得できないようにする認可チェックを推奨 |
| 既存APIからの移行方法 | 新規。Phase5で導入 |

---

## 8. 学習サマリー取得（新規・仮称 `getLearningSummary`）

| 項目 | 内容 |
|---|---|
| 目的 | 生徒×分野×単元の正答率等の集計結果を取得する |
| リクエスト（仮） | `GET ?action=getLearningSummary&studentId=...` |
| レスポンス（仮） | `{ ok: true, summaries: [{ fieldId, unit, attemptedCount, correctCount, correctRate, lastAnsweredAt }] }` |
| 必須項目 | `studentId` |
| エラー | 該当生徒なし |
| 冪等性 | 冪等（GET・副作用なし） |
| 認証・本人確認 | 7番と同様 |
| 既存APIからの移行方法 | 新規。Phase5で導入 |

---

## 9. TestSet API（Task50で確定・専用GAS Web App新設）

**本章の対象は、1〜8章・10章が前提とする既存/将来の「学習アプリ用GAS」とは別の、TestSet専用に新設するGAS Web Appである（Task50で確定、`docs/architecture/ls-total-test-system-design-v1.md` 9.6節参照）。既存GAS（`services/gas-service.js`の`GAS_WEB_APP_URL`、`getActiveStudents`/`saveRecord`）へは一切のaction追加を行わない。** 具体的な構築手順は`docs/operations/test-set-gas-setup-v1.md`を参照。実装（GASコード作成・デプロイ）はTask52以降で行う。本章はAPI契約のみを定義する。

TestSet専用GASの正本データはTestSet専用Google Spreadsheet「LS総合テスト対策_学校・テストセットマスター」（`school_master`/`test_set`/`test_set_questions`の3タブ、schemaは`docs/specification/data-schema-v1.md`参照）。

### 9.1 `getSchools`（読み取り・認証不要）

| 項目 | 内容 |
|---|---|
| 目的 | active状態の学校一覧を取得する |
| リクエスト | `GET ?action=getSchools` |
| レスポンス | `{ ok: true, schools: [{ schoolId, schoolName }] }`（例: `{schoolId:"SC001", schoolName:"○○中学校"}`。※`○○`は例示のプレースホルダー） |
| 必須項目 | なし |
| エラー | なし（0件でも空配列） |
| 冪等性 | 冪等（GET・副作用なし） |
| 認証 | 不要（学校名は個人情報を含まない公開情報） |

### 9.2 `getTestSets`（読み取り・認証不要）

| 項目 | 内容 |
|---|---|
| 目的 | 指定した学校・学年・学年度に対応する、status=activeのTestSet一覧を取得する |
| リクエスト | `GET ?action=getTestSets&schoolId=...&gradeId=...&academicYearId=...` |
| レスポンス | `{ ok: true, testSets: [{ testSetId, examRoundLabel, label, questionCount }] }` |
| 必須項目 | `schoolId`, `gradeId`, `academicYearId` |
| エラー | 該当TestSetなしの場合はエラーではなく空配列を返す。クライアント側は通常学習へフォールバックする（設計書9.4節） |
| 冪等性 | 冪等（GET・副作用なし） |
| 認証 | 不要 |

### 9.3 `getTestSet`（読み取り・認証不要）

| 項目 | 内容 |
|---|---|
| 目的 | 指定したTestSetの詳細（構成問題のfieldId/questionId一覧）を取得する |
| リクエスト | `GET ?action=getTestSet&testSetId=...` |
| レスポンス | `{ ok: true, testSet: { testSetId, schoolId, gradeId, academicYearId, examRoundLabel, label, status }, questions: [{ fieldId, questionId }] }` |
| 必須項目 | `testSetId` |
| エラー | 該当testSetIdなし |
| 冪等性 | 冪等（GET・副作用なし） |
| 認証 | 不要 |
| 備考 | 問題本文（`question`/`answer`/`choices`/`explanation`等）は返さない。問題本文の正本は既存GitHub Pages側の問題CSVであり、クライアント側で`fieldId`+`questionId`から該当CSVを参照する |

### 9.4 `saveTestSet`（書き込み・PIN必須）

| 項目 | 内容 |
|---|---|
| 目的 | TestSetを新規作成、または既存TestSetを更新する |
| リクエスト | `POST { action:"saveTestSet", pin, testSet:{ testSetId, schoolId, gradeId, academicYearId, examRoundLabel, label, status }, questions:[{ fieldId, questionId }] }`（`testSetId`が空文字列またはnullなら新規、指定されていれば更新） |
| レスポンス | `{ ok: true, testSetId }` または `{ ok: false, error }` |
| 必須項目 | `pin`, `testSet.schoolId`, `testSet.gradeId`, `testSet.academicYearId`, `testSet.examRoundLabel`, `testSet.label`, `questions`（1件以上） |
| エラー | PIN不一致、必須項目欠落、`schoolId`が`school_master`に存在しない、`questions`が0件、`questionId`重複 |
| 冪等性 | 冪等にはしない（呼び出しごとに更新が反映される。新規作成の重複防止はUI側の操作フローに委ねる） |
| 認証 | 共有PIN必須（GASの`PropertiesService`に保存。値そのものはdocsに記載しない。9.6節参照） |
| 通信方式 | 既存`services/gas-service.js`の`postToGas`と同じ`Content-Type: text/plain;charset=utf-8`でのPOST（CORSプリフライト回避、Task50確定） |
| 原子性 | GASに本格的なトランザクション機構はないため、`LockService.getScriptLock()`による排他制御を行い、`test_set`行→`test_set_questions`行の順で書き込む。失敗時のロールバック（既存行のsnapshot→restore等）の具体設計はTask52実装時に確定する（設計書9.5節、以下「完全なDBトランザクション」ではない点に留意） |
| questionId実在確認 | GAS側では行わない（GitHub Pages CSVへの外部フェッチ・CSVパーサ二重実装を避けるため）。講師UIが既存問題CSVから読み込んだ候補のみ選択可能にすることで担保し、事後監査は`scripts/validate-test-set.mjs`による定期バックアップ検証に委ねる |

### 9.5 `archiveTestSet`（書き込み・PIN必須）

| 項目 | 内容 |
|---|---|
| 目的 | TestSetを物理削除せず`status=archived`へ変更する |
| リクエスト | `POST { action:"archiveTestSet", pin, testSetId }` |
| レスポンス | `{ ok: true }` または `{ ok: false, error }` |
| 必須項目 | `pin`, `testSetId` |
| エラー | PIN不一致、該当testSetIdなし |
| 冪等性 | 冪等にする（既にarchived済みへの再リクエストも成功として扱う） |
| 認証 | 共有PIN必須 |

### 9.6 認証方式（共通、Task50確定）

書き込み系（`saveTestSet`/`archiveTestSet`）のみ共有PIN（合言葉）を要求する。PINはGASの`PropertiesService.getScriptProperties()`にのみ保存し、公開されるGitHub Pages側のJavaScriptには一切含めない。リクエストごとに平文PINをHTTPS POSTで送信する方式とし（GAS Web Appのステートレスな性質上、token方式は追加の状態管理コストに見合わないと判断、Task50比較評価）、読み取り系API（9.1-9.3）は個人情報を含まないため認証を要求しない。

---

## 10. 年度ランキング取得（新規・仮称 `getAnnualRanking`）

| 項目 | 内容 |
|---|---|
| 目的 | 指定した問題セット・バージョン・年度のランキング上位を取得する |
| リクエスト（仮） | `GET ?action=getAnnualRanking&questionSetId=...&questionSetVersion=...&academicYearId=...&studentId=...(自分の順位取得用、任意)` |
| レスポンス（仮） | `{ ok: true, rankings: [{ rank, displayNameSnapshot, correctRate, penalizedTimeSeconds }], myRank? }` |
| 必須項目 | `questionSetId`, `questionSetVersion`, `academicYearId` |
| エラー | 該当データなし（空配列を返す） |
| 冪等性 | 冪等（GET・副作用なし） |
| 認証・本人確認 | ランキング自体は公開情報として扱う想定だが、`myRank`取得時は`studentId`の妥当性確認が必要 |
| 既存APIからの移行方法 | 新規。Phase6で導入。詳細は`ranking-spec-v1.md`参照 |

---

## 11. 歴代ランキング取得（新規・仮称 `getAllTimeRanking`）

| 項目 | 内容 |
|---|---|
| 目的 | 全年度を跨いだ歴代ベストランキングを取得する |
| リクエスト（仮） | `GET ?action=getAllTimeRanking&questionSetId=...&questionSetVersion=...` |
| レスポンス（仮） | `{ ok: true, rankings: [{ rank, displayNameSnapshot, correctRate, penalizedTimeSeconds, academicYearId }] }` |
| 必須項目 | `questionSetId`, `questionSetVersion` |
| エラー | 該当データなし（空配列） |
| 冪等性 | 冪等 |
| 認証・本人確認 | 卒業生記録を含む場合、公開範囲の方針次第で認可が必要になる可能性（メイン設計書14章、**要確認**） |
| 既存APIからの移行方法 | 新規。Phase6で導入 |

---

## 12. ベスト記録更新（新規・仮称 `upsertBestRecord`）

| 項目 | 内容 |
|---|---|
| 目的 | 生徒×問題セット×バージョン×年度のベスト記録を冪等に更新する |
| リクエスト（仮） | `POST { action:"upsertBestRecord", studentId, questionSetId, questionSetVersion, academicYearId, correctRate, penalizedTimeSeconds, displayNameSnapshot }` |
| レスポンス（仮） | `{ ok: true, updated: boolean }`（`updated`は実際にベストが更新されたかを示す） |
| 必須項目 | `studentId`, `questionSetId`, `questionSetVersion`, `academicYearId`, `correctRate`, `penalizedTimeSeconds` |
| エラー | 必須項目欠落 |
| 冪等性 | **設計上の要件として冪等にする**（同じ内容を複数回送っても結果は変わらない。既存ベストより悪い記録なら何もしない） |
| 認証・本人確認 | `studentId`本人からの呼び出しであることの確認が望ましい |
| 既存APIからの移行方法 | 新規。通常は`completeAttempt`（6番）の内部処理として自動的に呼ばれる想定だが、明示的な冪等更新APIとしても独立させておく |

---

## 13. まとめ表（再掲）

| # | API | 対応フェーズ | 既存との関係 |
|---|---|---|---|
| 1 | `getActiveStudents` | 現行 | 維持 |
| 2 | `saveRecord` | 現行→Phase2で拡張 | 維持しつつ段階拡張 |
| 3 | `authenticateStudent` | 未定（優先度低） | 新規 |
| 4 | `getStudentProfile` | Phase4 | **Task47で不採用**（4章参照） |
| 5 | `startAttempt` | Phase2 | 新規 |
| 6 | `completeAttempt` | Phase2/Phase6 | 新規 |
| 7 | `getWeakQuestions` | Phase5 | 新規 |
| 8 | `getLearningSummary` | Phase5 | 新規 |
| 9 | `getSchools`/`getTestSets`/`getTestSet`/`saveTestSet`/`archiveTestSet` | Phase4 | **Task50確定：TestSet専用GAS Web App（本表1-8・10-12とは別プロジェクト）に実装。詳細は9章** |
| 10 | `getAnnualRanking` | Phase6 | 新規 |
| 11 | `getAllTimeRanking` | Phase6 | 新規 |
| 12 | `upsertBestRecord` | Phase6 | 新規 |
