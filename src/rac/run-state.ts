import { canonicalTaskId } from "../utils/task-id.ts";
import { type AgentRun, RUN_STATUSES, type RunInteraction, type RunStatus, type RunTaskIdentity } from "./types.ts";

const transitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
	starting: ["running", "interrupting", "interrupted", "failed", "unknown"],
	running: ["interrupting", "interrupted", "completed", "failed", "unknown"],
	interrupting: ["interrupted", "completed", "failed", "unknown"],
	interrupted: [],
	completed: [],
	failed: [],
	unknown: [],
	abandoned: [],
};

type ConflictCode =
	| "invalid_run_status"
	| "invalid_run_transition"
	| "interaction_pending"
	| "recovery_unconfirmed"
	| "run_active"
	| "run_exists";

export class RunStateError extends Error {
	readonly status = 409;

	constructor(
		readonly code: ConflictCode,
		message: string,
	) {
		super(message);
		this.name = "RunStateError";
	}
}

export function isRunStatus(value: unknown): value is RunStatus {
	return typeof value === "string" && (RUN_STATUSES as readonly string[]).includes(value);
}

export function isTerminalRunStatus(status: RunStatus): boolean {
	return status === "interrupted" || status === "completed" || status === "failed" || status === "abandoned";
}

function belongsToRun(run: AgentRun, interaction: RunInteraction): boolean {
	return interaction.runId === run.id && interaction.ownerGeneration === run.ownerGeneration;
}

export function transitionRun(run: AgentRun, next: RunStatus, interactions: readonly RunInteraction[]): AgentRun {
	if (!isRunStatus(run.status) || !isRunStatus(next))
		throw new RunStateError("invalid_run_status", "Unknown RAC run status");
	if (run.status === next) return run;
	if (!transitions[run.status].includes(next)) {
		throw new RunStateError("invalid_run_transition", `Cannot change run from ${run.status} to ${next}`);
	}
	if (
		next === "completed" &&
		interactions.some(
			(item) => belongsToRun(run, item) && item.blocking && (item.status === "open" || item.status === "uncertain"),
		)
	) {
		throw new RunStateError("interaction_pending", "Run still has an unresolved blocking interaction");
	}
	return { ...run, status: next };
}

export function recoverRun(run: AgentRun): AgentRun {
	return isTerminalRunStatus(run.status) ? run : transitionRun(run, "unknown", []);
}

// Caller supplies human authorization and process-stop evidence; see docs/rac/RUN-STATE.md.
export function resolveUnknownRun(run: AgentRun, previousProcessStopped: boolean): AgentRun {
	if (previousProcessStopped !== true)
		throw new RunStateError("recovery_unconfirmed", "Previous process must be confirmed stopped");
	if (run.status === "abandoned") return run;
	if (run.status !== "unknown")
		throw new RunStateError("invalid_run_transition", "Only an unknown run can be abandoned");
	return { ...run, status: "abandoned" };
}

export function getRunWaitingFor(
	run: AgentRun,
	interactions: readonly RunInteraction[],
): { input: boolean; approval: boolean } {
	let input = false;
	let approval = false;
	if (run.status === "running") {
		for (const item of interactions) {
			if (!belongsToRun(run, item) || !item.blocking || item.status !== "open") continue;
			if (item.kind === "question") input = true;
			else approval = true;
		}
	}
	return { input, approval };
}

// The owner must persist slot admission atomically; see docs/rac/RUN-STATE.md.
export function admitRun(runs: readonly AgentRun[], candidate: AgentRun): readonly AgentRun[] {
	if (candidate.status !== "starting")
		throw new RunStateError("invalid_run_transition", "A new run must start in starting");
	if (runs.some((run) => run.projectKey === candidate.projectKey && run.id === candidate.id)) {
		throw new RunStateError("run_exists", "Run identity already exists in this project");
	}
	if (runs.some((run) => run.projectKey === candidate.projectKey && !isTerminalRunStatus(run.status))) {
		throw new RunStateError("run_active", "Project already has an active or unknown run");
	}
	return [...runs, candidate];
}

export function findTaskRuns(runs: readonly AgentRun[], task: RunTaskIdentity): readonly AgentRun[] {
	const id = canonicalTaskId(task.taskId);
	return runs.filter(
		(run) =>
			run.projectKey === task.projectKey &&
			canonicalTaskId(run.taskId) === id &&
			run.taskCreatedAt === task.taskCreatedAt,
	);
}
