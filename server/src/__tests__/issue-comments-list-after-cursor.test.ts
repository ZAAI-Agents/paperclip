import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, createDb, issueComments, issues } from "@paperclipai/db";
import { HttpError } from "../errors.js";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping issue comment cursor tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issueService.listComments (after cursor)", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof issueService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-issue-comments-after-");
    db = createDb(tempDb.connectionString);
    svc = issueService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issueComments);
    await db.delete(issues);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("returns comments strictly after the anchor when order=asc", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const c1 = randomUUID();
    const c2 = randomUUID();
    const c3 = randomUUID();
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const t1 = new Date("2026-01-01T00:00:01.000Z");
    const t2 = new Date("2026-01-01T00:00:02.000Z");

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Comment cursor test",
      status: "todo",
      priority: "medium",
    });

    await db.insert(issueComments).values([
      {
        id: c1,
        companyId,
        issueId,
        authorUserId: "board",
        body: "first",
        createdAt: t0,
        updatedAt: t0,
      },
      {
        id: c2,
        companyId,
        issueId,
        authorUserId: "board",
        body: "second",
        createdAt: t1,
        updatedAt: t1,
      },
      {
        id: c3,
        companyId,
        issueId,
        authorUserId: "board",
        body: "third",
        createdAt: t2,
        updatedAt: t2,
      },
    ]);

    const page = await svc.listComments(issueId, { afterCommentId: c1, order: "asc" });
    expect(page.map((c) => c.id)).toEqual([c2, c3]);
  });

  it("returns an empty list when after is a valid UUID not present on the issue", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const otherIssueId = randomUUID();
    const anchorOnOtherIssue = randomUUID();
    const t0 = new Date("2026-02-01T00:00:00.000Z");

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(issues).values([
      {
        id: issueId,
        companyId,
        title: "Primary",
        status: "todo",
        priority: "medium",
      },
      {
        id: otherIssueId,
        companyId,
        title: "Other",
        status: "todo",
        priority: "medium",
      },
    ]);

    await db.insert(issueComments).values({
      id: anchorOnOtherIssue,
      companyId,
      issueId: otherIssueId,
      authorUserId: "board",
      body: "on other issue",
      createdAt: t0,
      updatedAt: t0,
    });

    const page = await svc.listComments(issueId, { afterCommentId: anchorOnOtherIssue, order: "asc" });
    expect(page).toEqual([]);
  });

  it("rejects non-UUID cursors with a client error (no 500 from Postgres)", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Invalid cursor test",
      status: "todo",
      priority: "medium",
    });

    const err = await svc
      .listComments(issueId, { afterCommentId: "not-a-uuid", order: "asc" })
      .then(
        () => {
          throw new Error("expected listComments to reject");
        },
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  });
});
