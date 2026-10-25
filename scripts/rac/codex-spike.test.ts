import { describe, expect, test } from "bun:test";
import { ProbeRpc, refusal, safeTrace, verifyPolicy } from "./codex-spike.ts";

function fixture(body: string): ProbeRpc {
	return new ProbeRpc(process.execPath, ["-e", body], process.cwd());
}

const readLines =
	'let b="";process.stdin.setEncoding("utf8");process.stdin.on("data",c=>{b+=c;while(b.includes("\\n")){const i=b.indexOf("\\n");const m=JSON.parse(b.slice(0,i));b=b.slice(i+1);receive(m);}});';
const print = 'const send=m=>process.stdout.write(JSON.stringify(m)+"\\n");';

describe("RAC-03 probe transport (fixtures, not model evidence)", () => {
	test("correlates out-of-order responses", async () => {
		const rpc = fixture(
			`${print}let first;function receive(m){if(!first){first=m;}else{send({id:m.id,result:"second"});send({id:first.id,result:"first"});}}${readLines}`,
		);
		try {
			const first = rpc.request("first", {});
			const second = rpc.request("second", {});
			expect(await second).toBe("second");
			expect(await first).toBe("first");
		} finally {
			await rpc.close();
		}
	});

	test("does not confuse string and numeric RPC IDs", async () => {
		const rpc = fixture(`${print}function receive(m){send({id:String(m.id),result:"wrong"});}${readLines}`);
		try {
			await expect(rpc.request("typed-id", {}, 200)).rejects.toThrow("Timeout: typed-id");
		} finally {
			await rpc.close();
		}
	});

	test("retains a completion arriving before the request response", async () => {
		const rpc = fixture(
			`${print}function receive(m){send({method:"turn/completed",params:{turn:{status:"completed"}}});send({id:m.id,result:{}});}${readLines}`,
		);
		try {
			const cursor = rpc.cursor;
			await rpc.request("turn/start", {});
			expect((await rpc.waitFor("turn/completed", cursor)).params?.turn).toEqual({ status: "completed" });
			await expect(rpc.waitFor("turn/completed", rpc.cursor, 30)).rejects.toThrow("Timeout");
		} finally {
			await rpc.close();
		}
	});

	test("rejects pending requests and event waits when the process exits", async () => {
		const rpc = fixture('process.stdin.once("data",()=>process.exit(7));');
		try {
			const results = await Promise.allSettled([rpc.request("pending", {}), rpc.waitFor("never", 0)]);
			expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
		} finally {
			await rpc.close();
		}
	});

	test("fails closed on malformed JSONL", async () => {
		const rpc = fixture('process.stdin.once("data",()=>process.stdout.write("not-json\\n"));');
		try {
			await expect(rpc.request("bad", {})).rejects.toThrow("Invalid JSONL");
		} finally {
			await rpc.close();
		}
	});

	test("bounds a stream without a newline", async () => {
		const rpc = fixture('process.stdin.once("data",()=>process.stdout.write("x".repeat(1100000)));');
		try {
			await expect(rpc.request("oversized", {})).rejects.toThrow("exceeded 1 MiB");
		} finally {
			await rpc.close();
		}
	});

	test("declines a server approval using its original typed ID", async () => {
		const rpc = fixture(
			`${print}function receive(m){if(m.method){send({id:"approval-1",method:"item/commandExecution/requestApproval",params:{command:"synthetic"}});}else{send({id:1,result:{receivedId:m.id,decision:m.result.decision}});}}${readLines}`,
		);
		try {
			expect(await rpc.request("probe", {})).toEqual({ receivedId: "approval-1", decision: "decline" });
			expect(rpc.serverRequests).toHaveLength(1);
		} finally {
			await rpc.close();
		}
	});

	test("checks normal EOF exit and separately reports forced cleanup", async () => {
		const normal = fixture('process.stdin.resume();process.stdin.on("end",()=>process.exit(0));');
		expect(await normal.close()).toEqual({ exitedOnEof: true, forced: false });
		const stuck = fixture("process.stdin.resume();setInterval(()=>{},1000);");
		expect(await stuck.close(100)).toEqual({ exitedOnEof: false, forced: true });
	});

	test("does not label an already crashed process as successful EOF shutdown", async () => {
		const rpc = fixture('process.stdin.once("data",()=>process.exit(1));');
		await expect(rpc.request("crash", {})).rejects.toThrow("closed");
		expect(await rpc.close()).toEqual({ exitedOnEof: false, forced: false });
	});
});

describe("RAC-03 safety boundaries", () => {
	test("uses request-specific denial and refuses unsupported methods", () => {
		expect(refusal({ method: "item/fileChange/requestApproval" })).toEqual({ result: { decision: "decline" } });
		expect(refusal({ method: "item/permissions/requestApproval" })).toEqual({ result: { permissions: {} } });
		expect(refusal({ method: "account/chatgptAuthTokens/refresh" })).toHaveProperty("error.code", -32601);
		expect(refusal({ method: "item/tool/call" })).toHaveProperty("error.code", -32601);
	});

	test("respects experimental availableDecisions without granting permission", () => {
		expect(
			refusal({
				method: "item/commandExecution/requestApproval",
				params: { availableDecisions: ["accept", "cancel"] },
			}),
		).toEqual({ result: { decision: "cancel" } });
		expect(
			refusal({ method: "item/commandExecution/requestApproval", params: { availableDecisions: ["accept"] } }),
		).toHaveProperty("error.code", -32602);
	});

	test("does not put message bodies, credentials or error text into the trace", () => {
		const trace = JSON.stringify(
			safeTrace({
				method: "anything",
				params: { secret: "synthetic-token", text: "private-body" },
				result: { account: "private-account" },
				error: { code: 1, message: "private-error" },
			}),
		);
		for (const value of ["synthetic-token", "private-body", "private-account", "private-error"])
			expect(trace).not.toContain(value);
	});

	test("rejects weaker effective policies including auto-review", () => {
		const valid = {
			cwd: "/probe",
			approvalPolicy: "on-request",
			approvalsReviewer: "user",
			sandbox: { type: "workspaceWrite", networkAccess: false },
		};
		expect(() => verifyPolicy(valid, "/probe")).not.toThrow();
		for (const override of [
			{ approvalPolicy: "never" },
			{ approvalsReviewer: "auto_review" },
			{ sandbox: { type: "dangerFullAccess" } },
			{ cwd: "/elsewhere" },
			{ sandbox: { type: "workspaceWrite", networkAccess: false, writableRoots: ["/elsewhere"] } },
			{ sandbox: { type: "workspaceWrite", networkAccess: true } },
		]) {
			expect(() => verifyPolicy({ ...valid, ...override }, "/probe")).toThrow("Effective thread policy");
		}
	});
});
