// Uses the installed Edge browser and Vite; no browser-test dependency required.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();
const artifacts = await mkdtemp(path.join(os.tmpdir(), "feylore-clubs-ui-"));
const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { "@shared": path.join(root, "src/shared") } },
  optimizeDeps: { entries: ["tests/fixtures/clubs-ui.html"] },
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
  server: { host: "127.0.0.1", port: 5198, strictPort: true },
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
  const shot = async (name) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(artifacts, name), Buffer.from(data, "base64"));
  };
  await send("Page.enable");
  for (const width of [1280, 390]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 950,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    for (const view of process.env.CLUBS_VIEW
      ? process.env.CLUBS_VIEW.split(",")
      : process.env.CLUBS_SCENARIO
        ? []
        : [
            "overview",
            "discussions",
            "nominations",
            "current-read",
            "library",
            "reads/read-1",
            "members",
            "stats",
            "settings",
            "selection-rounds/round-1",
          ]) {
      console.log("Inspect", width, view);
      await send("Page.navigate", {
        url: "http://127.0.0.1:5198/tests/fixtures/clubs-ui.html?view=" + view,
      });
      await waitFor(
        () =>
          evaluate(
            'document.body.textContent.includes("A very long") && !document.body.textContent.includes("Loading...")',
          ),
        "club rendered: " + view + " " + width,
      );
      assert.equal(
        await evaluate(
          "document.documentElement.scrollWidth <= innerWidth + 1",
        ),
        true,
        "No page overflow " + view + " " + width,
      );
      assert.equal(
        await evaluate('document.body.textContent.includes("SECRET")'),
        false,
        "No hidden spoiler text",
      );
      assert.equal(
        await evaluate(
          '[...document.querySelectorAll("nav button")].some(e=>e.textContent==="Stats")',
        ),
        true,
        "Stats tab present",
      );
      if (view === "discussions") {
        await evaluate(
          `[...document.querySelectorAll("button")].find(e=>e.textContent === "Unread").click()`,
        );
        await waitFor(
          () =>
            evaluate(
              `!document.body.textContent.includes("A very long general discussion title")`,
            ),
          "unread filter",
        );
        assert.equal(
          await evaluate(`document.body.textContent.includes("Following")`),
          false,
        );
        await evaluate(
          `[...document.querySelectorAll("button")].find(e=>e.textContent === "All").click()`,
        );
        await waitFor(
          () =>
            evaluate(
              `document.body.textContent.includes("A very long general discussion title")`,
            ),
          "all filter",
        );
        await evaluate(
          `[...document.querySelectorAll("button")].find(e=>e.textContent === "Share a passage").click()`,
        );
        await waitFor(
          () => evaluate(`document.body.textContent.includes("Passage text")`),
          "share composer",
        );
        assert.equal(
          await evaluate(
            "document.documentElement.scrollWidth <= innerWidth + 1",
          ),
          true,
          "share form overflow",
        );
        await shot(width + "-share-composer.png");
        await evaluate(
          `[...document.querySelectorAll("form button")].find(e=>e.textContent === "Cancel").click()`,
        );
      }
      if (view === "settings") {
        for (const label of [
          "General",
          "Membership",
          "Reading",
          "Selection",
          "Danger zone",
          "Nomination period",
          "Default Club Read duration",
        ]) {
          assert.equal(
            await evaluate(
              `document.body.textContent.includes(${JSON.stringify(label)})`,
            ),
            true,
            `Settings contains ${label}`,
          );
        }
        await evaluate(
          `document.getElementById("nominationDays").scrollIntoView()`,
        );
        assert.equal(
          await evaluate(
            "document.documentElement.scrollWidth <= innerWidth + 1",
          ),
          true,
          "Settings form overflow",
        );
        await shot(width + "-settings-defaults.png");
        await evaluate(
          `[...document.querySelectorAll("button")].find(e=>e.textContent === "Edit club details").click()`,
        );
        assert.equal(
          await evaluate('!!document.getElementById("editClubName")'),
          true,
          "General edit form",
        );
      }
      await shot(width + "-" + view.replaceAll("/", "-") + ".png");
    }
    if (process.env.CLUBS_VIEW?.includes("settings")) {
      await send("Page.navigate", {
        url: "http://127.0.0.1:5198/tests/fixtures/clubs-ui.html?view=upcoming",
      });
      await waitFor(
        () => evaluate('document.body.textContent.includes("Voting closes")'),
        "global Upcoming events",
      );
      assert.equal(
        await evaluate(
          'document.body.textContent.includes("extraordinary stories")',
        ),
        true,
        "long Work title",
      );
      assert.equal(
        await evaluate(
          'document.body.textContent.includes("A long film title")',
        ),
        true,
        "mixed media event layout",
      );
      assert.equal(
        await evaluate(
          "document.documentElement.scrollWidth <= innerWidth + 1",
        ),
        true,
        "Global Upcoming overflow",
      );
      await shot(width + "-global-upcoming.png");
    }
    if (process.env.CLUBS_VIEW?.includes("members")) {
      await send("Page.navigate", {
        url: "http://127.0.0.1:5198/tests/fixtures/clubs-ui.html?view=members&scenario=many",
      });
      await waitFor(
        () => evaluate('document.body.textContent.includes("Reader 29")'),
        "thirty members",
      );
      assert.equal(
        await evaluate(
          "document.documentElement.scrollWidth <= innerWidth + 1",
        ),
        true,
        "Thirty members fit",
      );
      await shot(width + "-members-thirty.png");
      await evaluate(
        '[...document.querySelectorAll("button")].find(e=>e.textContent==="Reader 0").click()',
      );
      await waitFor(
        () =>
          evaluate('document.body.textContent.includes("Recent Club Reads")'),
        "member detail",
      );
      assert.equal(
        await evaluate(
          "document.documentElement.scrollWidth <= innerWidth + 1",
        ),
        true,
        "Member detail fits",
      );
      await shot(width + "-member-detail.png");
    }
    if (process.env.CLUBS_VIEW?.includes("stats")) {
      for (const scenario of [
        "one-read",
        "many-genres",
        "sparse-ratings",
        "rich-ratings",
      ]) {
        await send("Page.navigate", {
          url: `http://127.0.0.1:5198/tests/fixtures/clubs-ui.html?view=stats&scenario=${scenario}`,
        });
        await waitFor(
          () =>
            evaluate('document.body.textContent.includes("Reading length")'),
          `Stats ${scenario}`,
        );
        assert.equal(
          await evaluate(
            "document.documentElement.scrollWidth <= innerWidth + 1",
          ),
          true,
          `Stats ${scenario} fits`,
        );
        if (scenario === "rich-ratings") {
          const radar =
            'document.querySelector("svg[viewBox=\\"0 0 300 300\\"]")';
          await waitFor(() => evaluate(`${radar} !== null`), "rating radar");
          await evaluate(`${radar}.scrollIntoView()`);
          assert.equal(
            await evaluate(
              `${radar}.getBoundingClientRect().width <= innerWidth`,
            ),
            true,
            "Rating radar fits",
          );
        }
        await shot(width + "-stats-" + scenario + ".png");
      }
      await send("Page.navigate", {
        url: "http://127.0.0.1:5198/tests/fixtures/clubs-ui.html?view=stats&empty=1",
      });
      await waitFor(
        () =>
          evaluate('document.body.textContent.includes("Stats will appear")'),
        "empty Stats",
      );
      assert.equal(
        await evaluate(
          "document.documentElement.scrollWidth <= innerWidth + 1",
        ),
        true,
        "Empty Stats fits",
      );
      await shot(width + "-stats-empty.png");
    }
    for (const scenario of (process.env.CLUBS_VIEW
      ? []
      : [
          "many",
          "canonical",
          "voting",
          "selected",
          "middle",
          "finished",
          "beginning",
          "many-chapters",
          "no-shares",
          "no-round",
          "draft",
          "waiting",
          "exhausted",
          "many-candidates",
          "external",
          "warnings",
          "simple",
          "ranked",
          "ranked-many",
          "random",
          "hybrid",
          "submitted",
          "voting-waiting",
          "voting-closed",
          "runoff",
          "runoff-child",
          "completed",
          "hidden",
          "up-next",
          "historical",
        ]
    ).filter(
      (candidate) =>
        !process.env.CLUBS_SCENARIO ||
        process.env.CLUBS_SCENARIO.split(",").includes(candidate),
    )) {
      await send("Page.navigate", {
        url:
          "http://127.0.0.1:5198/tests/fixtures/clubs-ui.html?view=" +
          ([
            "middle",
            "finished",
            "beginning",
            "many-chapters",
            "no-shares",
          ].includes(scenario)
            ? "discussions"
            : ["many", "canonical", "voting", "selected"].includes(scenario)
              ? "overview"
              : "nominations") +
          "&scenario=" +
          scenario,
      });
      await waitFor(
        () =>
          evaluate(
            `location.search.includes("scenario=${scenario}") && document.body.textContent.includes("A very long") && !document.body.textContent.includes("Loading...") && ${
              [
                "middle",
                "finished",
                "beginning",
                "many-chapters",
                "no-shares",
              ].includes(scenario)
                ? 'document.body.textContent.includes("Discussions")'
                : ["many", "canonical", "voting", "selected"].includes(scenario)
                  ? "true"
                  : 'document.body.textContent.includes("Nominations")'
            }`,
          ),
        "scenario rendered",
      );
      assert.equal(
        await evaluate(
          "document.documentElement.scrollWidth <= innerWidth + 1",
        ),
        true,
        "Scenario overflow",
      );
      if (["ranked", "ranked-many"].includes(scenario)) {
        assert.equal(
          await evaluate(
            '[...document.querySelectorAll("button")].some(e=>e.textContent==="Move down")',
          ),
          true,
          "keyboard ranking controls",
        );
        await evaluate(
          '[...document.querySelectorAll("button")].find(e=>e.textContent==="Move down" && !e.disabled)?.click()',
        );
      }
      if (scenario === "external")
        await waitFor(
          () =>
            evaluate(
              'document.body.textContent.includes("External nomination")',
            ),
          "external nomination",
        );
      if (scenario === "hidden")
        assert.equal(
          await evaluate(
            'document.body.textContent.includes("hidden until selection completes")',
          ),
          true,
        );
      if (scenario === "submitted")
        assert.equal(
          await evaluate('document.body.textContent.includes("submitted")'),
          true,
        );
      if (scenario === "random") {
        assert.equal(
          await evaluate(
            'document.body.textContent.includes("There is no member ballot")',
          ),
          true,
        );
        assert.equal(
          await evaluate(
            '[...document.querySelectorAll("button")].some(e=>e.textContent==="Submit Vote")',
          ),
          false,
        );
      }
      if (scenario === "warnings") {
        await evaluate(
          '[...document.querySelectorAll("h3 button")].find(e=>e.textContent.includes("A very long book title"))?.click()',
        );
        await waitFor(
          () =>
            evaluate(
              'document.querySelector("[role=dialog]")?.textContent.includes("stored candidate description")',
            ),
          "candidate warning detail",
        );
        await evaluate(
          '[...document.querySelectorAll("[role=dialog] button")].find(e=>e.textContent==="Content warnings available")?.click()',
        );
        await waitFor(
          () => evaluate('document.body.textContent.includes("Violence")'),
          "warning revealed",
        );
      }
      if (scenario === "no-round")
        assert.equal(
          await evaluate(
            'document.body.textContent.includes("No selection round")',
          ),
          true,
        );
      if (scenario === "historical") {
        await evaluate(
          '[...document.querySelectorAll("button")].find(e=>e.textContent==="Past Selections").click()',
        );
        await waitFor(
          () =>
            evaluate(
              'document.body.textContent.includes("Previous selection")',
            ),
          "historical selection",
        );
      }
      if (scenario === "canonical")
        assert.equal(
          await evaluate(
            'document.body.textContent.includes("Continue Reading")',
          ),
          true,
        );
      await shot(width + "-" + scenario + ".png");
    }
    await send("Page.navigate", {
      url: "http://127.0.0.1:5198/tests/fixtures/clubs-ui.html?view=overview&empty=1&member=1",
    });
    await waitFor(
      () => evaluate('document.body.textContent.includes("current read yet")'),
      "empty state",
    );
    assert.equal(
      await evaluate('!!document.querySelector("button[aria-label=Settings]")'),
      false,
      "Member settings hidden",
    );
    await shot(width + "-empty-member.png");
    await send("Page.navigate", {
      url: "http://127.0.0.1:5198/tests/fixtures/clubs-ui.html?view=settings&member=1",
    });
    await waitFor(
      () => evaluate('document.body.textContent.includes("Club not found")'),
      "member Settings denial",
    );
    assert.equal(
      await evaluate('!!document.getElementById("nominationDays")'),
      false,
      "Member cannot reach Settings controls",
    );
  }
  console.log(
    "Clubs UI passed desktop/mobile routes, overflow, empty state, locked previews and Settings visibility. Screenshots: " +
      artifacts,
  );
} finally {
  ws?.close();
  browser.kill();
  await server.close();
}
