// Fictional table personalities; these lines are written for the game.
// Branding identifies the theme, not a live connection to any model provider.
export const CHARACTER_THEMES = Object.freeze({
 doubao: {strategy:'喜欢多看翻牌，小额下注更愿意跟；有优势也会主动下注。',name:'豆包',icon:'./assets/brands/doubao.png',check:['先留点空间，下张再说。','我先过，牌局还长着呢。'],call:['这个价位，我也来凑一手。','别急着收池，我跟上啦。'],raise:['这手我也来带个节奏。','跟了这么久，也该我加一点。'],fold:['这个价钱太高，下手再来。','先让一手，我还会回来的。'],win:['这一手，收下啦。','谢谢大家，接着玩。']},
 chatgpt: {strategy:'重视后位优势，会偷盲、延续进攻，也会选择少量再加注。',name:'ChatGPT',icon:'./assets/brands/chatgpt.svg',check:['留个空间，下一步再调整。','这一轮先过。'],call:['这个价格，值得继续。','跟上，位置也有价值。'],raise:['轮到我，给这桌提点速。','换我来出一道选择题。'],fold:['这次价格不合适。','保留筹码，换个位置再来。'],win:['这一手，先记下来。','节奏不错，下一手见。']},
 claude: {strategy:'起手牌更精选，强牌会主动加注、下更重的价值注。',name:'Claude',icon:'./assets/brands/claude.svg',check:['先过一轮，保持耐心。','我还想留一点空间。'],call:['这个尺度，可以继续。','这一次我跟。'],raise:['这次我愿意多投入一些。','既然出手，就认真一点。'],fold:['这手不勉强，下一手见。','价格变了，我先退出。'],win:['谢谢，这手很精彩。','耐心终于有了回报。']},
 glm: {strategy:'更宽的入池范围、更高的主动下注频率，持续给对手施压。',name:'GLM',icon:'./assets/brands/glm.svg',check:['缓一下，下一轮再提速。','先过，这桌还有机会。'],call:['跟上，继续给牌桌一点压力。','这轮我接。'],raise:['这轮我来定价。','把节奏再往前推一步。'],fold:['这一轮不追，下一手再来。','先收住，机会不只这一个。'],win:['这一轮，记下了。','继续下一轮。']},
 deepseek: {strategy:'听牌会半诈唬，强牌有时先过牌，再寻找反击。',name:'DeepSeek',icon:'./assets/brands/deepseek.svg',check:['先留一步，看看你怎么走。','我先过，后面还有变化。'],call:['这条线，还值得跟下去。','跟上，再看一步。'],raise:['换一个节奏，轮到你判断。','这一步，我想走得更主动。'],fold:['这条路，先到这里。','先收住，换下一手。'],win:['这一手，值得复盘。','记录结果，继续。']},
});

export const BRAND_ORDER = Object.freeze(['doubao','chatgpt','claude','glm','deepseek']);
const legacyNames = Object.freeze({NOVA:'豆包',MILO:'ChatGPT',VERA:'Claude',KAI:'GLM',RUBY:'DeepSeek'});
export function themeFor(player) { return player && !player.isHuman && !player.isRemoteHuman ? CHARACTER_THEMES[player.brand || BRAND_ORDER[player.id-1]] : null; }
export function remapLegacyText(value) { return String(value ?? '').replace(/\b(?:NOVA|MILO|VERA|KAI|RUBY)\b/g, name => legacyNames[name]); }

// Stable cosmetic variation: never consume the poker engine's RNG.
export function tableLineFor(brand, action, eventId=0) {
 const lines=CHARACTER_THEMES[brand]?.[action==='all-in'?'raise':action];
 if(!lines?.length)return '';
 return lines[Math.abs(Number(eventId)||0)%lines.length];
}
