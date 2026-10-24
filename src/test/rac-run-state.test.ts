import { describe, expect, test } from "bun:test";
import {
	admitRun,
	findTaskRuns,
	getRunWaitingFor,
	isRunStatus,
	isTerminalRunStatus,
	RunStateError,
	recoverRun,
	resolveUnknownRun,
	transitionRun,
} from "../rac/run-state.ts";
import { type AgentRun, RUN_STATUSES, type RunInteraction, type RunStatus } from "../rac/types.ts";
import type { Task } from "../types/index.ts";

const makeRun = (status: RunStatus = "starting", changes: Partial<AgentRun> = {}): AgentRun => ({
	id: "run-1",
	projectKey: "project-1",
	taskId: "BACK-793",
	taskCreatedAt: "2026-10-24T12:00:00Z",
	taskRevision: "revision-1",
	sessionId: "session-1",
	ownerGeneration: "owner-1",
	status,
	...changes,
});
const interaction = (changes: Partial<RunInteraction> = {}): RunInteraction => ({
	id: "question-1",
	runId: "run-1",
	ownerGeneration: "owner-1",
	kind: "question",
	blocking: true,
	status: "open",
	...changes,
});
const allowed: [RunStatus, RunStatus][] = [
	["starting", "running"],
	["starting", "interrupting"],
	["starting", "interrupted"],
	["starting", "failed"],
	["starting", "unknown"],
	["running", "interrupting"],
	["running", "interrupted"],
	["running", "completed"],
	["running", "failed"],
	["running", "unknown"],
	["interrupting", "interrupted"],
	["interrupting", "completed"],
	["interrupting", "failed"],
	["interrupting", "unknown"],
];

function expectConflict(operation: () => unknown, code: RunStateError["code"]): void {
	try {
		operation();
		throw new Error("Expected a RAC conflict");
	} catch (error) {
		expect(error).toBeInstanceOf(RunStateError);
		expect((error as RunStateError).status).toBe(409);
		expect((error as RunStateError).code).toBe(code);
	}
}

describe("RAC run lifecycle", () => {
	for (const from of RUN_STATUSES)
		for (const to of RUN_STATUSES) {
			test(`${from} -> ${to}`, () => {
				const run = Object.freeze(makeRun(from));
				if (from === to) expect(transitionRun(run, to, [])).toBe(run);
				else if (allowed.some(([a, b]) => a === from && b === to)) {
					expect(transitionRun(run, to, [])).toEqual({ ...run, status: to });
					expect(run.status).toBe(from);
				} else expectConflict(() => transitionRun(run, to, []), "invalid_run_transition");
			});
		}

	test("rejects unknown and display-only statuses at runtime", () => {
		for (const status of ["queued", "waiting_for_input", "waiting_for_approval", "Done", ""]) {
			expect(isRunStatus(status)).toBe(false);
			expectConflict(() => transitionRun(makeRun(), status as RunStatus, []), "invalid_run_status");
		}
	});

	test("does not finish a run whose blocking question or approval is open or uncertain", () => {
		for (const kind of [
			"question",
			"command_approval",
			"file_approval",
			"permission_approval",
			"mcp_elicitation",
		] as const) {
			for (const status of ["open", "uncertain"] as const) {
				expectConflict(
					() => transitionRun(makeRun("running"), "completed", [interaction({ kind, status })]),
					"interaction_pending",
				);
			}
		}
	});

	test("finishes after resolution, or with only nonblocking and unrelated interactions", () => {
		for (const change of [
			{ status: "answered" },
			{ status: "cleared" },
			{ status: "expired" },
			{ status: "stale" },
			{ blocking: false },
			{ runId: "another-run" },
			{ ownerGeneration: "old-owner" },
		] as Partial<RunInteraction>[]) {
			expect(transitionRun(makeRun("running"), "completed", [interaction(change)]).status).toBe("completed");
		}
	});

	test("keeps task status separate from run completion", () => {
		const task: Task = Object.freeze({
			id: "BACK-793",
			title: "Task",
			status: "Review",
			assignee: ["@human"],
			createdDate: "2026-10-24",
			labels: [],
			dependencies: [],
		});
		const completed = transitionRun(makeRun("running", { taskId: task.id }), "completed", []);
		expect(completed.status).toBe("completed");
		expect(task.status).toBe("Review");
		expect(task.assignee).toEqual(["@human"]);
	});
});

describe("RAC derived waiting", () => {
	test("shows all blocking kinds together without storing a waiting status", () => {
		const run = makeRun("running");
		const items = [interaction(), interaction({ id: "approval-1", kind: "command_approval" })];
		expect(getRunWaitingFor(run, items)).toEqual({ input: true, approval: true });
		expect(run.status).toBe("running");
		expect(getRunWaitingFor(run, items.slice(1))).toEqual({ input: false, approval: true });
	});

	test("does not let one resolved request hide another blocking request", () => {
		expect(
			getRunWaitingFor(makeRun("running"), [interaction({ status: "answered" }), interaction({ id: "question-2" })]),
		).toEqual({ input: true, approval: false });
	});

	test("ignores nonblocking, settled, uncertain, foreign-run and stale-owner interactions", () => {
		for (const change of [
			{ blocking: false },
			{ status: "answered" },
			{ status: "cleared" },
			{ status: "expired" },
			{ status: "stale" },
			{ status: "uncertain" },
			{ runId: "other" },
			{ ownerGeneration: "old-owner" },
		] as Partial<RunInteraction>[])
			expect(getRunWaitingFor(makeRun("running"), [interaction(change)])).toEqual({ input: false, approval: false });
	});

	test("offers no actionable waiting during recovery, stopping, startup or terminal states", () => {
		for (const status of RUN_STATUSES.filter((s) => s !== "running"))
			expect(getRunWaitingFor(makeRun(status), [interaction()])).toEqual({ input: false, approval: false });
	});
});

describe("RAC restart and explicit recovery", () => {
	test("recovers every nonterminal run as unknown instead of success", () => {
		for (const status of ["starting", "running", "interrupting", "unknown"] as const) {
			const run = makeRun(status);
			expect(recoverRun(run)).toEqual({ ...run, status: "unknown" });
			expect(recoverRun(recoverRun(run))).toEqual(recoverRun(run));
			expect(isTerminalRunStatus(recoverRun(run).status)).toBe(false);
		}
	});

	test("preserves all terminal records on restart", () => {
		for (const status of ["interrupted", "completed", "failed", "abandoned"] as const) {
			const run = makeRun(status);
			expect(recoverRun(run)).toBe(run);
			expect(isTerminalRunStatus(status)).toBe(true);
		}
	});

	test("requires explicit confirmation that the previous process stopped", () => {
		const run = makeRun("unknown");
		expectConflict(() => resolveUnknownRun(run, false), "recovery_unconfirmed");
		const abandoned = resolveUnknownRun(run, true);
		expect(abandoned).toEqual({ ...run, status: "abandoned" });
		expect(resolveUnknownRun(abandoned, true)).toBe(abandoned);
		expectConflict(() => resolveUnknownRun(makeRun("running"), true), "invalid_run_transition");
	});
});

describe("RAC single slot and task history", () => {
	test("rejects a second run with 409 for every active lifecycle, including unknown", () => {
		for (const status of ["starting", "running", "interrupting", "unknown"] as const) {
			const runs = Object.freeze([Object.freeze(makeRun(status))]);
			const candidate = makeRun("starting", { id: "run-2", ownerGeneration: "new-owner" });
			expectConflict(() => admitRun(runs, candidate), "run_active");
			expect(runs).toHaveLength(1);
			expect(runs[0]?.status).toBe(status);
		}
	});

	test("admits a new attempt after each terminal state without changing history", () => {
		for (const status of ["interrupted", "completed", "failed", "abandoned"] as const) {
			const previous = makeRun(status);
			const candidate = makeRun("starting", { id: "run-2" });
			const runs = Object.freeze([previous]);
			expect(admitRun(runs, candidate)).toEqual([previous, candidate]);
			expect(runs).toEqual([previous]);
		}
	});

	test("does not confuse another project with the project's active slot", () => {
		const previous = makeRun("running", { projectKey: "other-project" });
		expect(admitRun([previous], makeRun())).toHaveLength(2);
	});

	test("rejects duplicate run identities and non-starting candidates", () => {
		expectConflict(() => admitRun([makeRun("completed")], makeRun()), "run_exists");
		expectConflict(() => admitRun([], makeRun("running")), "invalid_run_transition");
	});

	test("maps many attempts to one task, preserving session/revision and separating reused IDs", () => {
		const first = makeRun("completed");
		const second = makeRun("failed", {
			id: "run-2",
			taskRevision: "revision-2",
			sessionId: "session-2",
			taskId: "back-0793",
		});
		const oldTask = makeRun("completed", { id: "old", taskCreatedAt: "2020-01-01T00:00:00Z" });
		const otherProject = makeRun("completed", { id: "other", projectKey: "other-project" });
		const otherTask = makeRun("completed", { id: "different", taskId: "BACK-794" });
		expect(findTaskRuns([first, oldTask, second, otherProject, otherTask], first)).toEqual([first, second]);
	});
});
