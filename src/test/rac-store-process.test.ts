import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RacStore } from "../rac/store.ts";

describe.skipIf(process.platform === "win32")("RAC SQLite process ownership", () => {
	let base: string;
	let root: string;
	let dataRoot: string;
	let script: string;
	let store: RacStore | undefined;
	const children: ReturnType<typeof Bun.spawn>[] = [];
	beforeEach(async () => {
		base = await realpath(await mkdtemp(join(tmpdir(), "rac-store-process-")));
		root = join(base, "project");
		dataRoot = join(base, "data");
		await mkdir(root);
		script = join(base, "owner.ts");
		await Bun.write(
			script,
			`import { RacStore } from ${JSON.stringify(import.meta.resolve("../rac/store.ts"))};
try {
 const store = await RacStore.open(process.argv[2], {dataRoot:process.argv[3]});
 if (process.argv[4] === "hold") {
  store.createSession({id:"session",threadId:"thread",protocolVersion:"0.162.1"});
  store.reserveRun({id:"run",sessionId:"session",taskId:"BACK-796",taskCreatedAt:"2026-10-24T00:00:00Z",rawTask:"raw bytes"});
  store.setRunStatus("run","running");
  store.appendEvent("run",{kind:"text",text:"committed before crash"});
  console.log(JSON.stringify({ready:true,generation:store.owner.generation}));
  setInterval(()=>store.assertOwnership(),1000);
 } else { console.log(JSON.stringify({opened:true})); store.close(); }
} catch (error) { console.log(JSON.stringify({code:error.code})); }
`,
		);
	});
	afterEach(async () => {
		for (const child of children.splice(0)) {
			if (child.exitCode === null) child.kill("SIGKILL");
			await child.exited;
		}
		store?.close();
		store = undefined;
		await rm(base, { recursive: true, force: true });
	});
	function spawn(mode: string) {
		const child = Bun.spawn([process.execPath, script, root, dataRoot, mode], { stdout: "pipe", stderr: "pipe" });
		children.push(child);
		return child;
	}
	test("a second OS process cannot own the project until the first connection closes", async () => {
		store = await RacStore.open(root, { dataRoot });
		const blocked = spawn("open");
		expect(await new Response(blocked.stdout).json()).toEqual({ code: "store_owned" });
		expect(await blocked.exited).toBe(0);
		store.assertOwnership();
		store.close();
		const allowed = spawn("open");
		expect(await new Response(allowed.stdout).json()).toEqual({ opened: true });
		expect(await allowed.exited).toBe(0);
	});
	test("SIGKILL releases ownership and committed WAL history recovers as unknown", async () => {
		const child = spawn("hold");
		const reader = child.stdout.getReader();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let first: Awaited<ReturnType<typeof reader.read>>;
		try {
			first = await Promise.race([
				reader.read(),
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(new Error("Owner readiness timeout")), 3000);
				}),
			]);
		} finally {
			clearTimeout(timer);
			reader.releaseLock();
		}
		const original = JSON.parse(new TextDecoder().decode(first.value));
		expect(original.ready).toBe(true);
		await expect(RacStore.open(root, { dataRoot })).rejects.toMatchObject({ code: "store_owned" });
		child.kill("SIGKILL");
		await child.exited;
		store = await RacStore.open(root, { dataRoot });
		expect(store.owner.generation).not.toBe(original.generation);
		expect(store.getRun("run").ownerGeneration).toBe(original.generation);
		expect(store.getRun("run").status).toBe("unknown");
		expect(store.listEvents("run").events.map((event) => event.payload)).toEqual([
			{ status: "starting" },
			{ status: "running" },
			{ text: "committed before crash" },
			{ status: "unknown", reason: "owner_restart" },
		]);
	});
});
