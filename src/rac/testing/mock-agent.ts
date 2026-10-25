import type { AgentEvent, AgentEventPayload } from "../types.ts";

export class MockAgent {
	private readonly listeners = new Set<(event: AgentEvent) => void>();

	constructor(
		readonly runId: string,
		readonly ownerGeneration: string,
	) {}

	subscribe(listener: (event: AgentEvent) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	emit(payload: AgentEventPayload): void {
		const event: AgentEvent = { ...payload, runId: this.runId, ownerGeneration: this.ownerGeneration };
		for (const listener of this.listeners) listener(event);
	}
}
