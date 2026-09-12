// RunIdentity.gs
//
// Phase4E-0A: TestSet誤答復習の「全問正解まで自動反復」（Phase4E本体、まだ未実装）を
// 安全に実現するための基盤として、TestSet実行1回を一意に識別する runId と、
// 復習の周数を表す reviewRound を、学習記録GAS（コード.gs/SheetHelpers.gs/
// AttemptProgress.gs）へ追加する。
//
// 【Phase4E監査での結論（前提）】
// 既存のcompletedAt/time-window方式（test-set-review-resume.js旧実装）では、同一runId・
// 同一fieldIdに複数のtestset_review Attemptが存在する場合に「どの周のものか」を安全に
// 判別できない。runId単独でも同じ問題が残るため、runId + reviewRound の2列が必要と判断した
// （Phase4E-0監査で確定、Phase4E-0Aで実装）。
//
// 【本ファイルの位置づけ】
// docs/operations/learning-record-gas/README.md・AttemptProgress.gs・
// TestSetReviewSourceType.gs・AttemptInitialWrongQuestionIds.gsと同じく、本番Apps Script
// （コード.gs/SheetHelpers.gs/AttemptProgress.gs）へユーザーが手動で反映するための、
// 版管理用の正本コピーである。本ファイル自体はこのリポジトリの実行環境からは一切参照されない。
//
// 【本番反映範囲（今回はローカル実装のみ、本番未反映）】
// 1. SheetHelpers.gs: ATTEMPTS_HEADERSの末尾へ 'runId', 'reviewRound' を追加（13→15列）。
// 2. AttemptProgress.gs: ATTEMPT_PROGRESS_HEADERSの末尾へ 'runId', 'reviewRound' を追加（14→16列）。
// 3. コード.gs: handleStartAttempt を本ファイルの完成版へ差し替え。
// 4. AttemptInitialWrongQuestionIds.gs: handleCompleteAttempt を本ファイルの完成版へ差し替え。
// 5. AttemptProgress.gs: validateSaveAttemptProgressPayload_・handleSaveAttemptProgress・
//    handleAbandonAttemptProgress を本ファイルの完成版へ差し替え。
// 6. handleGetAttemptProgress・handleGetStudentHistory・handleSaveAnswerRecordは
//    変更不要（下記【変更不要な既存関数】参照）。
//
// 【今回変更しないこと】
// - answer_records シート・ANSWER_RECORDS_HEADERS：列追加0（AnswerRecordはattemptId経由で
//   Attemptへ辿れるため、runId/reviewRoundの直接保持は不要と判断、Phase4E-0監査の結論どおり）。
// - Phase4E本体（全問正解まで自動反復のWeb側ループ・UI）：本ファイルは基盤のみ。
// - TestSet専用GAS（school_master/test_set/test_set_questions）：無関係、変更0。
//
// 【正式契約（Phase4E-0A確定）】
// - runId: TestSet実行1回（通常group〜全review周〜任意反復）を一意に識別する。
//   sourceType="testset"/"testset_review"のときのみ必須、それ以外は指定禁止。
// - reviewRound: sourceType="testset"（通常group）は0固定。"testset_review"は1以上の整数
//   （1周目=1、2周目=2…）。それ以外のsourceTypeは指定禁止。
// - 旧runIdなしAttempt（本番反映前に保存された全Attempt）は、履歴閲覧（getStudentHistory）
//   では引き続き利用できるが、新しい複数周resumeの対象にはしない（Web側
//   test-set-review-resume.jsが、runId空のprogressをvalidationで拒否する設計のため、
//   GAS側での特別な互換処理・推測migrationは不要）。
//
// 【Phase4E-0B追加: 無停止移行（旧Web → 新GAS → 新Web）のためのlegacy/new payload契約】
// 4E-0A時点のvalidateRunIdentity_()は「testset/testset_reviewは常にrunId/reviewRoundを
// 必須とする」strict契約のみだった。この契約のままGASを先行deployすると、まだrunId/
// reviewRoundを一切送らない現行公開WebのTestSet実行（sourceType=testset/testset_review）が
// 全滅する（4E-0A契約テストで再現済み）。Phase4E-0Bで、移行期間限定の
// ALLOW_LEGACY_RUN_IDENTITY_PAYLOAD_フラグ（既定true）を追加し、
//   - legacy payload（旧Web、runId/reviewRoundを両方省略）→ 正常系として許容、
//     runId=""・reviewRound=""として保存する。
//   - new payload（新Web、必ず両方送る）→ 既存のstrict契約どおり検証する。
//   - 片方だけの指定 → legacy/newいずれでもない中間状態として常にreject（推測しない）。
// という3分岐へ拡張した。GAS側がrunIdを推測生成することは絶対に行わない
// （TestSet全groupで誤って同一runIdを機械的に割り当てると、本来別runとして扱うべき
// 実行を1つのrunへ誤集約してしまう危険があるため、Phase4E-0B比較検討でC案として不採用）。
// Web側（features/test-set-runner/test-set-run-identity.jsのvalidateRunIdentity()、
// runner/progress/Attemptの各モジュール）は一切変更しない（新Webは常にrunId/reviewRoundを
// 送る、4E-0Aのstrict契約のまま）。
//
// 【Phase4E-0B本番API検証で判明・ローカル正本へ反映済み: 既存attemptId/progress更新時の
// identity一致検証】本番反映・API検証の結果、実際に稼働中のGASは、既存attemptId/progressへ
// 異なるrunId/reviewRoundで再送信された場合に「既存値を黙って保持する」のではなく、
// 明確にreject（fail-closed）する実装であることが判明した（本ファイルの初版はこの検証を
// 持たず「既存値を保持するだけ」だった）。本番の安全側の挙動を正としてローカル正本へ
// 反映済み（handleStartAttempt・handleSaveAttemptProgress双方）。本番の実際のvalidation
// ロジックの原文は確認できていないため、エラー文言は本番実測値と完全一致させたが、
// 実装の詳細（比較方法等）が本番と完全に同一である保証はない。

// ---------------------------------------------------------------------------
// 【SheetHelpers.gsへの変更（ATTEMPTS_HEADERS、末尾追加）】
// ---------------------------------------------------------------------------
//
// 変更前（現行、Phase3D-2前提のinitialWrongQuestionIds追加後、13列）:
//
// var ATTEMPTS_HEADERS = [
//   'attemptId', 'studentId', 'questionSetId', 'questionSetVersion', 'fieldId',
//   'sourceType', 'testSetId', 'startedAt', 'completedAt', 'completed', 'score', 'totalCount',
//   'initialWrongQuestionIds'
// ];
//
// 変更後（15列）:
//
// var ATTEMPTS_HEADERS = [
//   'attemptId', 'studentId', 'questionSetId', 'questionSetVersion', 'fieldId',
//   'sourceType', 'testSetId', 'startedAt', 'completedAt', 'completed', 'score', 'totalCount',
//   'initialWrongQuestionIds', 'runId', 'reviewRound'
// ];
//
// 【本番Spreadsheet側（コードdeployより必ず先に実施）】
// 本番attemptsシートのヘッダー行（1行目）の末尾（現在N列=initialWrongQuestionIdsの次）へ、
// 手動で "runId"・"reviewRound" の2列を追加する。既存行のこの2列は空欄のまま残す
// （値の補完をしない。空欄はnormalizeString_()/toFiniteNumberOrNull_()により安全に
// ''/nullとして読み出されるだけで、Web側normalizeQuestionIdList()と同じ「壊れた/欠落した
// 入力はnull・情報不明として扱う」既存方針と一致する）。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 【AttemptProgress.gsへの変更（ATTEMPT_PROGRESS_HEADERS、末尾追加）】
// ---------------------------------------------------------------------------
//
// 変更前（現行、Phase3C前提のretryWrongEnabled追加後、14列）:
//
// var ATTEMPT_PROGRESS_HEADERS = [
//   "attemptId", "studentId", "fieldId", "unit", "sourceType", "testSetId",
//   "questionIds", "currentQuestionIndex", "wrongQuestionIds", "retryRound",
//   "retryWrongEnabled", "status", "startedAt", "updatedAt"
// ];
//
// 変更後（16列）:
//
// var ATTEMPT_PROGRESS_HEADERS = [
//   "attemptId", "studentId", "fieldId", "unit", "sourceType", "testSetId",
//   "questionIds", "currentQuestionIndex", "wrongQuestionIds", "retryRound",
//   "retryWrongEnabled", "status", "startedAt", "updatedAt", "runId", "reviewRound"
// ];
//
// 【本番Spreadsheet側（コードdeployより必ず先に実施）】
// attemptsと同じ手順（末尾へ"runId"・"reviewRound"を手動追加、既存行は空欄のまま）。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 【runId/reviewRoundのvalidation（新規、共有ロジック）】
//
// Web側 features/test-set-runner/test-set-run-identity.js の validateRunIdentity() は、
// 「新Web（必ずrunId/reviewRoundを送る）」のstrict契約のみを表す（4E-0Aのまま無変更）。
// 本関数（GAS側）は、Phase4E-0Bで**移行期間専用の許容ルールを追加**しており、
// 新Web契約とは完全一致しない（意図的な非対称）。GAS側は「新Web（両方指定）」と
// 「旧Web（両方省略）」の両方を受け付ける必要があるのに対し、Web側は常に新Web契約
// だけを満たせばよいため。
//
// 【Phase4E-0B: 無停止移行のためのlegacy/new payload契約】
// - legacy payload（旧Web、runId/reviewRoundを送らない）: ALLOW_LEGACY_RUN_IDENTITY_PAYLOAD_が
//   trueの間、testset/testset_reviewでも「両方省略」を正常系として受け付け、
//   runId=""・reviewRound=""として保存する（GASがrunIdを推測生成することは絶対にしない）。
// - new payload（新Web、必ず両方送る）: 既存の4E-0A strict契約どおり検証する。
// - 片方だけの指定（runIdのみ／reviewRoundのみ）は、legacy/newいずれの状態にも該当しない
//   中間状態のため、移行モードの有無に関わらず常にrejectする（クライアント実装ミス・
//   通信破損の可能性が高く、無条件に許容すべきではないため）。
// - 将来、公開Webが必ずrunId/reviewRoundを送るようになったことを確認できたら、
//   ALLOW_LEGACY_RUN_IDENTITY_PAYLOAD_ をfalseへ変更する1箇所の修正だけで、
//   legacy payload（両方省略）を全面rejectするstrict契約へ切り替えられる
//   （validation関数の呼び出し元・分岐構造は変更不要）。
// ---------------------------------------------------------------------------

// Phase4E-0B: 移行期間フラグ。旧Web（公開中、runId/reviewRoundを一切送らない）からの
// testset/testset_review payloadを許容するかどうかを1箇所に集約する。
// 新Webのdeploy・本番確認が完了し、旧Webが実質的に使われなくなったことを確認できたら、
// falseへ変更する（それ以外の変更は不要）。
var ALLOW_LEGACY_RUN_IDENTITY_PAYLOAD_ = true;

/**
 * @param {string} sourceType
 * @param {*} rawRunId
 * @param {*} rawReviewRound
 * @returns {{runId:string, reviewRound:(number|'')}} 正規化済みの値
 * @throws {Error} 契約違反時（sourceTypeに対してrunId/reviewRoundが不正、または
 *   片方だけの指定という中間状態）
 */
function validateRunIdentity_(sourceType, rawRunId, rawReviewRound) {
  var runId = normalizeString_(rawRunId);
  var hasReviewRound = rawReviewRound !== null && rawReviewRound !== undefined && rawReviewRound !== '';
  var reviewRoundNum = hasReviewRound ? toFiniteNumberOrNull_(rawReviewRound) : null;

  if (sourceType === 'testset' || sourceType === 'testset_review') {
    // Phase4E-0B: legacy payload（旧Web、両方省略）を移行期間中は正常系として許容する。
    if (ALLOW_LEGACY_RUN_IDENTITY_PAYLOAD_ && !runId && !hasReviewRound) {
      return { runId: '', reviewRound: '' };
    }

    // 片方だけの指定は、legacy payloadでもnew payloadでもない中間状態のため、
    // 移行モードの有無に関わらず常に拒否する。
    if (!runId && hasReviewRound) {
      throw new Error('runIdとreviewRoundは両方指定するか、両方省略する必要があります（reviewRoundのみの指定は不正です）。');
    }
    if (runId && !hasReviewRound) {
      throw new Error('runIdとreviewRoundは両方指定するか、両方省略する必要があります（runIdのみの指定は不正です）。');
    }

    if (sourceType === 'testset') {
      if (reviewRoundNum === null || reviewRoundNum !== 0) {
        throw new Error('sourceType=testsetの場合、reviewRoundは0である必要があります。');
      }
      return { runId: runId, reviewRound: 0 };
    }

    // testset_review
    if (reviewRoundNum === null || reviewRoundNum < 1 || Math.floor(reviewRoundNum) !== reviewRoundNum) {
      throw new Error('sourceType=testset_reviewの場合、reviewRoundは1以上の整数である必要があります。');
    }
    return { runId: runId, reviewRound: reviewRoundNum };
  }

  // normal/weak_review/dormant_review（空文字列＝起点不明の旧Attempt互換を含む）は
  // runId/reviewRoundの指定自体を禁止する（既存sourceType/testSetIdルールと同じ設計方針）。
  if (runId) {
    throw new Error('sourceType=' + sourceType + 'ではrunIdを指定できません。');
  }
  if (hasReviewRound) {
    throw new Error('sourceType=' + sourceType + 'ではreviewRoundを指定できません。');
  }
  return { runId: '', reviewRound: '' };
}

// ---------------------------------------------------------------------------
// 【既存 handleStartAttempt 全文差し替え（TestSetReviewSourceType.gs反映後の状態からの
// 追加差分。本番実コードに基づく、貼り替え可能な完成版）】
// ---------------------------------------------------------------------------
//
// 変更点は以下の3箇所（testSetId必須/禁止ルール・LockService・レスポンス形式は
// 一切変更しない）:
//   (a) 既存validationの直後に、validateRunIdentity_()の呼び出しを追加。
//   (b) 【Phase4E-0B改訂】既存行更新時、リクエストのrunId/reviewRoundが既存行の値と
//       完全一致することを検証し、不一致ならreject（既存値を黙って保持するだけの
//       設計は採用しない）。runId/reviewRoundはAttempt識別子の一部であり、
//       同一attemptIdに対して異なる識別子が送られてくること自体が、クライアント側の
//       重大な実装不整合・別Attemptとの取り違えの可能性が高いため、サーバー側で
//       安全側（fail-closed）に倒す。sourceType/testSetIdのように「新しい値へ
//       差し替える」方式や、initialWrongQuestionIdsのように「既存値を黙って保持する」
//       方式のいずれとも異なる、runId/reviewRound専用の検証を持つ。
//   (c) writeRow_/appendRow_へ渡す行オブジェクトへ runId/reviewRound を追加。

function handleStartAttempt(body) {
  var attemptId = normalizeString_(body.attemptId);
  var studentId = normalizeString_(body.studentId);
  var questionSetId = normalizeString_(body.questionSetId);
  var questionSetVersion = toFiniteNumberOrNull_(body.questionSetVersion);
  var fieldId = normalizeString_(body.fieldId);
  var sourceType = normalizeString_(body.sourceType);
  var testSetId = normalizeString_(body.testSetId);
  var startedAt = normalizeString_(body.startedAt);

  if (!attemptId || !studentId || !questionSetId || questionSetVersion === null || !fieldId) {
    return errorResult_('attemptId/studentId/questionSetId/questionSetVersion/fieldIdは必須です。');
  }
  if (sourceType && SOURCE_TYPE_VALUES.indexOf(sourceType) === -1) {
    return errorResult_('sourceTypeの値が不正です。');
  }
  if ((sourceType === 'testset' || sourceType === 'testset_review') && !testSetId) {
    return errorResult_('sourceType=testset/testset_reviewの場合testSetIdが必須です。');
  }
  if (sourceType !== 'testset' && sourceType !== 'testset_review' && testSetId) {
    return errorResult_('sourceType=testset/testset_review以外ではtestSetIdを指定できません。');
  }

  // Phase4E-0A追加分。
  var runIdentity;
  try {
    runIdentity = validateRunIdentity_(sourceType, body.runId, body.reviewRound);
  } catch (runIdentityError) {
    return errorResult_(runIdentityError.message);
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return errorResult_('サーバーが混み合っています。しばらくしてから再度お試しください。');
  }

  try {
    var sheet = getValidatedSheet_(SHEET_NAMES.ATTEMPTS, ATTEMPTS_HEADERS);
    var existingRowIndex = findRowIndexByKey_(sheet, ATTEMPTS_HEADERS, ['attemptId'], [attemptId]);

    if (existingRowIndex > 0) {
      var existing = loadRowByIndex_(sheet, ATTEMPTS_HEADERS, existingRowIndex);
      if (normalizeString_(existing.studentId) !== studentId) {
        return errorResult_('既存のattemptIdは別のstudentIdに紐づいています。');
      }

      // Phase4E-0B: 既存Attemptのidentity（runId/reviewRound）とリクエストが完全一致することを
      // 検証する。既存値を黙って保持する（新しい値を無視する）方式は採用しない。
      if (
        normalizeString_(existing.runId) !== runIdentity.runId ||
        String(existing.reviewRound) !== String(runIdentity.reviewRound)
      ) {
        return errorResult_('既存のattemptIdのrunId/reviewRoundとリクエストが一致しません。');
      }

      writeRow_(sheet, ATTEMPTS_HEADERS, existingRowIndex, {
        attemptId: attemptId,
        studentId: studentId,
        questionSetId: questionSetId,
        questionSetVersion: questionSetVersion,
        fieldId: fieldId,
        sourceType: sourceType,
        testSetId: testSetId,
        startedAt: startedAt,
        completedAt: existing.completedAt,
        completed: toBoolean_(existing.completed),
        score: existing.score,
        totalCount: existing.totalCount,
        initialWrongQuestionIds: existing.initialWrongQuestionIds,
        // 直前のvalidationで既存値と完全一致することを確認済みのため、
        // どちらの値を書いても結果は同じ（既存値をそのまま維持する）。
        runId: existing.runId,
        reviewRound: existing.reviewRound
      });
    } else {
      appendRow_(sheet, ATTEMPTS_HEADERS, {
        attemptId: attemptId,
        studentId: studentId,
        questionSetId: questionSetId,
        questionSetVersion: questionSetVersion,
        fieldId: fieldId,
        sourceType: sourceType,
        testSetId: testSetId,
        startedAt: startedAt,
        completedAt: '',
        completed: false,
        score: '',
        totalCount: '',
        initialWrongQuestionIds: '',
        runId: runIdentity.runId,
        reviewRound: runIdentity.reviewRound
      });
    }

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// 【既存 handleCompleteAttempt 全文差し替え（AttemptInitialWrongQuestionIds.gs反映後の
// 状態からの追加差分。本番実コードに基づく、貼り替え可能な完成版）】
// ---------------------------------------------------------------------------
//
// 変更点は1箇所のみ: writeRow_へ渡す行オブジェクトへ、既存パターン
// （attemptId/studentId/questionSetId/questionSetVersion/fieldId/sourceType/testSetId/
// startedAtをexistingからコピーして保持する方式）と同じ扱いで runId/reviewRound を追加する。
// score/totalCount/completedAt/completed/initialWrongQuestionIdsの扱いは一切変更しない。

function handleCompleteAttempt(body) {
  var attemptId = normalizeString_(body.attemptId);
  var completedAt = normalizeString_(body.completedAt);
  var score = toFiniteNumberOrNull_(body.score);
  var totalCount = toFiniteNumberOrNull_(body.totalCount);

  if (!attemptId || !completedAt || score === null || totalCount === null) {
    return errorResult_('attemptId/completedAt/score/totalCountは必須です。');
  }

  var initialWrongQuestionIds;
  try {
    initialWrongQuestionIds = validateInitialWrongQuestionIdsField_(body.initialWrongQuestionIds);
  } catch (validationError) {
    return errorResult_(validationError.message);
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return errorResult_('サーバーが混み合っています。しばらくしてから再度お試しください。');
  }

  try {
    var sheet = getValidatedSheet_(SHEET_NAMES.ATTEMPTS, ATTEMPTS_HEADERS);
    var existingRowIndex = findRowIndexByKey_(sheet, ATTEMPTS_HEADERS, ['attemptId'], [attemptId]);
    if (existingRowIndex < 0) {
      return errorResult_('該当attemptIdが存在しません。startAttemptが未実施です。');
    }

    var existing = loadRowByIndex_(sheet, ATTEMPTS_HEADERS, existingRowIndex);

    writeRow_(sheet, ATTEMPTS_HEADERS, existingRowIndex, {
      attemptId: existing.attemptId,
      studentId: existing.studentId,
      questionSetId: existing.questionSetId,
      questionSetVersion: existing.questionSetVersion,
      fieldId: existing.fieldId,
      sourceType: existing.sourceType,
      testSetId: existing.testSetId,
      startedAt: existing.startedAt,
      completedAt: completedAt,
      completed: true,
      score: score,
      totalCount: totalCount,
      initialWrongQuestionIds: initialWrongQuestionIds,
      // Phase4E-0A追加分。Web側completeAttemptはrunId/reviewRoundを送らない
      // （features/history/learning-record-sync-integration.js syncCompleteAttempt()参照）ため、
      // 既存値をそのまま保持する（sourceType/testSetId等と同じ「existingからコピー」方式）。
      runId: existing.runId,
      reviewRound: existing.reviewRound
    });

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// 【AttemptProgress.gs: validateSaveAttemptProgressPayload_ 全文差し替え
// （本番実コードに基づく、貼り替え可能な完成版）】
// ---------------------------------------------------------------------------
//
// 変更点は2箇所のみ: (a) 既存validationの直後にvalidateRunIdentity_()を追加、
// (b) 戻り値オブジェクトへrunId/reviewRoundを追加。他は一切変更しない。

function validateSaveAttemptProgressPayload_(payload) {
  var attemptId = normalizeString_(payload.attemptId);
  var studentId = normalizeString_(payload.studentId);
  var fieldId = normalizeString_(payload.fieldId);
  var unit = normalizeString_(payload.unit);
  var sourceType = normalizeString_(payload.sourceType);
  var testSetId = normalizeString_(payload.testSetId);
  var status = normalizeString_(payload.status);

  if (!attemptId) throw new Error('attemptIdは必須です。');
  if (!studentId) throw new Error('studentIdは必須です。');
  if (!fieldId) throw new Error('fieldIdは必須です。');

  if (SOURCE_TYPE_VALUES.indexOf(sourceType) === -1) {
    throw new Error('sourceTypeが不正です: ' + sourceType);
  }

  if ((sourceType === 'testset' || sourceType === 'testset_review') && !testSetId) {
    throw new Error('sourceType=testset/testset_reviewの場合、testSetIdは必須です。');
  }
  if (sourceType !== 'testset' && sourceType !== 'testset_review' && testSetId) {
    throw new Error('sourceType=testset/testset_review以外ではtestSetIdを指定できません。');
  }

  // Phase4E-0A追加分。
  var runIdentity = validateRunIdentity_(sourceType, payload.runId, payload.reviewRound);

  if (ATTEMPT_PROGRESS_STATUS_VALUES_.indexOf(status) === -1) {
    throw new Error('statusが不正です: ' + status);
  }

  var questionIdsArray = parseJsonStringArray_(payload.questionIds, 'questionIds');
  if (questionIdsArray.length < 1) {
    throw new Error('questionIdsは1件以上必要です。');
  }
  if (hasDuplicates_(questionIdsArray)) {
    throw new Error('questionIdsに重複があります。');
  }

  var wrongQuestionIdsArray = parseJsonStringArray_(payload.wrongQuestionIds || '[]', 'wrongQuestionIds');
  if (hasDuplicates_(wrongQuestionIdsArray)) {
    throw new Error('wrongQuestionIdsに重複があります。');
  }

  var currentQuestionIndex = toFiniteNumberOrNull_(payload.currentQuestionIndex);
  if (currentQuestionIndex === null || currentQuestionIndex < 0 || Math.floor(currentQuestionIndex) !== currentQuestionIndex) {
    throw new Error('currentQuestionIndexは0以上の整数である必要があります。');
  }

  var retryRound = toFiniteNumberOrNull_(payload.retryRound);
  if (retryRound === null || retryRound < 0 || Math.floor(retryRound) !== retryRound) {
    throw new Error('retryRoundは0以上の整数である必要があります。');
  }

  if (typeof payload.retryWrongEnabled !== 'boolean') {
    throw new Error('retryWrongEnabledはtrue/falseのいずれかで必須です。');
  }
  var retryWrongEnabled = payload.retryWrongEnabled;

  var targetArrayLength = retryRound === 0 ? questionIdsArray.length : wrongQuestionIdsArray.length;
  if (currentQuestionIndex > targetArrayLength) {
    throw new Error(
      'currentQuestionIndex(' + currentQuestionIndex + ')が対象配列の長さ(' +
      targetArrayLength + ')を超えています。'
    );
  }

  return {
    attemptId: attemptId,
    studentId: studentId,
    fieldId: fieldId,
    unit: unit,
    sourceType: sourceType,
    testSetId: testSetId,
    questionIds: questionIdsArray,
    currentQuestionIndex: currentQuestionIndex,
    wrongQuestionIds: wrongQuestionIdsArray,
    retryRound: retryRound,
    retryWrongEnabled: retryWrongEnabled,
    status: status,
    runId: runIdentity.runId,
    reviewRound: runIdentity.reviewRound
  };
}

// ---------------------------------------------------------------------------
// 【AttemptProgress.gs: handleSaveAttemptProgress 全文差し替え】
// ---------------------------------------------------------------------------
//
// 変更点は3箇所（新規行appendRow_・既存行writeRow_の両方へrunId/reviewRoundを追加、
// 【Phase4E-0B改訂】既存行更新時にrunId/reviewRound一致を検証）。
// LockService・検証順序・startedAt不変ルールは一切変更しない。

function handleSaveAttemptProgress(payload) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return errorResult_('サーバーが混み合っています。しばらくしてから再度お試しください。');
  }

  try {
    var normalized;
    try {
      normalized = validateSaveAttemptProgressPayload_(payload);
    } catch (validationError) {
      return errorResult_(validationError.message);
    }

    var sheet = getOrCreateAttemptProgressSheet_();
    var rowIndex = findRowIndexByKey_(sheet, ATTEMPT_PROGRESS_HEADERS, ['attemptId'], [normalized.attemptId]);
    var nowIso = new Date().toISOString();

    if (rowIndex < 0) {
      try {
        verifyAttemptOwnershipForNewProgress_(normalized.attemptId, normalized.studentId);
      } catch (ownershipError) {
        return errorResult_(ownershipError.message);
      }

      var startedAt = payload.startedAt ? String(payload.startedAt) : nowIso;
      appendRow_(sheet, ATTEMPT_PROGRESS_HEADERS, {
        attemptId: normalized.attemptId,
        studentId: normalized.studentId,
        fieldId: normalized.fieldId,
        unit: normalized.unit,
        sourceType: normalized.sourceType,
        testSetId: normalized.testSetId,
        questionIds: JSON.stringify(normalized.questionIds),
        currentQuestionIndex: normalized.currentQuestionIndex,
        wrongQuestionIds: JSON.stringify(normalized.wrongQuestionIds),
        retryRound: normalized.retryRound,
        retryWrongEnabled: normalized.retryWrongEnabled,
        status: normalized.status,
        startedAt: startedAt,
        updatedAt: nowIso,
        runId: normalized.runId,
        reviewRound: normalized.reviewRound
      });
      return { ok: true };
    }

    var existingRow = loadRowByIndex_(sheet, ATTEMPT_PROGRESS_HEADERS, rowIndex);
    if (normalizeString_(existingRow.studentId) !== normalized.studentId) {
      return errorResult_(
        'attemptId=' + normalized.attemptId + 'のstudentIdが既存progressと一致しません。'
      );
    }

    // Phase4E-0B: 既存progressのidentity（runId/reviewRound）とリクエストが完全一致することを
    // 検証する。既存Attempt側（handleStartAttempt）と同じfail-closed方針。
    if (
      normalizeString_(existingRow.runId) !== normalized.runId ||
      String(existingRow.reviewRound) !== String(normalized.reviewRound)
    ) {
      return errorResult_('既存progressのrunId/reviewRoundとリクエストが一致しません。');
    }

    writeRow_(sheet, ATTEMPT_PROGRESS_HEADERS, rowIndex, {
      attemptId: normalized.attemptId,
      studentId: normalized.studentId,
      fieldId: normalized.fieldId,
      unit: normalized.unit,
      sourceType: normalized.sourceType,
      testSetId: normalized.testSetId,
      questionIds: JSON.stringify(normalized.questionIds),
      currentQuestionIndex: normalized.currentQuestionIndex,
      wrongQuestionIds: JSON.stringify(normalized.wrongQuestionIds),
      retryRound: normalized.retryRound,
      retryWrongEnabled: normalized.retryWrongEnabled,
      status: normalized.status,
      startedAt: existingRow.startedAt,
      updatedAt: nowIso,
      // Phase4E-0A: sourceType/testSetId等と同じく毎回同じ値をクライアントが送ってくる想定
      // （features/progress/progress-model.jsのcontextから都度組み立てる）ため、
      // 他の列と同様に毎回書き込む（既存値からの保持ではなく、正規化済みの新しい値を使う）。
      runId: normalized.runId,
      reviewRound: normalized.reviewRound
    });
    return { ok: true };
  } catch (error) {
    return errorResult_(String(error && error.message ? error.message : error));
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// 【AttemptProgress.gs: handleAbandonAttemptProgress 全文差し替え】
// ---------------------------------------------------------------------------
//
// 変更点は1箇所のみ: writeRow_へ渡す行オブジェクトへ、既存フィールド保持パターンと
// 同じ扱いでrunId/reviewRoundを追加する（追加しないとabandon時に''へ巻き戻ってしまう、
// AttemptInitialWrongQuestionIds.gsの注意事項と同種のリスクのため必須）。

function handleAbandonAttemptProgress(payload) {
  var attemptId = normalizeString_(payload.attemptId);
  if (!attemptId) {
    return errorResult_('attemptIdは必須です。');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return errorResult_('サーバーが混み合っています。しばらくしてから再度お試しください。');
  }

  try {
    var sheet = getOrCreateAttemptProgressSheet_();
    var rowIndex = findRowIndexByKey_(sheet, ATTEMPT_PROGRESS_HEADERS, ['attemptId'], [attemptId]);
    if (rowIndex < 0) {
      return errorResult_('該当attemptIdのprogressが見つかりません: ' + attemptId);
    }

    var existingRow = loadRowByIndex_(sheet, ATTEMPT_PROGRESS_HEADERS, rowIndex);
    writeRow_(sheet, ATTEMPT_PROGRESS_HEADERS, rowIndex, {
      attemptId: existingRow.attemptId,
      studentId: existingRow.studentId,
      fieldId: existingRow.fieldId,
      unit: existingRow.unit,
      sourceType: existingRow.sourceType,
      testSetId: existingRow.testSetId,
      questionIds: existingRow.questionIds,
      currentQuestionIndex: existingRow.currentQuestionIndex,
      wrongQuestionIds: existingRow.wrongQuestionIds,
      retryRound: existingRow.retryRound,
      retryWrongEnabled: existingRow.retryWrongEnabled,
      status: 'abandoned',
      startedAt: existingRow.startedAt,
      updatedAt: new Date().toISOString(),
      runId: existingRow.runId,
      reviewRound: existingRow.reviewRound
    });

    return { ok: true };
  } catch (error) {
    return errorResult_(String(error && error.message ? error.message : error));
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// 【変更不要な既存関数（確認のみ、貼り替え対象外）】
//
// - handleGetAttemptProgress: readRowsAsObjects_(sheet, ATTEMPT_PROGRESS_HEADERS)が
//   ATTEMPT_PROGRESS_HEADERSの全列を機械的にobject化するだけで、フィールドを選別しない。
//   ATTEMPT_PROGRESS_HEADERSへの列追加だけで、runId/reviewRoundは自動的にレスポンスへ
//   含まれる（questionIds/wrongQuestionIdsのような配列パースも不要、runId/reviewRoundは
//   スカラー値のため）。コード変更不要。
// - handleGetStudentHistory: readRowsAsObjects_(attemptsSheet, ATTEMPTS_HEADERS)が
//   ATTEMPTS_HEADERSの全列を機械的にobject化するだけで、フィールドを選別しない。
//   ATTEMPTS_HEADERSへの列追加だけで自動的にレスポンスへ含まれる。コード変更不要。
// - handleSaveAnswerRecord: answer_recordsシートのみ操作するため無関係・無変更。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 【互換性マトリクス（Phase4E-0B改訂: ALLOW_LEGACY_RUN_IDENTITY_PAYLOAD_=true前提）】
//
// A. 旧Web（runId/reviewRoundを送らない）× 旧GAS（runId/reviewRound未対応）: 影響なし。
// B. 旧Web × 新GAS（本ファイル反映後、移行モード）: sourceType=testset/testset_reviewで
//    runId/reviewRoundを両方送らないため、validateRunIdentity_()のlegacy分岐が正常系として
//    受け付け、runId=""・reviewRound=""として保存する。startAttempt/saveAttemptProgress
//    ともに成功する。【Phase4E-0A時点はここが即座に失敗する重大な非互換点だったが、
//    Phase4E-0Bの移行モード追加により解消した】。normal/weak_review/dormant_reviewは
//    元々runId/reviewRoundを送らないため無影響。
// C. 新Web（runId/reviewRoundを送信）× 旧GAS: ATTEMPTS_HEADERS/ATTEMPT_PROGRESS_HEADERSに
//    runId/reviewRoundの列が無いため、旧GASのwriteRow_/appendRow_はこれらのキーを
//    単に無視する（列自体が存在しないので保存されないだけで、startAttempt/
//    saveAttemptProgress自体は成功する）。ただし、この状態でTestSetを実行すると、
//    resumeに必要なrunId/reviewRoundがサーバー側に一切保存されないため、Web側の
//    test-set-review-resume.js等が「runId空」としてresume不能（fail-closed）と判定する。
//    クラッシュはしないが、複数周resumeの恩恵は得られない。→ 新Web先行公開は引き続き禁止
//    （rollout順序は「Spreadsheet→GAS→Web」を維持する）。
// D. 新Web × 新GAS（移行モード）: 新Web payloadは必ず両方指定するため、legacy分岐を
//    経由せず既存のstrict契約どおり検証・保存される。Phase4E-0Aと同じ動作。
//
// 【Phase4E-0Bの帰結】移行モード追加により、B（旧Web×新GAS）が「即座に機能全停止」から
// 「旧Web既存機能はそのまま継続、新runId/reviewRoundは空欄保存」へ変わったため、
// 「GAS deployとWeb deployの間の完全停止時間帯」という4E-0A時点の制約は解消された。
// GAS deploy後、Web deployまでの間に生徒がTestSetを実行しても、旧Webとして正常に完走できる
// （STEP9のrollout順序参照）。ただし、この間に生じたtestset_review Attemptは
// runId=""のため、新Web移行後の複数周resumeの対象にはならない（想定どおりの動作、
// 3.11.4節「旧データ」の扱いと同じ）。
//
// 移行完了後（新Webが十分に行き渡り、旧Webからのリクエストが実質的に無くなったことを
// 確認できたら）は、ALLOW_LEGACY_RUN_IDENTITY_PAYLOAD_をfalseへ変更し、legacy payload
// （両方省略）も含めてstrict契約のみを受け付けるよう切り替えることを推奨する
// （切替後の互換性はA/Dのみに縮退し、B/Cは旧Web/旧GASそのものが無くなった前提で無関係になる）。
// ---------------------------------------------------------------------------
