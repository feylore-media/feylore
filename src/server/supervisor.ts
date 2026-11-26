import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig } from "./config.js";
import { createPool } from "./db/client.js";
import { applyStartupMigrations } from "./db/startup-migrations.js";

const children = new Set<ChildProcess>();
let stopping = false;

async function stop(exitCode: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  const deadline = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 25000);
  deadline.unref();
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) resolve();
          else child.once("exit", () => resolve());
        }),
    ),
  );
  clearTimeout(deadline);
  process.exitCode = exitCode;
}

function start(name: string) {
  const child = spawn(process.execPath, [`dist/server/server/${name}.js`], {
    stdio: "inherit",
  });
  children.add(child);
  child.once("error", (error) => {
    console.error(`${name} failed to start`, error);
    void stop(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${name} exited`, { code, signal });
      void stop(1);
    }
  });
}

async function waitReady(port: number) {
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health/ready`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return;
    } catch {
      /* Service is still starting. */
    }
    await delay(1000);
  }
  throw new Error(`Service on port ${port} did not become ready`);
}

async function main() {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  try {
    await applyStartupMigrations(pool);
  } finally {
    await pool.end();
  }
  if (stopping) return;
  start("index");
  await waitReady(config.PORT);
  if (stopping) return;
  start("worker");
  await waitReady(3001);
}

process.once("SIGTERM", () => {
  void stop(0);
});
process.once("SIGINT", () => {
  void stop(0);
});
main().catch((error) => {
  console.error(error);
  void stop(1);
});
