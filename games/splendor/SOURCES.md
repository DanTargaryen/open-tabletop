# 规则、卡表与美术来源

本项目是非官方同人实现，未获 Pokémon、Nintendo、Creatures、GAME FREAK、Space Cowboys、Asmodee 或 Korea Boardgames 授权或背书。根 MIT 许可覆盖原创程序代码，不授予第三方名称、商标、角色形象或实体游戏美术的权利。

## 规则依据（核对于 2026-09-10）

| 来源 | 用途与证据边界 |
| --- | --- |
| [Asmodee 中国发行公告](https://oo-h.asmodee.com.cn/en_US/blog/news-1/post/237) | 一手来源：确认宝可梦版的捕捉、进化、稀有度与传说／幻宝可梦主题。该公告不是完整规则书。 |
| [Korea Boardgames 产品页](https://www.koreaboardgames.com/product/detail?prdCd=PD2024002338EAXR) | 一手来源：确认官方产品、2–4 人与组件图。 |
| [Korea Boardgames 介绍](https://www.koreaboardgames.com/magazine/menuDetail?boardCd=contents&postNo=1228) | 一手来源：进化替代贵族的机制，以及稀有／传说卡。 |
| [规则书社区英文译本 v1.1](https://www.scribd.com/document/919166914/PokemonSplendor-English-Rulebook-Bifold-Print-v1-1) | 可读取的完整译本，用于动作、进化时机、预留参与进化和计分边界；不是发行方核准的英文规则。未打包译本或原版扫描。 |
| [BGG 规则译本索引](https://boardgamegeek.com/boardgame/406291/seupeulrendeo-pokemon-splendor-pokemon) | 译本及产品交叉索引；不是完整规则的权威认证。 |
| [经典基础版官方规则](https://cdn.svc.asmodee.net/production-spacecowboys/uploads/2025/10/SCSPL01EN_SPLENDOR_RULES_LIGHT.pdf) | 仅用于比较通用拿取、支付与预留机制；经典版的贵族、15 分、少卡平局规则不用于本游戏。 |

## 本实现锁定的特别版规则

- 2／3／4 人普通球每色 4／5／7 枚，大师球固定 5 枚。普通三层各展示四张，稀有与传说层各一张。
- 一次主动作：取三个不同色球；供应至少四枚时取同色两枚；预留普通卡并取可用大师球；捕捉一张卡。颜色不足时取所有剩余不同色。回合末总持球上限十枚，含大师球。
- 预留上限三张，可盲取普通牌库；无大师球也可预留。特殊卡不能预留。费用减去永久加成，支付返回供应区；大师球可替代彩球。特殊卡需实际大师球，提供双加成。
- 主动作、归还完成后，可进化一次。只看永久加成，可使用展示区或自己的预留目标；须按进化链前进一步。旧卡翻入训练师板，失去旧分数与加成。
- 回合结束达到十八分则完成当前轮。依次比较分数、训练师板张数、场上宝可梦张数，均取更多者。

数字化差异见游戏 README：随机先手、请求触发的限时代打、无合法动作时跳过，以及最终仍同分时共享胜利。没有加入 Mega、技能、徽章、额外贵族或自创卡牌效果。

## 数值卡池

`web/data.js` 的字段适配自 [LeonJoeeee/splendor-pokemon](https://github.com/LeonJoeeee/splendor-pokemon/blob/c4a0a4fe564483d9568a0a436367400a090f9657/src/data/cards.ts)，固定提交 `c4a0a4fe564483d9568a0a436367400a090f9657`。保留其 [MIT 代码许可与权利排除声明](licenses/Pokemon-reference.txt)，copyright (c) 2026 Leon (LeonJoeeee)。本项目没有复制该仓库的引擎、界面或运行时外链插画方案。

该表自述由社区卡表转录并以 PokéAPI 补充中文名称及图鉴编号。本文不把这份转录称作发行方认证数据；逐卡数值仍需实体核对。结构检查固定为 90 张／55 种，普通 35＋30＋15 张、特殊 5＋5 张，进化引用可达，特殊卡都有大师球成本与两个加成。规则实现自行编写并独立测试。

## 本地美术

`web/assets/pokemon-atlas.png` 为本项目使用内置 imagegen 绘制的原创同人图集，不是官方卡面截图或网上下载的插画。它包含 20 种宝可梦；其余 35 种使用有名称、图鉴编号、成本与加成的原创排版卡面。页面不依赖任何远程图片或字体。

这份图集涉及的宝可梦角色权利仍归各自权利人；不将角色授权包含在项目 MIT 许可中。不得以本项目署名替换角色权利声明，或将页面描述为官方产品。

生成方式：内置 imagegen。成功图集提示词：original clean playful collectible Pokemon fan-art sprite atlas; gouache softness, crisp silhouette edges; flat pale ice-blue backdrop; 5 columns and 4 rows, one complete character per tile; no official scans, card layouts, text, logos, watermarks, borders or grid lines. Row order: Pidgeotto, Nidorina, Gloom, Poliwhirl, Kadabra / Machoke, Weepinbell, Graveler, Haunter, Dragonair / Venusaur, Charizard, Blastoise, Butterfree, Beedrill / Pidgeot, Nidoqueen, Vileplume, Poliwrath, Alakazam.

原始图集 1402×1122；浏览器使用记录的分格边界展示，不改动原图。未使用或提交官方 logo、卡图、训练师画像、完整规则书、模型 API Key、托管账户 ID 或运行房间数据。
