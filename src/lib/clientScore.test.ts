import test from "node:test";
import assert from "node:assert/strict";
import {
  bucketOf,
  clientScore,
  recencyWeight,
  stageWeight,
  warmthLabel,
} from "./clientScore.ts";
import type { Client, ClientStatus } from "./types.ts";

/** Tests run with TZ=UTC (see the `test` script) so dates are deterministic. */
const NOW = new Date("2026-08-09T12:00:00Z").getTime();

function client(over: Partial<Client> = {}): Client {
  return {
    id: "c1",
    company: "Acme",
    point_person: null,
    email: null,
    phone: null,
    address: null,
    status: "Lead",
    lead_source: null,
    tags: [],
    account_owner: null,
    last_contact: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...over,
  };
}

test("an inactive customer is the COLDEST stage, not the last one", () => {
  // The bug this function exists to not have: "Inactive Customer" is last in
  // the pipeline array, so reading the weight off the index ranks a churned
  // account above an active one.
  assert.equal(stageWeight("Inactive Customer"), 0);
  assert.ok(
    stageWeight("Active Customer") > stageWeight("Inactive Customer"),
    "active must outrank inactive"
  );
  assert.ok(stageWeight("Active Customer") > stageWeight("Prospect"));
  assert.ok(stageWeight("Prospect") > stageWeight("Lead"));
});

test("an unrecognised status scores as a Lead rather than throwing", () => {
  // Status comes from the database. A value added by a migration before this
  // file catches up must not blank the whole queue.
  assert.equal(stageWeight("Nonsense" as ClientStatus), 0.34);
});

test("recency decays to nothing over the horizon and never goes negative", () => {
  const days = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

  assert.equal(recencyWeight(days(0), NOW), 1);
  assert.equal(recencyWeight(days(45), NOW), 0.5);
  assert.equal(recencyWeight(days(90), NOW), 0);
  // Past the horizon it stays at zero — three months and three years are the
  // same problem, and a negative weight would drag the stage half down with it.
  assert.equal(recencyWeight(days(400), NOW), 0);
  assert.equal(recencyWeight(days(4000), NOW), 0);
});

test("a future last_contact is clamped, not rewarded", () => {
  // Bad data, or a timezone slip. Without the upper clamp this scores above 1
  // and the client comes out over 100, which falls off the heat ramp.
  const tomorrow = new Date(NOW + 86_400_000).toISOString();
  assert.equal(recencyWeight(tomorrow, NOW), 1);
  assert.ok(clientScore(client({ status: "Active Customer", last_contact: tomorrow }), NOW) <= 100);
});

test("missing and malformed contact dates score zero rather than throwing", () => {
  assert.equal(recencyWeight(null, NOW), 0);
  assert.equal(recencyWeight("", NOW), 0);
  assert.equal(recencyWeight("not a date", NOW), 0);
  assert.doesNotThrow(() => clientScore(client({ last_contact: "2026-13-45" }), NOW));
});

test("clientScore stays inside 0..100 across every combination", () => {
  const statuses: ClientStatus[] = [
    "Lead",
    "Prospect",
    "Active Customer",
    "Inactive Customer",
  ];
  const dates = [null, "2026-08-09", "2026-07-01", "2020-01-01", "2030-01-01", "rubbish"];

  for (const status of statuses) {
    for (const last_contact of dates) {
      const s = clientScore(client({ status, last_contact }), NOW);
      assert.ok(
        s >= 0 && s <= 100,
        `${status} / ${last_contact} produced ${s}, which is off the heat ramp`
      );
    }
  }
});

test("stage dominates recency, as weighted", () => {
  // A lead you spoke to this morning should not outrank an active customer you
  // spoke to last month. This is the 60/40 split doing its job.
  const freshLead = clientScore(
    client({ status: "Lead", last_contact: "2026-08-09" }),
    NOW
  );
  const staleActive = clientScore(
    client({ status: "Active Customer", last_contact: "2026-07-10" }),
    NOW
  );
  assert.ok(staleActive > freshLead, `${staleActive} should beat ${freshLead}`);
});

test("bucketOf floors rather than rounds", () => {
  const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
  // 20 hours old is still today until the day actually turns.
  assert.equal(bucketOf(hoursAgo(20), NOW), "Today");
  assert.equal(bucketOf(hoursAgo(25), NOW), "Yesterday");
});

test("bucketOf covers every gap in the range", () => {
  const days = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
  assert.equal(bucketOf(days(0), NOW), "Today");
  assert.equal(bucketOf(days(1), NOW), "Yesterday");
  assert.equal(bucketOf(days(6), NOW), "This week");
  assert.equal(bucketOf(days(7), NOW), "This month");
  assert.equal(bucketOf(days(29), NOW), "This month");
  assert.equal(bucketOf(days(30), NOW), "Last 3 months");
  assert.equal(bucketOf(days(89), NOW), "Last 3 months");
  assert.equal(bucketOf(days(90), NOW), "Older");
  assert.equal(bucketOf(null, NOW), "No contact yet");
});

test("a future date buckets as Today, not as a negative bucket", () => {
  assert.equal(bucketOf(new Date(NOW + 86_400_000).toISOString(), NOW), "Today");
});

test("warmthLabel agrees with the boundaries it's rendered beside", () => {
  assert.equal(warmthLabel(0), "Cold");
  assert.equal(warmthLabel(39), "Cold");
  assert.equal(warmthLabel(40), "Steady");
  assert.equal(warmthLabel(74), "Steady");
  assert.equal(warmthLabel(75), "Warm");
  assert.equal(warmthLabel(100), "Warm");
});
