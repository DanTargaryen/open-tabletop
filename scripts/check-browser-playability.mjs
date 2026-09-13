// Optional browser QA: use an existing Playwright installation; production has no browser dependency.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import assert from "node:assert/strict";
import { writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTabletopServer } from "../server/index.mjs";
const dataDir = await mkdtemp(join(tmpdir(), "tabletop-browser-"));
const server = await createTabletopServer({ dataDir });
await new Promise((resolve) => server.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.server.address().port}`;
const dir = resolve(process.env.QA_EVIDENCE_DIR || ".data/browser-qa") + "/";
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  headless: process.env.QA_HEADED !== "1",
  ...(process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {}),
});
const results = [],
  issues = [];
let expectedFailure = false;
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
ctx.setDefaultTimeout(15000);
const page = await ctx.newPage();
function watch(p, label) {
  p.on("pageerror", (e) =>
    issues.push({ label, type: "pageerror", message: e.message }),
  );
  p.on("console", (m) => {
    if (
      ["error", "warning"].includes(m.type()) &&
      !(
        expectedFailure &&
        m.type() === "error" &&
        m.text().startsWith("Failed to load resource:")
      )
    )
      issues.push({ label, type: m.type(), message: m.text() });
  });
  p.on("dialog", (d) => d.accept());
}
watch(page, "host");
async function check(label, fn) {
  try {
    await fn();
    results.push({ label, status: "PASS" });
    console.log("PASS", label);
  } catch (e) {
    results.push({ label, status: "FAIL", message: e.message });
    console.log("FAIL", label, e.message);
    await snap("failure").catch(() => {});
    throw e;
  }
}
async function snap(name, p = page) {
  await p.screenshot({
    path: dir + name + ".png",
    fullPage: false,
    mask: [
      p.locator("#waitingCode"),
      p.locator(".room-code"),
      p.locator("#copyGameInvite"),
      p.locator("#resumeRoomBtn"),
    ],
  });
}
try {
  await check(
    "Abracada cold load keeps setup and room entry disabled until ready",
    async () => {
      for (const online of [false, true]) {
        const cold = await ctx.newPage();
        watch(cold, "cold-load");
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const script = online ? "online-ui.js" : "ui.js";
        await cold.route(`**/abracada-what/${script}`, async (route) => {
          await gate;
          await route.continue();
        });
        try {
          await cold.goto(
            `${base}/games/abracada-what/${online ? "online" : "index"}.html`,
            { waitUntil: "commit" },
          );
          const button = cold.locator(online ? "#createRoomBtn" : "#startBtn");
          await button.waitFor();
          assert.equal(
            await button.isEnabled(),
            false,
            "no clickable launch before the module is ready",
          );
          const setup = cold.locator(
            online ? "#onlineName" : '[data-players="2"]',
          );
          assert.equal(
            await setup.isEnabled(),
            false,
            "early choices must not be silently lost",
          );
          release();
          await cold
            .locator(online ? "#createRoomBtn:enabled" : "#startBtn:enabled")
            .waitFor();
          assert.equal(await setup.isEnabled(), true);
        } finally {
          release();
          await cold.close();
        }
      }
    },
  );
  await check("Lobby: three games and all six links", async () => {
    await page.goto(base);
    await page
      .getByRole("link", { name: "出包魔法师好友房", exact: true })
      .waitFor();
    assert.equal(await page.locator(".game-actions a").count(), 6);
    await snap("lobby-desktop");
  });
  await check(
    "Splendor solo: start, reserve, AI response, refresh and lobby return",
    async () => {
      await page
        .getByRole("link", {
          name: "璀璨宝石 · 宝可梦特别款单人模式",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "开始冒险", exact: true })
        .waitFor();
      await page.locator("#name").fill("QA Trainer");
      await page.locator("#capacity").selectOption("2");
      await page.getByRole("button", { name: "开始冒险", exact: true }).click();
      await page.locator('[data-deck="1"]:enabled').waitFor();
      await page.locator('[data-deck="1"]').click();
      await page
        .getByRole("group", { name: "手中可支付的精灵球" })
        .getByLabel("大师球，持有 1 枚", { exact: true })
        .waitFor();
      await page.locator('[data-deck="1"]:enabled').waitFor();
      await snap("splendor-solo-desktop");
      await page.reload();
      await page
        .getByRole("group", { name: "手中可支付的精灵球" })
        .getByLabel("大师球，持有 1 枚", { exact: true })
        .waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await snap("splendor-solo-mobile");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page
        .getByRole("link", { name: "返回桌游大厅", exact: true })
        .click();
      await page
        .getByRole("link", {
          name: "璀璨宝石 · 宝可梦特别款单人模式",
          exact: true,
        })
        .click();
      await page
        .getByRole("heading", { name: "训练师的牌桌", exact: true })
        .waitFor();
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );
  await check(
    "Splendor friends: create, second independent session joins, both ready, start, refresh",
    async () => {
      await page
        .getByRole("link", { name: "好友联机 ↗", exact: true })
        .click();
      await page
        .getByRole("button", { name: "创建好友房", exact: true })
        .waitFor();
      await page.locator("#capacity").selectOption("3");
      await page
        .getByRole("button", { name: "创建好友房", exact: true })
        .click();
      await page.locator(".room-code").waitFor();
      const code = await page.locator(".room-code").innerText();
      const guestCtx = await browser.newContext({
          viewport: { width: 390, height: 844 },
        }),
        guest = await guestCtx.newPage();
      watch(guest, "splendor-guest");
      await guest.goto(base + "/games/splendor/online.html?room=" + code);
      await guest.locator("#name").fill("QA Friend");
      assert.equal(await guest.locator("#room-code").inputValue(), code);
      await guest.getByRole("button", { name: "加入", exact: true }).click();
      await guest.getByRole("heading", { name: "训练师集合" }).waitFor();
      await guest
        .getByRole("button", { name: "我准备好了", exact: true })
        .click();
      if (
        await page
          .getByRole("button", { name: "我准备好了", exact: true })
          .count()
      )
        await page
          .getByRole("button", { name: "我准备好了", exact: true })
          .click();
      await page.locator(".roster").filter({ hasText: "QA Friend" }).waitFor();
      await page.locator("#start-room:enabled").waitFor();
      await snap("splendor-room-desktop");
      await snap("splendor-room-mobile", guest);
      await page.locator("#start-room").click();
      await page.locator(".players").waitFor();
      await guest.locator(".players").waitFor();
      assert.equal(await page.locator(".players article").count(), 3);
      assert.equal(await guest.locator(".players article").count(), 3);
      await guest.reload();
      await guest.locator(".players").waitFor();
      await guestCtx.close();
    },
  );
  await check(
    "Abracada solo: start, cast, AI response, hidden own rack, mobile and return",
    async () => {
      await page.goto(base);
      await page
        .getByRole("link", { name: "出包魔法师单人模式", exact: true })
        .click();
      await page.locator('[data-mode="single"]').click();
      await page.locator('[data-players="2"]').click();
      await page.locator("#startBtn").click();
      await page.locator("#game:not(.hidden)").waitFor();
      await page.locator("#spellbookToggle").click();
      await page.locator('[data-spell="8"]:enabled').waitFor();
      await page.locator('[data-spell="8"]').click();
      await page.waitForFunction(() =>
        document.querySelector("#eventLog").textContent.includes("魔力药水"),
      );
      await page.waitForFunction(
        () => !document.body.classList.contains("action-running"),
      );
      await snap("abracada-solo-desktop");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator("#spellbookToggle").click();
      await page.locator("#spellbookPanel.open").waitFor();
      await snap("abracada-solo-mobile");
      if (await page.locator("#stopBtn:not(.hidden)").count()) {
        await page.locator("#stopBtn").click();
      }
      await page
        .locator("#eventLog .event.cast")
        .filter({ hasText: "星辉 宣告" })
        .waitFor({ state: "attached" });
      assert.equal(
        (await page.locator("#humanSeat .human-rack .back").count()) > 0,
        true,
      );
      await page
        .getByRole("link", { name: "返回桌游大厅", exact: true })
        .click();
      await page.getByRole("heading", { name: "选个游戏，开一桌。" }).waitFor();
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );
  await check(
    "Abracada friends: create, second independent session joins, ready, AI fill, refresh",
    async () => {
      await page
        .getByRole("link", { name: "出包魔法师好友房", exact: true })
        .click();
      await page.locator("#onlineName").fill("QA Wizard");
      await page.locator("#roomMode").selectOption("single");
      await page.locator("#roomPlayers").selectOption("3");
      await page.locator("#createRoomBtn").click();
      await page.locator("#roomWaiting:not(.hidden)").waitFor();
      const code = await page.locator("#waitingCode").innerText();
      const guestCtx = await browser.newContext({
          viewport: { width: 390, height: 844 },
        }),
        guest = await guestCtx.newPage();
      watch(guest, "abracada-guest");
      await guest.goto(base + "/games/abracada-what/online.html?room=" + code);
      await guest.locator("#onlineName").fill("QA Mage");
      assert.equal(await guest.locator("#joinCode").inputValue(), code);
      await guest.locator("#joinRoomBtn").click();
      await guest.locator("#roomWaiting:not(.hidden)").waitFor();
      await guest.locator("#readyRoomBtn").click();
      await page.locator("#startRoomBtn:enabled").waitFor();
      await snap("abracada-room-desktop");
      await snap("abracada-room-mobile", guest);
      await page.locator("#startRoomBtn").click();
      await page.locator("#game:not(.hidden)").waitFor();
      await guest.locator("#game:not(.hidden)").waitFor();
      assert.equal(
        (await page.locator("#humanSeat .human-rack .back").count()) > 0,
        true,
      );
      await guest.reload();
      await guest.locator("#game:not(.hidden)").waitFor();
      assert.equal(
        (await guest.locator("#humanSeat .human-rack .back").count()) > 0,
        true,
      );
      await guestCtx.close();
    },
  );
  await check(
    "Abracada transient restore failures preserve the same seat and recover on retry",
    async () => {
      const identity = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("abracada.room.v1"));
        return { code: s.code, token: s.token };
      });
      for (const failure of ["503", "network", "invalid-json"]) {
        expectedFailure = true;
        await page.route("**/api/abracada/rooms/*", (route) => {
          if (route.request().method() !== "GET") return route.continue();
          if (failure === "network") return route.abort("failed");
          return route.fulfill({
            status: 503,
            contentType:
              failure === "invalid-json" ? "text/html" : "application/json",
            body:
              failure === "invalid-json"
                ? "<html>Unavailable</html>"
                : JSON.stringify({ error: "Temporary QA interruption" }),
          });
        });
        await page.reload();
        await page.locator("#onlineLobby:not(.hidden)").waitFor();
        await page.locator("#netError").filter({ hasText: /.+/ }).waitFor();
        assert.equal(
          await page.evaluate((expected) => {
            const s = JSON.parse(localStorage.getItem("abracada.room.v1"));
            return Boolean(
              s && s.code === expected.code && s.token === expected.token,
            );
          }, identity),
          true,
          "an interrupted restore must retain the original identity",
        );
        await page.locator("#resumeRoomBtn:not(.hidden)").waitFor();
        if (failure === "503") await snap("abracada-recovery-retry");
        await page.unroute("**/api/abracada/rooms/*");
        expectedFailure = false;
        await page.locator("#resumeRoomBtn").click();
        await page.locator("#game:not(.hidden)").waitFor();
      }
    },
  );
  await check(
    "Abracada an explicitly invalid seat clears recovery and offers a fresh entry",
    async () => {
      expectedFailure = true;
      await page.route("**/api/abracada/rooms/*", (route) =>
        route.request().method() === "GET"
          ? route.fulfill({
              status: 403,
              contentType: "application/json",
              body: JSON.stringify({ error: "Seat no longer valid" }),
            })
          : route.continue(),
      );
      await page.reload();
      await page
        .locator("#netError")
        .filter({ hasText: "Seat no longer valid" })
        .waitFor();
      assert.equal(
        await page.evaluate(() => localStorage.getItem("abracada.room.v1")),
        null,
      );
      await page.locator("#resumeRoomBtn").waitFor({ state: "hidden" });
      await page.unroute("**/api/abracada/rooms/*");
      expectedFailure = false;
    },
  );
  await check("No unexpected JavaScript, WebGL or resource errors", async () =>
    assert.deepEqual(issues, []),
  );
} catch (e) {
  process.exitCode = 1;
} finally {
  await writeFile(
    dir + "result.json",
    JSON.stringify(
      { base, browser: browser.version(), results, issues },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, issues }, null, 2));
  await browser.close();
  await server.close();
  await rm(dataDir, { recursive: true, force: true });
}
