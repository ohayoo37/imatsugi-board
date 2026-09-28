/* 標準カードの一覧とサンプルボード。
   絵は2種類：illust＝やわらかいイラスト（Robse既存素材・一部のみ）、pict＝シンプルな絵（Robse自作・全カード）。 */
'use strict';

var LIB = [
  // 予定（いま・つぎ）に使うカード
  { key: 'play',       kind: 'activity', hira: 'あそぶ',     kanji: '遊ぶ',       pict: 'play' },
  { key: 'handwash',   kind: 'activity', hira: 'てあらい',   kanji: '手洗い',     pict: 'handwash' },
  { key: 'snack',      kind: 'activity', hira: 'おやつ',     kanji: 'おやつ',     pict: 'snack' },
  { key: 'tidy',       kind: 'activity', hira: 'かたづけ',   kanji: '片付け',     pict: 'tidy' },
  { key: 'gohome',     kind: 'activity', hira: 'かえる',     kanji: '帰る',       pict: 'gohome' },
  { key: 'homework',   kind: 'activity', hira: 'しゅくだい', kanji: '宿題',       pict: 'study' },
  { key: 'study',      kind: 'activity', hira: 'べんきょう', kanji: '勉強',       pict: 'study' },
  { key: 'reading',    kind: 'activity', hira: 'ほんをよむ', kanji: '本を読む',   pict: 'book' },
  { key: 'break',      kind: 'activity', hira: 'きゅうけい', kanji: '休けい',     pict: 'rest' },
  { key: 'exercise',   kind: 'activity', hira: 'うんどう',   kanji: '運動',       pict: 'exercise' },
  { key: 'outside',    kind: 'activity', hira: 'そとあそび', kanji: '外遊び',     pict: 'outside' },
  { key: 'drawing',    kind: 'activity', hira: 'おえかき',   kanji: 'お絵かき',   pict: 'draw' },
  { key: 'meal',       kind: 'activity', hira: 'ごはん',     kanji: 'ご飯',       pict: 'meal' },
  { key: 'brushteeth', kind: 'activity', hira: 'はみがき',   kanji: '歯みがき',   pict: 'toothbrush' },
  { key: 'change',     kind: 'activity', hira: 'きがえ',     kanji: '着替え',     pict: 'clothes' },
  { key: 'toiletTime', kind: 'activity', hira: 'トイレ',     kanji: 'トイレ',     pict: 'toilet', illust: 'toilet' },
  { key: 'sit',        kind: 'activity', hira: 'すわる',     kanji: '座る',       pict: 'sit', illust: 'sit' },
  { key: 'pickup',     kind: 'activity', hira: 'おむかえ',   kanji: 'お迎え',     pict: 'car' },
  { key: 'end',        kind: 'activity', hira: 'おわり',     kanji: '終わり',     pict: 'finish', illust: 'finish' },

  // つたえるカード（本人の気持ち・お願い）
  { key: 'rest',       kind: 'request', hira: 'やすみたい',     kanji: '休みたい',       pict: 'rest', illust: 'cooldown' },
  { key: 'help',       kind: 'request', hira: 'てつだって',     kanji: '手伝って',       pict: 'help', illust: 'help' },
  { key: 'no',         kind: 'request', hira: 'いや',           kanji: 'いや',           pict: 'no', illust: 'no' },
  { key: 'again',      kind: 'request', hira: 'もういっかい',   kanji: 'もう一回',       pict: 'again', illust: 'again' },
  { key: 'toilet',     kind: 'request', hira: 'トイレ',         kanji: 'トイレに行きたい', pict: 'toilet', illust: 'toilet' },
  { key: 'water',      kind: 'request', hira: 'おみず',         kanji: '水がほしい',     pict: 'water', illust: 'water' },
  { key: 'wait',       kind: 'request', hira: 'まって',         kanji: '待って',         pict: 'wait' },
  { key: 'trouble',    kind: 'request', hira: 'こまった',       kanji: '困った',         pict: 'trouble', illust: 'trouble' },
  { key: 'wantEnd',    kind: 'request', hira: 'おわりたい',     kanji: '終わりたい',     pict: 'wantend' },
  { key: 'quiet',      kind: 'request', hira: 'しずかにしたい', kanji: '静かにしたい',   pict: 'quiet' },
  { key: 'done',       kind: 'request', hira: 'できた',         kanji: 'できた',         pict: 'raise', illust: 'done' },
  { key: 'thanks',     kind: 'request', hira: 'ありがとう',     kanji: 'ありがとう',     pict: 'thanks', illust: 'thanks' }
];

var LIB_BY_KEY = {};
LIB.forEach(function (c) { LIB_BY_KEY[c.key] = c; });

var DEFAULT_SETTINGS = {
  completer: 'child',   // child=子どもが「おわった」を押す / adult=おとなが進める
  choices: 4,           // つたえるカードを一度に出す枚数 2/4/6
  show: 'both',         // both=絵と文字 / text=文字だけ
  pictStyle: 'illust',  // illust=やわらかいイラスト（ない場合はシンプルな絵） / pict=シンプルな絵
  fontScale: 1,         // 1 / 1.3 / 1.6
  script: 'hira',       // hira=ひらがな / kanji=漢字まじり
  theme: 'warm',        // warm / white / contrast / dark
  look: 'young',        // young=やわらかい / older=すっきり（小学生向け）
  showAll: false,       // 予定の一覧を下に出す
  speech: false         // 読み上げ（初期は無音）
};

var SAMPLES = {
  young: {
    label: 'サンプル（未就学児向け）',
    desc: 'ひらがな・やわらかいイラスト・つたえるカード4枚ずつ',
    name: 'サンプル（ようじ）',
    schedule: ['play', 'handwash', 'snack', 'tidy', 'gohome'],
    requests: ['rest', 'help', 'no', 'again', 'toilet', 'water'],
    settings: { choices: 4, script: 'hira', look: 'young', pictStyle: 'illust', theme: 'warm', showAll: false }
  },
  older: {
    label: 'サンプル（小学生向け）',
    desc: '漢字まじり・シンプルな絵・つたえるカード6枚ずつ・予定の一覧つき',
    name: 'サンプル（小学生）',
    schedule: ['homework', 'break', 'snack', 'exercise', 'tidy', 'gohome'],
    requests: ['rest', 'help', 'no', 'again', 'toilet', 'water', 'wait', 'quiet'],
    settings: { choices: 6, script: 'kanji', look: 'older', pictStyle: 'pict', theme: 'white', showAll: true }
  }
};
