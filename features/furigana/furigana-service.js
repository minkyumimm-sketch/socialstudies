// features/furigana/furigana-service.js
//
// 自動ふりがな機能のコアロジック。kuroshiro.js + kuroshiro-analyzer-kuromoji
// （vendor/kuroshiro/に静的配置、npm/buildは実行時に一切使わない）を使い、
// CSV由来のテキストを「安全な構造化データ（プレーンテキスト or {base,reading}の
// ルビ単位のセグメント配列）」に変換するところまでを担当する。
//
// 重要：このファイルはHTML文字列を一切生成しない。kuroshiro本体の
// convert(..., {mode:"furigana"})はsurface_formを無エスケープでHTML文字列に
// 埋め込むため使用禁止とし、代わりにkuromojiアナライザーの形態素解析結果
// （surface_form/reading）を直接取得し、読みの割当だけをここで行う。
// 実際のDOM生成（<ruby>要素の組み立て）はfurigana-dom.jsに分離し、
// このファイルはDOM APIに一切触れない。
//
// 責務:
//   - kuroshiro/kuromoji辞書のlazy load（OFF状態では一度も呼ばれない）
//   - 形態素解析結果から、ふりがな単位のセグメント配列を組み立てる
//   - 例外辞書(furigana-exceptions.js)の適用
//   - 変換失敗時のfallback（呼び出し側へnullを返し、通常表示へ戻す）
//
// ON/OFF状態そのものはここでは持たない（furigana-state.jsに委ねる）。

import { FURIGANA_EXCEPTIONS } from "./furigana-exceptions.js";

const KUROSHIRO_SCRIPT_SRC = "./vendor/kuroshiro/kuroshiro.min.js";
const KUROMOJI_ANALYZER_SCRIPT_SRC = "./vendor/kuroshiro/kuroshiro-analyzer-kuromoji.min.js";
const KUROMOJI_DICT_PATH = "./vendor/kuroshiro/dict/";

// 長い語から先にマッチさせることで、短い部分文字列への誤マッチを防ぐ
// （例："米騒動"より先に"米"だけを拾ってしまわないようにする）。
const EXCEPTION_ENTRIES = Object.entries(FURIGANA_EXCEPTIONS).sort(
  (a, b) => b[0].length - a[0].length
);

let loadPromise = null;
let kuroshiroInstance = null;

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-furigana-src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`スクリプト読込失敗: ${src}`)));
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.dataset.furiganaSrc = src;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error(`スクリプト読込失敗: ${src}`)));
    document.head.appendChild(script);
  });
}

/**
 * kuroshiro/kuromoji辞書を初回のみ読み込み、初期化する（lazy load）。
 * OFF状態では一度も呼ばれないため、ネットワーク・CPUコストは発生しない。
 * @returns {Promise<boolean>} 初期化に成功したか
 */
export async function ensureFuriganaEngineReady() {
  if (kuroshiroInstance) return true;

  if (!loadPromise) {
    loadPromise = (async () => {
      await loadScriptOnce(KUROSHIRO_SCRIPT_SRC);
      await loadScriptOnce(KUROMOJI_ANALYZER_SCRIPT_SRC);

      // UMDビルド(browserify)がBabelトランスパイル済みESモジュールを包んでいるため、
      // window.Kuroshiro/window.KuromojiAnalyzerの実体は{default: クラス}になる
      // （named exportではなくdefault exportのため）。両対応にしておく。
      const Kuroshiro = window.Kuroshiro?.default || window.Kuroshiro;
      const KuromojiAnalyzer = window.KuromojiAnalyzer?.default || window.KuromojiAnalyzer;
      if (!Kuroshiro || !KuromojiAnalyzer) {
        throw new Error("kuroshiro/KuromojiAnalyzerのグローバル変数が見つかりません。");
      }

      const instance = new Kuroshiro();
      await instance.init(new KuromojiAnalyzer({ dictPath: KUROMOJI_DICT_PATH }));
      kuroshiroInstance = instance;
    })();
  }

  try {
    await loadPromise;
    return true;
  } catch (error) {
    console.error("furiganaエンジンの初期化に失敗しました:", error);
    loadPromise = null;
    kuroshiroInstance = null;
    return false;
  }
}

export function isFuriganaEngineReady() {
  return kuroshiroInstance !== null;
}

const KANJI_PATTERN = /[一-鿿々]/; // 々は「々」

function containsKanji(str) {
  return KANJI_PATTERN.test(str);
}

// kuromojiの読みはカタカナで返るため、ひらがなへ変換する（かな以外はそのまま）。
function katakanaToHiragana(str) {
  return String(str || "").replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/**
 * 1つの漢字含有トークンを、「ルビを振る漢字ラン」と「そのままのかな部分」に
 * 分割する（例：surface_form="開く", reading="ひらく"
 *   → [{type:"ruby",base:"開",reading:"ひら"}, {type:"text",text:"く"}]）。
 * HTML文字列を経由せず、構造化データとして組み立てる。
 */
function splitKanjiToken(surfaceForm, readingHiragana) {
  let pattern = "";
  let lastWasKanji = false;
  const chunks = [];

  for (const ch of surfaceForm) {
    if (containsKanji(ch)) {
      if (!lastWasKanji) {
        pattern += "(.+)";
        chunks.push({ kanji: true, text: ch });
        lastWasKanji = true;
      } else {
        chunks[chunks.length - 1].text += ch;
      }
    } else {
      pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      chunks.push({ kanji: false, text: ch });
      lastWasKanji = false;
    }
  }

  const match = new RegExp(`^${pattern}$`).exec(readingHiragana);

  if (!match) {
    // マッチしない場合は語全体へ読みをまとめて付与する（安全側フォールバック）
    return [{ type: "ruby", base: surfaceForm, reading: readingHiragana }];
  }

  const segments = [];
  let kanjiIndex = 1;
  for (const chunk of chunks) {
    if (chunk.kanji) {
      segments.push({ type: "ruby", base: chunk.text, reading: match[kanjiIndex] || "" });
      kanjiIndex += 1;
    } else {
      segments.push({ type: "text", text: chunk.text });
    }
  }
  return segments;
}

function convertTokenToSegments(token) {
  const surfaceForm = String(token?.surface_form || "");
  if (!surfaceForm) return [];
  if (!containsKanji(surfaceForm)) {
    return [{ type: "text", text: surfaceForm }];
  }

  const readingSource = token?.reading; // 未知語ではundefinedのことがある
  if (!readingSource) {
    return [{ type: "text", text: surfaceForm }];
  }

  return splitKanjiToken(surfaceForm, katakanaToHiragana(readingSource));
}

/**
 * 例外辞書に登録された語（複数トークンにまたがってもよい）をトークン列の
 * 連結テキストに対して検出し、該当範囲を1つの上書きルビセグメントへ差し替える。
 * @returns {Array|null} 差し替え適用後のセグメント配列。適用対象が無ければnull。
 */
function applyExceptions(tokens) {
  const fullText = tokens.map((t) => t.surface_form).join("");
  const overrideRanges = [];

  for (const [term, reading] of EXCEPTION_ENTRIES) {
    let searchFrom = 0;
    while (true) {
      const idx = fullText.indexOf(term, searchFrom);
      if (idx === -1) break;
      const end = idx + term.length;
      const overlaps = overrideRanges.some((r) => idx < r.end && end > r.start);
      if (!overlaps) {
        overrideRanges.push({ start: idx, end, base: term, reading });
      }
      searchFrom = end;
    }
  }

  if (overrideRanges.length === 0) return null;

  overrideRanges.sort((a, b) => a.start - b.start);

  const tokenRanges = [];
  let offset = 0;
  for (const t of tokens) {
    tokenRanges.push({ start: offset, end: offset + t.surface_form.length, token: t });
    offset += t.surface_form.length;
  }

  const segments = [];

  for (const range of overrideRanges) {
    while (tokenRanges.length && tokenRanges[0].end <= range.start) {
      segments.push(...convertTokenToSegments(tokenRanges.shift().token));
    }
    while (tokenRanges.length && tokenRanges[0].start < range.end) {
      tokenRanges.shift();
    }
    segments.push({ type: "ruby", base: range.base, reading: range.reading });
  }

  while (tokenRanges.length) {
    segments.push(...convertTokenToSegments(tokenRanges.shift().token));
  }

  return segments;
}

/**
 * 問題文・choice・sort項目などのテキストを、ふりがな付与用のセグメント配列へ変換する。
 * 戻り値はプレーンなデータのみ（HTML文字列・DOM要素は一切含まない）。
 * 呼び出し側はfeatures/furigana/furigana-dom.jsのrenderFuriganaSegments()で
 * DOM化すること（このファイル自身はDOM APIに触れない）。
 *
 * @param {string} text
 * @returns {Promise<Array<{type:"text",text:string}|{type:"ruby",base:string,reading:string}>|null>}
 *   nullは変換失敗（呼び出し側は通常表示へフォールバックする）
 */
export async function convertToFuriganaSegments(text) {
  const source = String(text ?? "");
  if (!source || !containsKanji(source)) {
    return [{ type: "text", text: source }];
  }

  const ok = await ensureFuriganaEngineReady();
  if (!ok || !kuroshiroInstance) return null;

  try {
    const tokens = await kuroshiroInstance._analyzer.parse(source);
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return [{ type: "text", text: source }];
    }

    const withExceptions = applyExceptions(tokens);
    if (withExceptions) return withExceptions;

    return tokens.flatMap((t) => convertTokenToSegments(t));
  } catch (error) {
    console.error("furigana変換に失敗しました:", error);
    return null;
  }
}
