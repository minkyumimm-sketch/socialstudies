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

## 9. 学校別TestSet取得（新規・仮称 `getTestSets`、Task47で再設計）

**Task47（2026-08-13）で`getTestRange`から名称・形状を変更。** 学校別テスト範囲はunit/subunit条件からの動的抽出ではなく、講師が選定したquestionId固定集合（TestSet）の取得に変わったため、レスポンス形状を変更した。**本APIの導入可否・具体的なアクション名・認証方式は未確定（後続Taskでユーザーと合意のうえ確定する）。** 以下は暫定案。

| 項目 | 内容（暫定） |
|---|---|
| 目的 | 学校・学年・現在の学年度に対応する、講師が作成したTestSet一覧を取得する |
| リクエスト（仮） | `GET ?action=getTestSets&schoolId=...&gradeId=...&academicYearId=...` |
| レスポンス（仮） | `{ ok: true, testSets: [{ testSetId, examRoundLabel, label, questions: [{ fieldId, questionId }] }] }` |
| 必須項目 | `schoolId`, `gradeId` |
| エラー | 該当TestSetなし（この場合エラーではなく空配列を返し、クライアント側で通常学習にフォールバックする。メイン設計書9.4参照） |
| 冪等性 | 冪等（GET・副作用なし） |
| 認証・本人確認 | 特定生徒に紐づく情報ではないため不要（学校単位の公開情報。Task47での再評価でもTestSetの内容自体に個人情報は含まれないと判定済み） |
| 既存APIからの移行方法 | 新規。Phase4で導入予定だが、GAS新設の要否を含め着手前にユーザーとの事前合意が必要（CLAUDE.md⑤） |

**関連（未確定）**: 講師用問題選定UIからTestSetを保存するための書き込みAPI（仮称`saveTestSet`）も別途必要になる見込みだが、本Taskでは設計しない。

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
| 4 | `getStudentProfile` | Phase4 | 新規（または2番拡張） |
| 5 | `startAttempt` | Phase2 | 新規 |
| 6 | `completeAttempt` | Phase2/Phase6 | 新規 |
| 7 | `getWeakQuestions` | Phase5 | 新規 |
| 8 | `getLearningSummary` | Phase5 | 新規 |
| 9 | `getTestRange` | Phase4 | 新規 |
| 10 | `getAnnualRanking` | Phase6 | 新規 |
| 11 | `getAllTimeRanking` | Phase6 | 新規 |
| 12 | `upsertBestRecord` | Phase6 | 新規 |
