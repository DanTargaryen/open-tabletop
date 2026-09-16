# 架构与运行边界

Open Tabletop 将合集入口与具体游戏分开。当前包含德州扑克、宝可梦版璀璨宝石、出包魔法师、飞行棋与暗膛协议，规则和服务使用原生浏览器代码与 Node.js 内置能力；出包魔法师与暗膛协议的 3D 界面依赖 Three.js。

## 请求如何流动

```text
浏览器
  ├─ /                              → public/index.html
  ├─ /games.json                    → games/catalog.json
  ├─ /games/texas-holdem/*           → games/texas-holdem/web/*
  ├─ /games/splendor/*               → games/splendor/web/*
  ├─ /games/abracada-what/*          → games/abracada-what/web/*
  ├─ /games/aeroplane-chess/*       → games/aeroplane-chess/web/*
  ├─ /games/buckshot-roulette/*     → games/buckshot-roulette/web/*
  ├─ /api/aeroplane                 → 飞行棋独立房间处理器
  ├─ /api/buckshot                  → 暗膛协议独立房间处理器
  ├─ /api/abracada                   → 出包魔法师独立房间处理器
  ├─ /api/splendor                   → 宝可梦版独立房间处理器
  └─ /api/poker                     → 扑克房间处理器
                                         ↓
                                  规则引擎与房间状态
                                         ↓
                                  私有运行数据目录
```

`server/index.mjs` 是默认 Node 入口，负责静态资源与 API 路由。五款游戏的规则、房间管理和对应测试分别保留在 `games/texas-holdem/`、`games/splendor/`、`games/abracada-what/`、`games/aeroplane-chess/` 与 `games/buckshot-roulette/`。首页通过 `games/catalog.json` 展示实际可用的游戏。

服务端源码和数据文件属于内部实现，不应作为静态内容发送给客户端。

## 扑克逻辑

单人入口是 `/games/texas-holdem/index.html`，联机入口是 `/games/texas-holdem/online.html`。主题 AI 在本地根据游戏状态选择行动，不使用外部模型服务。

联机 API 保留 `/api/poker` 路径。房间服务校验玩家行动，推进牌局并结算主池、边池。返回给客户端的状态需要经过玩家视角处理，以保护尚不应公开的暗牌。

客户端按状态使用 1 / 2 / 5 秒的轻量同步间隔。同步实现兼容现有的新旧协议；修改协议时，需要同时检查客户端状态合并、旧请求处理和刷新恢复，不应仅测试最新页面的一条正常路径。

行动超时为 45 秒，超时后按可行动作过牌或弃牌。房间活动 TTL 为 24 小时。它们描述应用层行为，不代表服务器存在独立的精准调度服务，也不代表过期数据被安全擦除。

## 持久化与身份

默认数据目录是仓库根下的 `.data/`，可以通过 `--data-dir` 或 `DATA_DIR` 指定其他位置。运行数据必须保存在静态目录之外，并从 Git、构建输出与公开部署包中排除。

当前 Node 后端使用单实例 JSON 持久化。它适合由一个服务进程管理一份数据文件，**不支持多个服务进程共享文件**。增加副本前，应先引入支持所需并发和原子性的存储，并重新验证房间更新、超时与恢复行为。

刷新恢复依赖客户端保留的房间身份以及仍然有效的服务端状态。删除浏览器数据、房间过期或服务器数据丢失都可能使原身份无法恢复。备份、访问控制和保留周期由部署者管理。

## 运行方式

| 方式 | 提供的能力 | 部署者需要处理的部分 |
| --- | --- | --- |
| `npm start` | Node 服务、合集页面、五款游戏 API | Node 运行环境与数据目录 |
| `npm run lan` | 同上，监听 `0.0.0.0` | 局域网地址与防火墙 |
| 静态构建 | `.dist/public` 中的公开页面与资源 | 静态托管；联机仍需 API |
| Cloudflare 适配器 | 可选 Worker 入口与配置示例 | 创建并绑定自己的资源、部署与验证 |

默认端口是 `18772`；`--port` 或 `PORT` 可覆盖端口。反向代理部署可使用 `--origin https://tabletop.example.com` 或 `PUBLIC_ORIGIN` 指定公开来源地址。这个配置本身不创建域名、TLS 证书或代理服务。

静态资源构建命令是 `npm run build:static`。构建完成只表示生成了可托管资源；它不启动服务器，也不证明联机后端已经部署。

`deploy/cloudflare/worker.mjs` 与 `deploy/cloudflare/wrangler.example.jsonc` 是可选平台适配器。示例数据库绑定使用占位信息，不包含现有服务的真实资源 ID。Node 的 JSON 文件存储与平台适配器是不同运行路径，不能以一方的测试结果代替另一方的部署验证。

README 中的试玩地址是五款游戏的统一大厅。GitHub 源码更新和 Site 部署是独立步骤，线上版本以实际发布结果为准。

## 验证范围

根目录 `npm test` 用于执行规则引擎、房间、同步和根服务器测试。修改后还需要根据影响范围进行浏览器验证：单人流程、两个独立会话的联机流程、刷新恢复和窄屏操作。

测试数量与结果以当前提交的实际执行为准。旧工程中的测试记录、成功构建、启动中的进程或可打开的首页，都不能单独证明当前版本的完整联机行为。

增加游戏时，优先保持游戏目录独立，并复用必要的运行基础设施。具体接入步骤见 [添加一款游戏](adding-a-game.md)。

Cloudflare 入口接入扑克、宝可梦、出包魔法师、飞行棋与暗膛协议 API。五款游戏使用独立 D1 房间表和限流表，并发更新由 revision CAS 保护。配置示例使用 `deploy/cloudflare/migrations/`：依次应用 `0001_rooms.sql`、`0002_splendor.sql`、`0003_abracada_rooms.sql`、`0004_aeroplane_rooms.sql` 与 `0005_buckshot_rooms.sql`。旧扑克迁移目录中的出包魔法师迁移保留给已有部署；新的配置使用统一目录，不要在同一数据库重复执行两份出包魔法师建表迁移。迁移不转移 Node 本地房间数据。

## 飞行棋接入

`/games/aeroplane-chess/*` 只映射 `games/aeroplane-chess/web/`。纯规则引擎同时由本地界面和权威房间服务复用，单人与 2–4 人同屏无需后端。`/api/aeroplane` 使用独立的 `aeroplane-rooms.json`，Worker 使用 `aeroplane_rooms` 和 `aeroplane_limits`；迁移为 `0004_aeroplane_rooms.sql`。不修改其他游戏的数据表。

骰子由服务端生成，客户端只提交 roll 或 move。房间行动带 version 与 requestId，经 CAS 和重试去重；身份 token 只返回给本人，服务端存 SHA-256 摘要，投影只包含公开棋盘和不含身份凭证的名册。掷骰与选机阶段各有 45 秒超时；AI 约 1.1 秒一步。超时由轮询请求推动，每次最多一步，不是独立调度器；无人访问时不持续跑局。

浏览器定时轮询，后台降频，刷新恢复座位。断网保留身份，明确收到 403/404 才清除；同步后的棋盘用于所有操作。房间活动 TTL 为 24 小时。静态构建会自动包含目录登记的新游戏；Worker 代码和迁移验证不等于完成公网部署。

## 暗膛协议接入

`/games/buckshot-roulette/*` 只映射 `games/buckshot-roulette/web/`。规则引擎由单人界面和权威房间服务复用。`/api/buckshot` 使用独立的 `buckshot-rooms.json`，Worker 使用 `buckshot_rooms` 和 `buckshot_limits`；迁移为 `0005_buckshot_rooms.sql`。不修改其他游戏的数据表。

好友房固定双人、随机先手，没有 AI 补位。每位观看者投影到近侧 `player`，对手弹药记录和弹序不发。行动带 slot 与 requestId；肾上腺素偷取按点击的对手槽位结算。回合超时 90 秒后对对手强制开火。房间活动 TTL 为 24 小时。
