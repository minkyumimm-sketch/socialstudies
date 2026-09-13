// MemorizeSourceType.gs
//
// 暗記モード-0（2026-09-13前提）: 学習記録GAS（コード.gs/SheetHelpers.gs/
// AttemptProgress.gs）へ、新規sourceType `memorize` を安全に受け入れさせるための
// 基盤（SOURCE_TYPE_VALUES追加）のみを追加する。runId/reviewRoundのvalidation本体は
// docs/operations/learning-record-gas/RunIdentity.gsのvalidateRunIdentity_()へ
// 直接追加済み（本ファイルでは重複させない、正本は1箇所のみに保つ）。
//
// 【暗記モード-0のスコープ（today）】
// sourceType="memorize"の許可＋run identity契約（runId必須・reviewRound1以上の整数必須・
// testSetId指定禁止）を、Web（features/test-set-runner/test-set-run-identity.js）と
// GAS（本ファイル＋RunIdentity.gs）の両方に確立するのみ。UI（memorize-screen等）・
// runner（Round反復の実行ロジック）・resume（続きから復元）・「もう一度」機能は
// 今回一切実装しない（暗記モード-1以降で別途実装する）。暗記モード完成ではない。
//
// 【本ファイルの本番反映範囲（今回はローカル実装のみ、本番未反映）】
// 1. SheetHelpers.gs: SOURCE_TYPE_VALUES配列へ 'memorize' を追加（1箇所のみ）。
// 2. コード.gs: handleStartAttempt・AttemptProgress.gs: validateSaveAttemptProgressPayload_
//    ともに、testSetId必須/禁止ルールは `sourceType === 'testset' || sourceType === 'testset_review'`
//    という既存の明示的な列挙のみで判定しており、memorizeはどちらにも該当しないため
//    自動的に「testSetId指定禁止」側に入る。**コード変更不要**（下記【変更不要の根拠】参照）。
// 3. RunIdentity.gs: validateRunIdentity_()へmemorize分岐を追加済み（別コミット対象、
//    本ファイルとは独立した変更として反映する）。
//
// 【今回変更しないこと】
// - answer_records シート・ANSWER_RECORDS_HEADERS：列追加0（既存のtestset/testset_review
//   と同じ理由、AnswerRecordはattemptId経由でAttemptへ辿れるため直接保持は不要）。
// - ATTEMPTS_HEADERS・ATTEMPT_PROGRESS_HEADERS：列追加0（runId/reviewRoundは
//   Phase4E-0A/0Bで追加済みの既存2列をそのまま再利用する。新規列は不要）。
// - Spreadsheet：列追加0、新規シート追加0、既存データへの値補完0。
// - TestSet専用GAS（school_master/test_set/test_set_questions）：無関係、変更0。
// - Web側UI・runner・resume・「もう一度」機能：今回一切実装しない。
//
// 【暗記モード-0時点でmemorizeを実際に送信するWeb側経路は存在しない】
// 本番反映しても、既存WebがsourceType=memorizeを送ることは無い（UI/runner未実装のため）。
// そのため本番反映は「将来の暗記モード-1以降のWeb実装より先に契約を確立しておく」という
// 位置づけであり、反映直後の既存6種類中5種類（normal/weak_review/dormant_review/
// testset/testset_review）の挙動には一切影響しない（後述の互換性マトリクス参照）。

// ---------------------------------------------------------------------------
// 【SheetHelpers.gsへの変更（1箇所のみ、末尾追加）】
// ---------------------------------------------------------------------------
//
// 変更前（2026-09-13時点の本番実コード、Phase3D-4A前提でtestset_review追加済み、5値）:
//
// var SOURCE_TYPE_VALUES = ['normal', 'weak_review', 'dormant_review', 'testset', 'testset_review'];
//
// 変更後（6値）:
//
// var SOURCE_TYPE_VALUES = ['normal', 'weak_review', 'dormant_review', 'testset', 'testset_review', 'memorize'];
//
// 【安全性の根拠】SOURCE_TYPE_VALUESはコード.gsのhandleStartAttempt・
// AttemptProgress.gsのvalidateSaveAttemptProgressPayload_の両方から共有参照される
// 単一の配列定数（docs/operations/learning-record-gas/README.md 0節・
// TestSetReviewSourceType.gsで確認済みの既存パターンをそのまま踏襲）。
// 末尾へ1値追加するだけであり、既存5値の判定（indexOf比較）には一切影響しない。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 【変更不要の根拠: testSetId必須/禁止ルール（handleStartAttempt /
//   validateSaveAttemptProgressPayload_）】
// ---------------------------------------------------------------------------
//
// 既存コード（RunIdentity.gs参照）:
//
//   if ((sourceType === 'testset' || sourceType === 'testset_review') && !testSetId) {
//     return errorResult_('sourceType=testset/testset_reviewの場合testSetIdが必須です。');
//   }
//   if (sourceType !== 'testset' && sourceType !== 'testset_review' && testSetId) {
//     return errorResult_('sourceType=testset/testset_review以外ではtestSetIdを指定できません。');
//   }
//
// sourceType='memorize'はこの2条件のどちらの列挙にも含まれないため、
// 「testSetIdを指定した場合は自動的にreject」される（2つ目の条件に該当）。
// 逆にtestSetIdを指定しなければ1つ目の条件には該当せず素通りする。
// つまり「memorizeではtestSetId指定禁止」は、この2箇所の既存コードを一切変更せずに
// 自動的に成立する（testset/testset_review専用ルールの対象を広げる必要が無い）。
// validateSaveAttemptProgressPayload_も全く同じ2条件構造を持つため、同じ結論となる。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 【互換性マトリクス（実コードに基づく確定、推定なし）】
//
// A. 旧GAS（memorize未対応、SOURCE_TYPE_VALUESが5値のまま）
//    × 何らかのWebがsourceType=memorizeを送信: `SOURCE_TYPE_VALUES.indexOf('memorize') === -1`
//    によりreject（'sourceTypeの値が不正です。'）。ただし現時点でmemorizeを送信する
//    Web側経路は存在しないため、実際には発生しない。
// B. 新GAS（本ファイル＋RunIdentity.gs反映後）× 既存Web（memorizeを送信しない）:
//    SOURCE_TYPE_VALUESへの追加はindexOf判定に無影響、testSetIdルールの対象列挙も
//    変更しないため、既存5種類のsourceTypeに対する挙動は一切変更されない。→ 安全。
// C. 新GAS × 新Web（暗記モード-1以降、UI/runner実装後にmemorizeを送信）:
//    今回は発生しない（UI/runner自体が未実装のため）。将来実装する際は、
//    本ファイル・RunIdentity.gsのGAS反映を先に完了させることを必須条件とする
//    （rollout順序「Spreadsheet（今回列追加なしのため対象外）→GAS→Web」を維持）。
// D. 新GAS × 新Web、ただしrunId/reviewRoundを省略した場合: RunIdentity.gsの
//    validateRunIdentity_()内、memorize分岐はALLOW_LEGACY_RUN_IDENTITY_PAYLOAD_の
//    対象外（testset/testset_review専用のフラグ）のため、常にreject
//    （'sourceType=memorizeの場合、runIdは必須です。'等）。legacy payloadという
//    概念そのものがmemorizeには存在しない。
// ---------------------------------------------------------------------------
