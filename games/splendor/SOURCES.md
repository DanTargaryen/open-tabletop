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

全部 55 种角色统一使用 [The Artificial Pokémon Icons](https://theartificial.github.io/pokemon-icons/) 的作者自绘矢量同人图标。选取普通形态、普通颜色，尼多兰使用雌性。55 个 SVG 原样保存在 `web/assets/pokemon/`，用于全部 90 张卡；没有数字、通用图形或他种宝可梦替补。

上游固定提交：`132142217e40990f694142d9efb28ecde1e2976e`。素材目录 [_icons/README](https://github.com/TheArtificial/pokemon-icons/blob/132142217e40990f694142d9efb28ecde1e2976e/_icons/README) 明确说明图案由作者从零绘制，并允许按 CC-BY 署名分享。原文完整保留在 [素材 README](web/assets/pokemon/README.txt)。作者未指定 CC-BY 版本号，本项目不擅自补写版本，也不以仓库代码的 ISC 或本项目 MIT 替代美术授权。

署名：**The Artificial — Pokémon Icons**。未修改 SVG 内容，只在页面中缩放展示；`web/artwork.js` 逐种记录文件、图鉴编号与 SHA-256，测试核对每张卡的映射和文件哈希。网页页脚也保留作者链接。来源图片不依赖网络外链，离线静态资源包含完整图包。

此授权覆盖作者绘制的图标及其署名分享条件，不授予 Pokémon 角色、名称或商标的额外权利。不得将页面描述为官方授权产品；角色相关权利仍归原权利人，排除于代码 MIT 许可之外。

旧版的 20 种生成图集已停止使用，数字图鉴替补分支已删除。图片缺失时启动页明确提示重新加载，不会用数字卡面悄悄降级。

## AI 牌友头像

GPT、Claude、DeepSeek、豆包的主题头像原样复用本仓库扑克图标。文件与许可见 [头像来源](web/assets/brands/SOURCES.md)。每局从四种主题中抽选不重复的 AI 牌友，仍使用原有游戏策略，不调用对应品牌的模型服务。

真人玩家头像由站点所有者提供，原图保存在 `web/assets/players/human.png`；图片内容未重绘，仅在头像容器内显示。它不包含在程序代码的 MIT 授权内。
