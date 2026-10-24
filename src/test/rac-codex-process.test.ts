import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCodexBinary, spawnCodexStdio, startCodexTransport } from "../rac/codex-process.ts";
import type { CodexTransport } from "../rac/codex-rpc.ts";

let directory: string;
let fixture: string;
let transport: CodexTransport | undefined;
beforeEach(async () => {
	directory = await realpath(await mkdtemp(join(tmpdir(), "rac-process-")));
	fixture = join(directory, "fixture.ts");
	await writeFile(
		fixture,
		`
const mode = process.argv[2];
if (mode === "descendant") {
 process.on("SIGTERM", () => {});
 setInterval(() => {}, 1000);
 console.log(JSON.stringify({ready:true}));
} else if (mode === "crash") { process.exit(7);
} else if (mode === "blocked") {
 process.on("SIGTERM", () => {});
 console.log(JSON.stringify({pid:process.pid}));
 setInterval(() => {}, 1000);
} else {
 if (mode === "stubborn") process.on("SIGTERM", () => {});
 if (mode !== "eof") {
  const child = Bun.spawn([process.execPath, import.meta.filename, "descendant"], {stdin:"ignore", stdout:"pipe", stderr:"ignore"});
  const reader = child.stdout.getReader(); await reader.read(); reader.releaseLock();
  child.unref();
  console.log(JSON.stringify({pid:process.pid,child:child.pid}));
 } else console.log(JSON.stringify({pid:process.pid}));
 process.stdin.resume();
 process.stdin.on("end", () => { if (mode !== "stubborn") process.exit(0); });
 setInterval(() => {}, 1000);
}
`,
	);
});
afterEach(async () => {
	await transport?.close();
	transport = undefined;
	await rm(directory, { recursive: true, force: true });
});

async function ready(mode: string): Promise<{ pid: number; child?: number }> {
	transport = spawnCodexStdio(process.execPath, [fixture, mode], { cwd: directory, graceMs: 150 });
	const reader = transport.stdout.getReader();
	try {
		let buffer = "";
		while (!buffer.includes("\n")) {
			const { done, value } = await reader.read();
			if (done) throw new Error("fixture closed before readiness");
			buffer += new TextDecoder().decode(value);
		}
		return JSON.parse(buffer.trim());
	} finally {
		reader.releaseLock();
	}
}

test.skipIf(process.platform === "win32")("Bun transport exits on EOF without an open listener", async () => {
	await ready("eof");
	expect(await transport?.close()).toEqual({ exitedOnEof: true, forced: false, groupStopped: true });
	expect(await transport?.close()).toEqual({ exitedOnEof: true, forced: false, groupStopped: true });
});

for (const mode of ["orphan", "stubborn"]) {
	test.skipIf(process.platform === "win32")(
		`Bun cleanup kills the owned group including a ${mode} descendant`,
		async () => {
			const { child } = await ready(mode);
			expect(typeof child).toBe("number");
			const result = await transport?.close();
			expect(result?.groupStopped).toBe(true);
			expect(result?.forced).toBe(true);
			expect(result?.exitedOnEof).toBe(mode === "orphan");
			expect(() => process.kill(child as number, 0)).toThrow();
		},
	);
}

test.skipIf(process.platform === "win32")("Bun transport detects a real process crash", async () => {
	transport = spawnCodexStdio(process.execPath, [fixture, "crash"], { cwd: directory });
	expect((await transport.closed).code).toBe(7);
	expect((await transport.close()).groupStopped).toBe(true);
});

test.skipIf(process.platform === "win32")("shutdown deadline survives a blocked stdin flush", async () => {
	await ready("blocked");
	const writing = transport?.write("x".repeat(1_048_576)).catch(() => {});
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect((await transport?.close())?.groupStopped).toBe(true);
	await writing;
});

test("binary resolution requires an absolute executable and never searches PATH", async () => {
	expect(await resolveCodexBinary(process.execPath)).toBe(await realpath(process.execPath));
	await expect(resolveCodexBinary("codex")).rejects.toThrow("absolute");
	await expect(resolveCodexBinary(join(directory, "missing"))).rejects.toThrow("absolute native");
	const batch = join(directory, "codex.cmd");
	await writeFile(batch, "echo unsafe wrapper");
	await chmod(batch, 0o700);
	await expect(resolveCodexBinary(batch)).rejects.toThrow("absolute native");
	const nonExecutable = join(directory, "codex");
	await writeFile(nonExecutable, "not executable");
	await chmod(nonExecutable, 0o600);
	await expect(resolveCodexBinary(nonExecutable)).rejects.toThrow("absolute native");
});

test.skipIf(process.platform === "win32")(
	"production factory refuses provider state inside the workspace before spawning",
	async () => {
		await expect(startCodexTransport(directory, process.execPath, join(directory, "data"))).rejects.toThrow(
			"outside the checkout",
		);
	},
);
