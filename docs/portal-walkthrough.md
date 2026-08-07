# Client portal — end-to-end walkthrough

Purpose: find out which portal features actually work before a paying client
sees them. Five tables sit at zero rows because nobody has ever used the portal,
so none of these paths has been exercised against real data.

**Test client:** Mixlabs Creative (`mixlabscreative`) — 3 projects, 1 update,
2 messages. The only portal with enough content to be worth testing.

## Who can run this

Either side. It does **not** require a human at a keyboard — with the Claude in
Chrome extension connected, the agent can reset the password on the admin side,
sign in as the client in a second tab and walk every path below. The only thing
that blocks it is no browser being connected, which is a setup gap rather than
a capability limit. Don't record this as "can't be done from this side".

## Setup

1. Clients → Mixlabs Creative → portal panel → reset the portal password.
   It's shown once and never stored, so copy it before closing.
2. Open a second tab or a private window, so the admin session stays live in
   the first one.
3. Sign in at traid3nt.xyz with the username, not an email.

## Paths to walk

Tick what works, note what doesn't. The point is the second column.

| # | Path | Where | Expected |
|---|------|-------|----------|
| 1 | Land on the portal | after login | Goes straight to `/portal`, no dashboard flash |
| 2 | Open a project | portal → project card | Detail opens, tasks visible |
| 3 | Task views | portal → Task progress | Board / calendar / timeline toggle all render |
| 4 | Comment on a task | portal → task | Comment saves, appears for admin in the task drawer |
| 5 | Approve a deliverable | portal → approvals | Approve button works, state reflects for admin |
| 6 | Send a message | portal → Messages | Arrives; reply from admin arrives back |
| 7 | Book a call | portal → meetings | Request saves and surfaces to staff in Schedule |
| 8 | Documents | admin uploads → portal | Client sees it, can open it |
| 9 | Invoice, draft | admin creates draft + PDF | Client sees **nothing** — drafts are hidden |
| 10 | Invoice, sent | admin marks Sent | Client now sees it, PDF opens |
| 11 | Invoice on `/invoices` | admin | Appears with right status, aging, currency |

## Things I'd expect to break

Not predictions from testing — places where the code has never run against
real data, so they're where to look first when something misbehaves:

- **Storage policies.** Invoice PDFs and client documents are gated by status
  and folder. Item 9 is the real test: a draft's PDF must not be reachable.
- **Meeting requests.** `meeting_requests` has never held a row. The write path
  from the portal and the read path in Schedule have only ever been tested
  against an empty table.
- **Task comments.** Same — `task_comments` is empty, so the thread rendering
  has never had anything to render.
- **Realtime/refresh.** Whether the admin side picks up a portal action without
  a manual reload.

## Reporting back

For anything broken, the useful detail is: which numbered path, what you
expected, what happened, and anything in the browser console. A screenshot of
the console beats a description of the symptom.
