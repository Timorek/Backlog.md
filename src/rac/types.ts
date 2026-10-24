export const RUN_STATUSES = [
	"starting",
	"running",
	"interrupting",
	"interrupted",
	"completed",
	"failed",
	"unknown",
	"abandoned",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export interface RunTaskIdentity {
	readonly projectKey: string;
	readonly taskId: string;
	readonly taskCreatedAt: string;
}

export interface AgentRun extends RunTaskIdentity {
	readonly id: string;
	readonly taskRevision: string;
	readonly sessionId: string;
	readonly ownerGeneration: string;
	readonly status: RunStatus;
}

export type InteractionKind =
	| "question"
	| "command_approval"
	| "file_approval"
	| "permission_approval"
	| "mcp_elicitation";
export type InteractionStatus = "open" | "answered" | "cleared" | "expired" | "uncertain" | "stale";

export interface RunInteraction {
	readonly id: string;
	readonly runId: string;
	readonly ownerGeneration: string;
	readonly kind: InteractionKind;
	readonly blocking: boolean;
	readonly status: InteractionStatus;
}

export type AgentEventPayload =
	| { readonly type: "text"; readonly text: string }
	| {
			readonly type: "question";
			readonly interactionId: string;
			readonly text: string;
			readonly blocking: boolean;
			readonly options?: readonly string[];
	  }
	| {
			readonly type: "approval";
			readonly interactionId: string;
			readonly kind: Exclude<InteractionKind, "question">;
			readonly summary: string;
			readonly blocking: boolean;
	  }
	| { readonly type: "completed" }
	| { readonly type: "error"; readonly code: string; readonly message: string };

export type AgentEvent = AgentEventPayload & {
	readonly runId: string;
	readonly ownerGeneration: string;
};
