import type { LocalRacAccess } from "../rac/local-access.ts";
import type { AgentManager } from "../rac/manager.ts";
import { LocalRequestError, localError, readLocalJson } from "./local-policy.ts";

const pairingPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pair RAC · Backlog.md</title><body><main><h1>Pair RAC</h1><form><label>One-time code <input name="code" autocomplete="off" maxlength="10" required></label><button>Pair</button></form><p role="status"></p><a href="/board">Backlog.md</a></main><script>
document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const status=document.querySelector('[role=status]');try{const response=await fetch('/api/rac/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:new FormData(event.target).get('code')})});const data=await response.json();status.textContent=response.ok?'RAC paired.':data.error;if(response.ok)event.target.remove();}catch{status.textContent='RAC owner is unavailable.';}});
</script></body></html>`;

export class RacHttp {
	private readonly requests: number[] = [];
	constructor(
		readonly manager: AgentManager,
		readonly access: LocalRacAccess,
	) {}
	async handle(request: Request): Promise<Response | null> {
		const url = new URL(request.url);
		if (url.pathname === "/rac/pair" && request.method === "GET")
			return new Response(pairingPage, {
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "no-store",
					"Referrer-Policy": "no-referrer",
					"X-Frame-Options": "DENY",
					"Content-Security-Policy":
						"default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
				},
			});
		if (!url.pathname.startsWith("/api/rac/")) return null;
		try {
			await this.manager.authorize();
			const now = Date.now();
			while (this.requests[0] !== undefined && this.requests[0] < now - 60000) this.requests.shift();
			if (this.requests.length >= 120) throw new LocalRequestError("rate_limited", "RAC request limit reached", 429);
			this.requests.push(now);
			const envelope = (value: object) => ({
				schemaVersion: 1,
				projectKey: this.manager.store.owner.projectKey,
				ownerGeneration: this.manager.store.owner.generation,
				...value,
			});
			const respond = (value: object, status = 200, headers: Record<string, string> = {}) =>
				Response.json(envelope(value), { status, headers: { "Cache-Control": "no-store", ...headers } });
			if (url.pathname === "/api/rac/session" && request.method === "POST") {
				const body = await readLocalJson(request, 256);
				if (Object.keys(body).length !== 1)
					throw new LocalRequestError("invalid_input", "Provide only the pairing code", 400);
				const paired = this.access.pair(body.code);
				return respond({ csrf: paired.csrf }, 200, { "Set-Cookie": paired.cookie });
			}
			this.access.authorize(request, request.method !== "GET" && request.method !== "HEAD");
			if (url.pathname === "/api/rac/session" && request.method === "GET")
				return respond({ csrf: this.access.csrf(request) });
			if (url.pathname === "/api/rac/pair" && request.method === "POST") {
				const body = await readLocalJson(request, 256);
				if (Object.keys(body).length) throw new LocalRequestError("invalid_input", "Pairing takes no options", 400);
				return respond({ ...this.access.issuePairing(request), pairUrl: `${url.origin}/rac/pair` });
			}
			if (url.pathname === "/api/rac/runs" && request.method === "POST") {
				const result = await this.manager.start(await readLocalJson(request), request.headers.get("idempotency-key"));
				return respond({ result: result.result, replayed: result.replayed }, 202);
			}
			const run = url.pathname.match(/^\/api\/rac\/runs\/([A-Za-z0-9._:-]+)$/);
			if (run?.[1] && request.method === "GET") return respond(await this.manager.status(run[1]));
			const task = url.pathname.match(/^\/api\/rac\/tasks\/([A-Za-z0-9.-]+)\/runs$/);
			if (task?.[1] && request.method === "GET") return respond(await this.manager.taskHistory(task[1]));
			throw new LocalRequestError("not_found", "RAC operation is unavailable", 404);
		} catch (error) {
			return localError(error);
		}
	}
	async close(): Promise<void> {
		await this.access.close();
		await this.manager.close();
	}
}
