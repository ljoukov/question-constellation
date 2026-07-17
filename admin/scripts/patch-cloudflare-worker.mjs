import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = path.join(adminRoot, '.svelte-kit', 'cloudflare', '_worker.js');
const marker = '// Question Constellation analytics summary workflow';
const source = await readFile(workerPath, 'utf8');

if (!source.includes('var worker_default')) {
	throw new Error(`Could not find the adapter Worker default in ${workerPath}`);
}

if (!source.includes(marker)) {
	await writeFile(workerPath, `${source}\n${workflowExport()}`, 'utf8');
}

function workflowExport() {
	return `${marker}
import { WorkflowEntrypoint } from "cloudflare:workers";

export class AnalyticsSummaryWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    return await step.do(
      "generate analytics overview",
      { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "10 minutes" },
      async () => {
        await initialized;
        const summaryId = event.payload.summaryId;
        const workflowSecret = String(this.env.AUTH_COOKIE_SECRET || "");
        if (workflowSecret.length < 32) {
          throw new Error("Analytics workflow signing secret is unavailable.");
        }
        const workflowKey = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(workflowSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const signatureBytes = await crypto.subtle.sign(
          "HMAC",
          workflowKey,
          new TextEncoder().encode(\`analytics-summary:\${summaryId}\`)
        );
        const workflowSignature = Array.from(
          new Uint8Array(signatureBytes),
          (byte) => byte.toString(16).padStart(2, "0")
        ).join("");
        const deferred = [];
        const workflowContext = {
          waitUntil(promise) { deferred.push(promise); },
          passThroughOnException() {}
        };
        const request = new Request(
          \`https://question-constellation-analytics.internal/api/summaries/\${summaryId}/execute\`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-analytics-workflow-signature": workflowSignature
            },
            body: JSON.stringify(event.payload)
          }
        );
        const response = await server.respond(request, {
          platform: {
            env: this.env,
            ctx: workflowContext,
            context: workflowContext,
            caches
          },
          getClientAddress() { return "127.0.0.1"; }
        });
        await Promise.all(deferred);
        if (!response.ok) {
          throw new Error(
            \`Analytics summary endpoint failed: \${response.status} \${(await response.text()).slice(0, 1000)}\`
          );
        }
        return await response.json();
      }
    );
  }
}

worker_default.scheduled = async function scheduled(controller, env, ctx) {
  const run = async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString();
    const summaryCutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const auditCutoff = new Date(now.getTime() - 365 * 86_400_000).toISOString();
    const auditId = crypto.randomUUID();
    await env.ANALYTICS_DB.batch([
      env.ANALYTICS_DB.prepare(
        "DELETE FROM analytics_ai_summaries WHERE created_at < ?"
      ).bind(summaryCutoff),
      env.ANALYTICS_DB.prepare(
        "DELETE FROM analytics_model_runs WHERE started_at < ?"
      ).bind(cutoff),
      env.ANALYTICS_DB.prepare(
        "DELETE FROM analytics_events WHERE received_at < ?"
      ).bind(cutoff),
      env.ANALYTICS_DB.prepare(
        "DELETE FROM analytics_requests WHERE received_at < ?"
      ).bind(cutoff),
      env.ANALYTICS_DB.prepare(
        "DELETE FROM analytics_sessions WHERE last_seen_at < ?"
      ).bind(cutoff),
      env.ANALYTICS_DB.prepare(
        "DELETE FROM analytics_admin_audit WHERE created_at < ?"
      ).bind(auditCutoff),
      env.ANALYTICS_DB.prepare(
        "DELETE FROM analytics_actor_labels WHERE (actor_key LIKE 'user:%' AND NOT EXISTS (SELECT 1 FROM analytics_sessions s WHERE 'user:' || s.user_id = actor_key)) OR (actor_key LIKE 'anon:%' AND NOT EXISTS (SELECT 1 FROM analytics_sessions s WHERE 'anon:' || s.anonymous_id = actor_key))"
      ),
      env.ANALYTICS_DB.prepare(
        "INSERT INTO analytics_admin_audit (audit_id, action, scope, requested_by, created_at, metadata_json) VALUES (?, 'retention-prune', 'database', 'cloudflare-cron', ?, ?)"
      ).bind(
        auditId,
        now.toISOString(),
        JSON.stringify({
          retentionDays: 90,
          summaryRetentionDays: 30,
          auditRetentionDays: 365,
          cutoff,
          summaryCutoff,
          auditCutoff
        })
      )
    ]);
  };
  ctx.waitUntil(run());
};
`;
}
