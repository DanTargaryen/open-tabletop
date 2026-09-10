# 出包魔法师 · 非官方规则原型

这是一个支持本地试玩和好友房的网页 Demo。每局可设置 2–5 个总席位：本地模式由一名真人入座；好友房支持 1–5 名真人，空位由本地概率策略补齐。AI 只使用实体游戏中自己能够看到的公开信息，不读取自己法术石的实际编号。

联机模式使用六位房间码和独立座位令牌恢复身份。服务端按玩家生成不同的隐藏信息视图：自己看不到头顶法术石，但能看到自己的秘密石；其他玩家的视图则相反。真人超时 45 秒或暂时离线时，AI 塔灵会临时代打。

## 模式

- **积分模式**：按标准单轮计分继续进行，率先达到 8 分后结束整局。
- **单局模式**：不累计积分，第一次单轮结算后结束。

## 本地运行

在仓库根目录执行：

```sh
npm start
```

- 本地模式：<http://127.0.0.1:18772/games/abracada-what/index.html>
- 联机模式：<http://127.0.0.1:18772/games/abracada-what/online.html>

好友房需要 Node 服务提供 `/api/abracada`；单独托管静态文件时只能使用本地模式。

## 验证

```sh
node --test games/abracada-what/tests/engine.test.mjs
node --test games/abracada-what/tests/rooms.test.mjs
npm test
npm run build:static
```

当前版本不包含账号、观战或外部模型调用。它没有使用原版插画、Logo、扫描件或规则书正文；相关名称及权利仍归各自权利人所有。
