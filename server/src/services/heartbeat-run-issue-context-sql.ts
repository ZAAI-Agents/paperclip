import { agentWakeupRequests, heartbeatRuns, issues } from "@paperclipai/db";
import { or, sql, type SQL } from "drizzle-orm";

/** Match a concrete issue id against heartbeat `context_snapshot` (issueId and/or legacy taskId). */
export function sqlHeartbeatRunContextMatchesIssueId(issueId: string) {
  return or(
    sql`${heartbeatRuns.contextSnapshot} ->> 'issueId' = ${issueId}`,
    sql`${heartbeatRuns.contextSnapshot} ->> 'taskId' = ${issueId}`,
  );
}

/** Same as {@link sqlHeartbeatRunContextMatchesIssueId} for the joined `issues` row. */
export function sqlHeartbeatRunContextMatchesIssueIdColumn() {
  return or(
    sql`${heartbeatRuns.contextSnapshot} ->> 'issueId' = cast(${issues.id} as text)`,
    sql`${heartbeatRuns.contextSnapshot} ->> 'taskId' = cast(${issues.id} as text)`,
  );
}

/** Effective issue id from run context for joins and `inArray` filters. */
export function sqlHeartbeatRunSnapshotIssueIdCoalesce(): SQL<string | null> {
  return sql<string | null>`coalesce(
    ${heartbeatRuns.contextSnapshot} ->> 'issueId',
    ${heartbeatRuns.contextSnapshot} ->> 'taskId'
  )`;
}

/** Queued / deferred wakes may scope the issue on the payload or under nested wake context. */
export function sqlAgentWakeupPayloadMatchesIssueId(issueId: string) {
  return or(
    sql`${agentWakeupRequests.payload} ->> 'issueId' = ${issueId}`,
    sql`${agentWakeupRequests.payload} ->> 'taskId' = ${issueId}`,
    sql`${agentWakeupRequests.payload} #>> ARRAY['_paperclipWakeContext', 'issueId'] = ${issueId}`,
    sql`${agentWakeupRequests.payload} #>> ARRAY['_paperclipWakeContext', 'taskId'] = ${issueId}`,
  );
}

/** Effective issue id from wake payload for joins (top-level + nested). */
export function sqlAgentWakeupPayloadIssueIdCoalesce(): SQL<string | null> {
  return sql<string | null>`coalesce(
    ${agentWakeupRequests.payload} ->> 'issueId',
    ${agentWakeupRequests.payload} ->> 'taskId',
    ${agentWakeupRequests.payload} #>> ARRAY['_paperclipWakeContext', 'issueId'],
    ${agentWakeupRequests.payload} #>> ARRAY['_paperclipWakeContext', 'taskId']
  )`;
}
