# Open Tabletop

[![CI](https://github.com/DanTargaryen/open-tabletop/actions/workflows/ci.yml/badge.svg)](https://github.com/DanTargaryen/open-tabletop/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/Code-MIT-d2b77c)](LICENSE)

一个可以自己运行、继续扩展的开源网页桌游合集。目前包含可单人或联机游玩的德州扑克，以及支持本地试玩和好友房的《出包魔法师》非官方规则原型。

[English](README.en.md) · [添加游戏](docs/adding-a-game.md) · [架构说明](docs/architecture.md) · [参与贡献](CONTRIBUTING.md)

![Open Tabletop 游戏目录](docs/collection-preview.jpg)

## 先玩一局

[打开现有德州扑克试玩](https://velvet-poker-friends.linming-dracarys.chatgpt.site)

这个链接是已有的扑克试玩站，并非本仓库合集首页的部署。自行运行本仓库后，首页会从游戏目录读取可用游戏。

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

## 本地运行

需要 **Node.js 22.13 或更新版本**。项目没有 npm 依赖，无需先执行 `npm install`。

```sh
git clone https://github.com/DanTargaryen/open-tabletop.git
cd open-tabletop
npm start
```

打开 <http://127.0.0.1:18772>。

| 页面 | 地址 |
| --- | --- |
| 桌游目录 | `/` |
| 德州扑克单人模式 | `/games/texas-holdem/index.html` |
| 德州扑克联机模式 | `/games/texas-holdem/online.html` |
| 出包魔法师本地模式 | `/games/abracada-what/index.html` |
| 出包魔法师联机模式 | `/games/abracada-what/online.html` |

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

测试覆盖两个游戏引擎、房间逻辑、隐藏信息投影、同步和根服务器。静态构建会将资源复制到 `.dist/public`；德州扑克联机需要提供 `/api/poker`，出包魔法师联机需要提供 `/api/abracada`。单独托管静态文件只能使用两个游戏的本地模式，不能提供好友房服务。

默认入口是 `server/index.mjs`，适合在自己的 Node 环境中运行。仓库也提供可选的 Cloudflare 适配器：

- `deploy/cloudflare/worker.mjs`
- `deploy/cloudflare/wrangler.example.jsonc`

示例配置中的数据库信息是占位符。使用前需要自行创建并绑定资源；本仓库不附带任何可复用的托管账户或数据库 ID。具体边界见 [架构说明](docs/architecture.md)。

## 扩展合集

每个游戏放在 `games/<game-id>/`，通过 `games/catalog.json` 出现在首页。未来游戏由实际实现和贡献逐步加入。

```text
games/
  catalog.json
  texas-holdem/
    web/        浏览器页面与资源
    server/     扑克规则与房间服务
    tests/      游戏测试
    scripts/    游戏开发工具
  abracada-what/
    web/        本地与联机页面和资源
    server/     魔法师房间服务
    tests/      法术、计分、房间与隐藏信息测试
public/         合集首页
server/         Node 服务入口
deploy/         可选平台适配器
docs/           架构与扩展指南
```

欢迎修复问题、改善交互，或提交一款完整可玩的新游戏。请先读 [贡献指南](CONTRIBUTING.md) 和 [添加游戏指南](docs/adding-a-game.md)。安全问题请按 [安全说明](SECURITY.md) 私下报告。

## 许可

项目原创代码采用 [MIT License](LICENSE)。第三方名称、标识及其他素材以 [第三方声明](THIRD_PARTY_NOTICES.md) 所列权利与许可为准。
