import { describe, expect, test } from "bun:test";
import { MockAgent } from "../rac/testing/mock-agent.ts";
import type { AgentEvent, AgentEventPayload } from "../rac/types.ts";

describe("deterministic RAC mock agent", () => {
	test("emits text, blocking and nonblocking questions, approval and success in exact order", () => {
		const agent = new MockAgent("run-1", "owner-1");
		const first: AgentEvent[] = [];
		const second: AgentEvent[] = [];
		agent.subscribe((event) => first.push(event));
		agent.subscribe((event) => second.push(event));
		const payloads: AgentEventPayload[] = [
			{ type: "text", text: "Planning" },
			{
				type: "question",
				interactionId: "q-1",
				text: "Approve this plan?",
				blocking: true,
				options: ["Approve", "Revise"],
			},
			{ type: "question", interactionId: "q-2", text: "Optional feedback", blocking: false },
			{ type: "approval", interactionId: "a-1", kind: "command_approval", summary: "Run scoped tests", blocking: true },
			{ type: "completed" },
		];
		for (const payload of payloads) agent.emit(payload);
		expect(first).toEqual(payloads.map((payload) => ({ ...payload, runId: "run-1", ownerGeneration: "owner-1" })));
		expect(second).toEqual(first);
	});

	test("can emit a failure without pretending it is success", () => {
		const agent = new MockAgent("run-1", "owner-1");
		const events: AgentEvent[] = [];
		agent.subscribe((event) => events.push(event));
		agent.emit({ type: "error", code: "provider_disconnected", message: "Connection lost" });
		expect(events).toEqual([
			{
				type: "error",
				code: "provider_disconnected",
				message: "Connection lost",
				runId: "run-1",
				ownerGeneration: "owner-1",
			},
		]);
	});

	test("unsubscribes one consumer while another continues receiving", () => {
		const agent = new MockAgent("run-1", "owner-1");
		const first: AgentEvent[] = [];
		const second: AgentEvent[] = [];
		const unsubscribe = agent.subscribe((event) => first.push(event));
		agent.subscribe((event) => second.push(event));
		agent.emit({ type: "text", text: "before" });
		unsubscribe();
		unsubscribe();
		agent.emit({ type: "text", text: "after" });
		expect(first).toHaveLength(1);
		expect(second).toHaveLength(2);
	});

	test("keeps run and owner identity even if an untyped payload tries to replace them", () => {
		const agent = new MockAgent("run-1", "owner-1");
		const events: AgentEvent[] = [];
		agent.subscribe((event) => events.push(event));
		const payload = { type: "text", text: "hello", runId: "other-run", ownerGeneration: "old-owner" } as const;
		agent.emit(payload);
		expect(events[0]).toEqual({ type: "text", text: "hello", runId: "run-1", ownerGeneration: "owner-1" });
	});

	test("keeps separate mock instances isolated for UI fixtures", () => {
		const first = new MockAgent("run-1", "owner-1");
		const second = new MockAgent("run-2", "owner-2");
		const events: AgentEvent[] = [];
		first.subscribe((event) => events.push(event));
		second.emit({ type: "completed" });
		expect(events).toHaveLength(0);
		first.emit({ type: "completed" });
		expect(events).toEqual([{ type: "completed", runId: "run-1", ownerGeneration: "owner-1" }]);
	});
});
