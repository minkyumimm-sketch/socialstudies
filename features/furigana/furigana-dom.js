// features/furigana/furigana-dom.js
//
// furigana-service.jsが返す構造化データ（セグメント配列）を、安全なDOM Node/
// DocumentFragmentへ組み立てる。innerHTML代入・テンプレートリテラルによる
// HTML文字列生成は一切行わない（createElement/createTextNode/DocumentFragment/
// replaceChildrenのみを使う）。
//
// segmentのtext/base/readingに<script>やonerror等の文字列がそのまま入っていても、
// createTextNode経由のため常に「見えるだけの文字」として扱われ、HTMLとして
// 解釈されることはない（CSV由来文字列 → HTML解釈、という経路を作らない）。

/**
 * @param {Array<{type:"text",text:string}|{type:"ruby",base:string,reading:string}>} segments
 * @returns {DocumentFragment}
 */
export function buildFuriganaFragment(segments) {
  const fragment = document.createDocumentFragment();

  for (const segment of segments) {
    if (segment.type === "ruby") {
      const ruby = document.createElement("ruby");
      ruby.appendChild(document.createTextNode(segment.base));
      const rt = document.createElement("rt");
      rt.appendChild(document.createTextNode(segment.reading));
      ruby.appendChild(rt);
      fragment.appendChild(ruby);
    } else {
      fragment.appendChild(document.createTextNode(String(segment.text ?? "")));
    }
  }

  return fragment;
}

/**
 * 既存のtextContent代入と同じ見た目になる、プレーンテキスト描画用ヘルパー。
 * @param {HTMLElement} element
 * @param {string} plainText
 */
export function renderPlainText(element, plainText) {
  element.replaceChildren(document.createTextNode(String(plainText ?? "")));
}

/**
 * @param {HTMLElement} element
 * @param {Array<{type:"text",text:string}|{type:"ruby",base:string,reading:string}>} segments
 */
export function renderFuriganaSegments(element, segments) {
  element.replaceChildren(buildFuriganaFragment(segments));
}
