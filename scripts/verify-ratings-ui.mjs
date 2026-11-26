// Uses the installed Edge browser and Vite; no browser-test dependency required.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();
const artifacts = await mkdtemp(path.join(os.tmpdir(), "feylore-ratings-ui-"));
const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { "@shared": path.join(root, "src/shared") } },
  optimizeDeps: { entries: ["tests/fixtures/ratings-ui.html"] },
  plugins: [
    react(),
    {
      name: "ratings-fixture",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          source === "../detail/BookOverviewPage" &&
          importer?.includes("BookReviewPage")
        )
          return "\0book-overview-fixture";
      },
      load(id) {
        if (id === "\0book-overview-fixture")
          return "export function BookOverviewPage() { return null; }";
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5197, strictPort: true },
});
await server.listen();
const browser = spawn(
  process.env.EDGE_PATH ??
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${artifacts}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
let ws;
try {
  const waitFor = async (check, label) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      try {
        const result = await check();
        if (result) return result;
      } catch {
        /* Wait for startup/render. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out: ${label}`);
  };
  const port = await waitFor(
    async () =>
      (
        await readFile(path.join(artifacts, "DevToolsActivePort"), "utf8")
      ).split("\n")[0],
    "Edge startup",
  );
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(
    targets.find((target) => target.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const handler = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handler?.reject(message.error);
    else handler?.resolve(message.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const click = async (label) => {
    const result = await evaluate(
      `(() => { const el = [...document.querySelectorAll('button,a')].find(e => e.textContent.trim() === ${JSON.stringify(label)}); if (!el || el.matches(':disabled')) return false; el.click(); return true; })()`,
    );
    assert.equal(result, true, `Clickable: ${label}`);
  };
  const step = (title) =>
    waitFor(
      () =>
        evaluate(
          `document.querySelector('[role="dialog"] h2[tabindex]')?.textContent === ${JSON.stringify(title)}`,
        ),
      title,
    );
  const settled = () =>
    waitFor(
      () =>
        evaluate(
          `![...document.querySelectorAll('[role="dialog"] button')].find(e => e.textContent.trim() === 'Close')?.disabled`,
        ),
      "save settled",
    );
  const input = (selector, value) =>
    evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', {bubbles:true})); })()`,
    );
  const shot = async (name) => {
    await evaluate(
      `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    );
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(artifacts, name), Buffer.from(data, "base64"));
  };
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", {
    url: "http://127.0.0.1:5197/tests/fixtures/ratings-ui.html",
  });
  await waitFor(
    () => evaluate(`!!document.getElementById('book-review-opener')`),
    "fixture load",
  );
  await click("Rate & Review");
  await step("Core Rating");
  assert.equal(
    await evaluate(
      `document.querySelector('#core-enjoyment').getAttribute('aria-valuetext')`,
    ),
    "Unrated",
  );
  await evaluate(
    `(() => { const rail = document.querySelector('#core-enjoyment'); rail.focus(); rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); })()`,
  );
  assert.equal(
    await evaluate(`document.querySelector('#core-enjoyment').value`),
    "1",
    "Keyboard selects the first valid value from unrated",
  );
  await click("Clear rating");
  assert.equal(
    await evaluate(
      `document.querySelector('#core-enjoyment').getAttribute('aria-valuetext')`,
    ),
    "Unrated",
    "A cleared dimension is unrated rather than zero",
  );
  await input("#core-enjoyment", "4.5");
  assert.equal(
    await evaluate(`document.querySelector('#core-enjoyment').value`),
    "4.5",
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[data-rating-dimension] output').textContent`,
    ),
    "4.5",
  );
  await evaluate(
    `(() => { const button = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Next'); button.click(); button.click(); })()`,
  );
  await step("Genre Ratings");
  assert.equal(
    await evaluate(`window.ratingsTest.saves`),
    0,
    "Navigation does not save drafts",
  );
  assert.equal(
    await evaluate(`document.body.textContent.includes('Fantasy › Romantasy')`),
    true,
  );
  assert.equal(
    await evaluate(`document.body.textContent.includes('Worldbuilding')`),
    true,
  );
  assert.equal(
    await evaluate(
      `document.body.textContent.includes('How vivid and internally consistent was the world?')`,
    ),
    true,
  );
  await input("#genre-7071427e-66aa-4564-ab4b-a86705161f76-worldbuilding", "4");
  await click("Next");
  await step("Trajectory + Recommendation");
  await evaluate(
    `document.querySelector('button[aria-label="2 stars at 25%"]').click()`,
  );
  assert.equal(
    await evaluate(
      `document.querySelector('button[aria-label="2 stars at 25%"]').getAttribute('aria-pressed')`,
    ),
    "true",
  );
  await shot("ratings-trajectory.png");
  await evaluate(
    `document.querySelector('input[name="recommendation"]').click()`,
  );
  await click("Next");
  await step("Suggested Rating");
  await input("#final-rating", "4.5");
  assert.equal(
    await evaluate(`!!document.querySelector("#review-summary")`),
    false,
  );
  await shot("ratings-desktop.png");
  await click("Back");
  await step("Trajectory + Recommendation");
  await click("Next");
  await step("Suggested Rating");
  assert.equal(
    await evaluate(`document.querySelector('#final-rating').value`),
    "4.5",
  );
  await click("Next");
  await step("Review + Post/Save");
  await input("#review-body", "The full written review.");
  await evaluate(`window.ratingsTest.failSave = true`);
  await click("Save rating");
  await waitFor(
    () => evaluate(`!!document.querySelector('[role="alert"]')`),
    "save failure",
  );
  assert.equal(
    await evaluate(`document.querySelector('#review-body').value`),
    "The full written review.",
  );
  assert.equal(await evaluate(`window.ratingsTest.finalizations`), 0);
  await evaluate(`window.ratingsTest.failSave = false`);
  await click("Save rating");
  await waitFor(
    () => evaluate(`window.ratingsTest.finalizations === 1`),
    "finalization",
  );
  await settled();
  assert.equal(await evaluate(`window.ratingsTest.review.finalRating`), 4.5);
  assert.equal(await evaluate(`window.ratingsTest.posts`), 0);
  await evaluate(`window.ratingsTest.failPost = true`);
  await click("Post to Test provider");
  await waitFor(
    () => evaluate(`document.body.textContent.includes('Posting failed.')`),
    "post failure",
  );
  assert.equal(await evaluate(`window.ratingsTest.review.status`), "completed");
  await evaluate(`window.ratingsTest.failPost = false`);
  await click("Post to Test provider");
  await waitFor(
    () =>
      evaluate(`document.body.textContent.includes('Posted to Test provider')`),
    "post retry",
  );
  await settled();
  await click("Close");
  await waitFor(
    () => evaluate(`!document.querySelector('[role="dialog"]')`),
    "close",
  );
  await waitFor(
    () => evaluate(`document.activeElement.id === "book-review-opener"`),
    "opener focus restoration",
  );
  await click("Rate & Review");
  await step("Core Rating");
  for (const title of [
    "Genre Ratings",
    "Trajectory + Recommendation",
    "Suggested Rating",
  ]) {
    await click("Next");
    await step(title);
  }
  assert.equal(
    await evaluate(`document.querySelector('#final-rating').value`),
    "4.5",
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 700,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await click("Back");
  await step("Trajectory + Recommendation");
  await shot("ratings-mobile.png");
  assert.equal(
    await evaluate(
      `(() => { const button = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Next'); const rect = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); })()`,
    ),
    true,
    "Mobile footer is not covered by content",
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[role="dialog"]').getBoundingClientRect().width <= 390`,
    ),
    true,
  );
  // A short viewport approximates the area remaining above a mobile keyboard.
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 360,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    await evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Next').getBoundingClientRect(); return b.bottom <= innerHeight && b.top >= 0; })()`,
    ),
    true,
  );
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  assert.equal(
    await evaluate(`!!document.activeElement.closest('[role="dialog"]')`),
    true,
  );
  console.log(
    `Ratings UI passed: five steps, graph selection, no navigation drafts, retry, finalization, posting isolation, focus, desktop/mobile. Screenshots: ${artifacts}`,
  );
} finally {
  ws?.close();
  browser.kill();
  await server.close();
}
