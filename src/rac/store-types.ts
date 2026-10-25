import type { RpcId } from "./codex-rpc.ts";
import type { JsonValue, StoredErrorCode } from "./store-payload.ts";
import type { AgentRun, RunInteraction } from "./types.ts";

export interface StoredSession {
	readonly id: string;
	readonly projectKey: string;
	readonly provider: "codex";
	readonly threadId: string | null;
	readonly currentTurnId: string | null;
	readonly protocolVersion: string;
	readonly createdAt: number;
}
export interface StoredRun extends AgentRun {
	readonly startedAt: number;
	readonly finishedAt: number | null;
	readonly errorCode: StoredErrorCode | null;
	readonly turnId: string | null;
}
export interface StoredInteraction extends RunInteraction {
	readonly rpcRequestId: RpcId;
	readonly threadId: string;
	readonly turnId: string;
	readonly itemId: string | null;
	readonly openedAt: number;
	readonly expiresAt: number;
	readonly resolvedAt: number | null;
}
export interface StoredEvent {
	readonly runId: string;
	readonly sequence: number;
	readonly timestamp: number;
	readonly kind: string;
	readonly payloadVersion: 1;
	readonly payload: JsonValue;
}
export interface StoreLimits {
	readonly projectBytes: number;
	readonly runLogBytes: number;
	readonly controlBytes: number;
	readonly retentionMs: number;
}
export const DEFAULT_STORE_LIMITS: StoreLimits = {
	projectBytes: 100 * 1024 * 1024,
	runLogBytes: 4 * 1024 * 1024,
	controlBytes: 256 * 1024,
	retentionMs: 30 * 24 * 60 * 60 * 1000,
};
