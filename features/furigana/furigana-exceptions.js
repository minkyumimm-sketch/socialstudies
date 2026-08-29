// features/furigana/furigana-exceptions.js
//
// 自動ふりがな生成（kuroshiro.js + kuroshiro-analyzer-kuromoji）が誤読する
// ことが確認済みの語を、正しい読みへ丸ごと上書きするための例外辞書。
// 1語1回登録すれば、社会・理科を問わず全問題へ自動的に適用される
// （features/furigana/furigana-service.jsのapplyExceptions参照）。
//
// 追加時は「語 → ひらがなの読み」を1行足すだけでよい（CSV・app.jsの変更は不要）。
// 登録済みの語は、中3・前期期末・歴史72問（h_june3_001〜072）のPoCで
// 自動生成の誤りが実測で確認されたもの。

export const FURIGANA_EXCEPTIONS = {
  米騒動: "こめそうどう",
  "五・四運動": "ごしうんどう",
  北清事変: "ほくしんじへん",
  総力戦: "そうりょくせん",
  二十一か条の要求: "にじゅういっかじょうのようきゅう"
};
