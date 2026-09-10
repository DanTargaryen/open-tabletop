// Fictional table personalities; these lines are written for the game.
// Branding identifies the theme, not a live connection to any model provider.
export const CHARACTER_THEMES = Object.freeze({
 doubao: {name:'豆包',icon:'./assets/brands/doubao.png',check:['我先看看，别着急。','先过，看看下一张。'],call:['好呀，我也跟一手。','这轮我跟上啦。'],raise:['那我添一点筹码。','这次，主动一点。'],fold:['这手先让一让。','没关系，下一手见。'],win:['这一手，收下啦。','谢谢大家，接着玩。']},
 chatgpt: {name:'ChatGPT',icon:'./assets/brands/chatgpt.svg',check:['先观察，再做决定。','过牌，保留选择。'],call:['这个价位，我跟。','跟上，看看后续。'],raise:['给这轮加一点变量。','我来提高一点节奏。'],fold:['保留筹码，下一手。','这次选择先退出。'],win:['这一手，先记下来。','接着看下一手。']},
 claude: {name:'Claude',icon:'./assets/brands/claude.svg',check:['慢慢来，我先过牌。','我愿意再观察一下。'],call:['可以，我跟上。','这手我想再看一张。'],raise:['我想再多下一点。','这次试着主动些。'],fold:['我愿意等下一次机会。','这手，就先到这里。'],win:['谢谢，这手很精彩。','这一手，承让了。']},
 glm: {name:'GLM',icon:'./assets/brands/glm.svg',check:['先观察这一轮。','过牌，保持节奏。'],call:['跟上，继续看走势。','这一轮，我跟注。'],raise:['我来推进这一轮。','提高一点下注尺度。'],fold:['调整节奏，下一手。','这轮先保留筹码。'],win:['这一轮，记下了。','继续下一轮。']},
 deepseek: {name:'DeepSeek',icon:'./assets/brands/deepseek.svg',check:['让我再想一步。','先看看下一步。'],call:['跟上，继续推演。','继续看下一步。'],raise:['换一种思路试试。','这一步，主动一些。'],fold:['这条路，先到这里。','先收住，换下一手。'],win:['这一手，复盘一下。','记录结果，继续。']},
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
