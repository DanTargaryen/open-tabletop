# Open Tabletop

[![CI](https://github.com/DanTargaryen/open-tabletop/actions/workflows/ci.yml/badge.svg)](https://github.com/DanTargaryen/open-tabletop/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/Code-MIT-d2b77c)](LICENSE)

一个可以自己运行、继续扩展的开源网页游戏合集。**现已包含德州扑克、璀璨宝石·宝可梦特别款、出包魔法师、飞行棋、暗膛协议与钢铁远征**：支持单人本地 AI、同屏玩法或创建房间与朋友联机。

[English](README.en.md) · [添加游戏](docs/adding-a-game.md) · [架构说明](docs/architecture.md) · [参与贡献](CONTRIBUTING.md)

![Open Tabletop 游戏目录](docs/collection-preview.jpg)

## 先玩一局

**[打开游戏大厅](https://velvet-poker-friends.linming-dracarys.chatgpt.site/)**，从六款游戏中选择单人模式、同屏玩法或好友房。

[宝可梦特别款 · 单人冒险](https://velvet-poker-friends.linming-dracarys.chatgpt.site/games/splendor/) · [宝可梦特别款 · 好友联机](https://velvet-poker-friends.linming-dracarys.chatgpt.site/games/splendor/online) · [德州扑克试玩](https://velvet-poker-friends.linming-dracarys.chatgpt.site)

统一首页已部署到现有 Sites 域名；六款游戏均支持好友房，飞行棋还支持 2–4 人同屏。钢铁远征是 2D 电脑端游戏，移动使用键盘，瞄准、选弹、开火与菜单同时支持鼠标和键盘。原游戏直达路径及旧的扑克房间邀请链接继续可用。

德州扑克包含：

- 单人模式，以及可与朋友分享的联机房间。
- 豆包、ChatGPT、Claude、GLM、DeepSeek 主题 AI；它们使用本地策略，**不调用模型 API，也不需要 API Key**。
- 牌型判定、主池与边池结算，以及联机时的对手暗牌遮罩。
- 房间状态持久化、刷新恢复，以及按状态采用 1 / 2 / 5 秒间隔的轻量同步。
- 45 秒行动超时后自动过牌或弃牌；房间活动 TTL 为 24 小时。

《出包魔法师》规则原型包含：

- 本地试玩和六位房间码好友房；每局可设置 2–5 个总席位，支持 1–5 名真人，空位由只使用公开信息的本地 AI 补齐。
- 积分模式按多轮标准计分进行到 8 分，单局模式在一轮结束后直接结算。
- 完整的八种法术、连续施法限制、秘密石、人数设置特例、行动动画和窄屏布局。
- 联机时为每位玩家生成独立的隐藏信息视图，支持刷新恢复；真人 45 秒未行动或暂时离线时由 AI 塔灵代打。
- 原创 HTML/CSS 视觉，不包含原版美术、扫描件或出版方素材。

品牌名称与标识的权利归原权利人所有，不代表品牌参与或背书，也不因本仓库的 MIT 许可而转让。详见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 璀璨宝石 · 宝可梦特别款

已发行宝可梦特别版规则的非官方实现：2–4 个座位、90 张卡、捕捉与进化、特殊卡和 18 分终局。支持单人本地 AI、好友准备开局、AI 补位、刷新恢复与独立房间存储。

卡表来自社区转录，尚未逐张核对实体版；55 种宝可梦均有本地角色图片，采用 The Artificial 作者自绘、允许署名分享的统一图标，无数字替补。详见 [玩法与运行](games/splendor/README.md) 及 [规则与素材来源](games/splendor/SOURCES.md)。宝可梦联机支持 Node 服务或 Cloudflare Workers + D1；Worker 需要应用独立的宝可梦房间与限流表迁移。

## 飞行棋

新增四机竞速：6 点起飞与续掷、同色跳格、虚线飞越、撞机、精确抵达与超点反弹。支持单人对本地规则 AI、2–4 人同屏轮流操作，以及 1–4 人好友房、AI 补位、准备开局和刷新恢复。游戏内可查看固定规则变体，包含独立叠机、无路障、无三连六惩罚。

规则与界面分离；音效由本地 Web Audio 合成，音效开关持久化。好友房由服务端产生骰子、校验行动，45 秒超时后代执行一步操作，房间活动有效期 24 小时。详见 [飞行棋说明](games/aeroplane-chess/README.md) 与 [规则和素材来源](games/aeroplane-chess/SOURCES.md)。[单人 / 同屏试玩](https://velvet-poker-friends.linming-dracarys.chatgpt.site/games/aeroplane-chess/index.html) · [好友房](https://velvet-poker-friends.linming-dracarys.chatgpt.site/games/aeroplane-chess/online.html)。

## 暗膛协议

高压桌面对决：实弹与空弹混装，公开数量、隐藏顺序，用道具管理风险。支持单人对战本地规则 AI（休闲 / 标准 / 专家 / 职业），以及仅双人的好友房，没有 AI 补位。练习、黑夜与挑战三种灯光模式；黑夜隐藏对面信息，挑战换弹后可能转入黑夜。

规则引擎先结算再播动画，肾上腺素先注射再按点击槽位偷取。好友房随机先手，90 秒超时后对对手强制开火。Node 存储隔离在 `buckshot-rooms.json`；Worker 需应用 `0005_buckshot_rooms.sql`。详见大厅入口 [单人](https://velvet-poker-friends.linming-dracarys.chatgpt.site/games/buckshot-roulette/index.html) · [好友房](https://velvet-poker-friends.linming-dracarys.chatgpt.site/games/buckshot-roulette/online.html)。

## 钢铁远征

原创 2D 横版回合制坦克炮战。使用 `A/D` 移动，在左下弹弓盘中向后拖动并朝反方向发射，也可用 `W/S` 与 `Q/E` 微调方向和力度。四档七种炮弹按回合解锁，补给会恢复生命或带来稀有四档弹；爆炸会造成范围伤害并永久改变本局地形。除单人规则 AI 外，好友房提供 A1、B1、A2、B2 四个位置，真人可自由更换空位，房主可手动添加 AI，默认不添加。支持 1 对 1、2 对 1、两名真人对两名 AI；单人和多人共用简单、普通、困难三档 AI、镜头、弹道与补给逻辑。服务端按 `A1 → B1 → A2 → B2` 权威结算移动、弹道、伤害和地形。详见 [游戏说明](games/steel-arc/README.md)。

## 本地运行

需要 **Node.js 22.13 或更新版本**。首次运行时先安装本地依赖：

```sh
git clone https://github.com/DanTargaryen/open-tabletop.git
cd open-tabletop
npm install
npm start
```

打开 <http://127.0.0.1:18772>。

| 页面 | 地址 |
| --- | --- |
| 桌游目录 | `/` |
| 德州扑克单人模式 | `/games/texas-holdem/index.html` |
| 德州扑克联机模式 | `/games/texas-holdem/online.html` |
| 宝可梦特别款单人 AI | `/games/splendor/index.html` |
| 宝可梦特别款好友房 | `/games/splendor/online.html` |
| 出包魔法师本地模式 | `/games/abracada-what/index.html` |
| 出包魔法师联机模式 | `/games/abracada-what/online.html` |
| 飞行棋单人 / 同屏 | `/games/aeroplane-chess/index.html` |
| 飞行棋好友房 | `/games/aeroplane-chess/online.html` |
| 暗膛协议单人 | `/games/buckshot-roulette/index.html` |
| 暗膛协议好友房 | `/games/buckshot-roulette/online.html` |
| 钢铁远征单人 AI | `/games/steel-arc/index.html` |
| 钢铁远征好友房 | `/games/steel-arc/online.html` |

与同一局域网内的朋友一起玩：

```sh
npm run lan
```

然后让朋友访问 `http://你的局域网地址:18772`。这个命令会监听 `0.0.0.0`；设备防火墙也需要允许访问对应端口。

## 运行配置

| 配置 | 命令行参数 | 环境变量 | 默认值 |
| --- | --- | --- | --- |
| 端口 | `--port` | `PORT` | `18772` |
| 运行数据目录 | `--data-dir` | `DATA_DIR` | `.data/` |
| 对外访问的来源地址 | `--origin` | `PUBLIC_ORIGIN` | 按请求确定 |

例如，在反向代理后运行：

```sh
npm start -- --port 18772 --data-dir /absolute/path/tabletop-data --origin https://tabletop.example.com
```

`--origin` 用于配置外部来源地址；它不会自动配置域名、TLS 或反向代理。公网部署还需要你自己的 HTTPS 入口。

运行数据可能包含房间状态与恢复身份，请保存在非公开目录中，不要提交到 Git，也不要放进静态站点。当前 Node 服务使用**单实例 JSON 持久化**，不能让多个进程共享同一份数据文件。

## 验证与部署

```sh
npm test
npm run build:static
```

测试覆盖六款游戏的规则引擎，以及六款联机游戏的房间逻辑、隐藏信息投影、同步和根服务器。静态构建会将资源复制到 `.dist/public`；单人钢铁远征可直接静态运行，六款游戏的联机功能需要提供 `/api/poker`、`/api/splendor`、`/api/abracada`、`/api/aeroplane`、`/api/buckshot` 与 `/api/steel-arc` 的 Node 或 Worker + D1 后端。

默认入口是 `server/index.mjs`，适合在自己的 Node 环境中运行。仓库也提供可选的 Cloudflare 适配器：

- `deploy/cloudflare/worker.mjs`
- `deploy/cloudflare/wrangler.example.jsonc`
- `deploy/cloudflare/migrations/`：五款游戏的顺序迁移；每款游戏使用独立房间与限流表，飞行棋需应用 `0004_aeroplane_rooms.sql`，暗膛协议需应用 `0005_buckshot_rooms.sql`。

示例配置中的数据库信息是占位符。使用前需要自行创建并绑定资源；本仓库不附带任何可复用的托管账户或数据库 ID。具体边界见 [架构说明](docs/architecture.md)。

## 扩展合集

每个游戏放在 `games/<game-id>/`，通过 `games/catalog.json` 出现在首页。当前目录还包含支持单人与好友房的 2D 游戏 `steel-arc`；未来游戏由实际实现和贡献逐步加入。

```text
games/
  catalog.json
  texas-holdem/
    web/        浏览器页面与资源
    server/     扑克规则与房间服务
    tests/      游戏测试
    scripts/    游戏开发工具
  splendor/
    web/        宝可梦页面与资源
    server/     宝可梦房间服务
    tests/      游戏与房间测试
  abracada-what/
    web/        本地与联机页面和资源
    server/     魔法师房间服务
    tests/      法术、计分、房间与隐藏信息测试
  aeroplane-chess/
    web/        单人、同屏、联机页面与共享规则引擎
    server/     飞行棋权威房间服务
    tests/      规则、房间与 HTTP 测试
  buckshot-roulette/
    web/        单人与好友房页面、3D 牌桌与模型
    server/     暗膛协议权威房间服务
    tests/      规则、房间与 HTTP 测试
  steel-arc/
    web/        2D Canvas 单人、好友房与共用规则引擎
    server/     钢铁远征权威房间服务
    tests/      弹道、镜头、补给、AI、房间与 HTTP 测试
public/         合集首页
server/         Node 服务入口
deploy/         可选平台适配器
docs/           架构与扩展指南
```

欢迎修复问题、改善交互，或提交一款完整可玩的新游戏。请先读 [贡献指南](CONTRIBUTING.md) 和 [添加游戏指南](docs/adding-a-game.md)。安全问题请按 [安全说明](SECURITY.md) 私下报告。

## 许可

项目原创代码采用 [MIT License](LICENSE)。第三方名称、标识及其他素材以 [第三方声明](THIRD_PARTY_NOTICES.md) 所列权利与许可为准。
