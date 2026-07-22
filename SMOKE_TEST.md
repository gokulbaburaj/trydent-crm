# Smoke test — Sprint 1 & 2 features

Run through this on the live site after the deploy goes green. Each block is a
feature; if anything errors, the note says the likely cause.

## My Work + priorities
- [ ] Signing in lands you on **My Work** (not Dashboard).
- [ ] Tasks assigned to you show, grouped Overdue / Today / This Week / Later.
- [ ] Each row shows a colored priority flag, a clickable status, and due date.
- [ ] Clicking a row opens the task drawer; changing priority there re-sorts the list.
- [ ] Board cards and list rows show the priority flag too.
> Errors on load → `2026-07-21_task_priorities.sql` didn't run in Supabase.

## Filters + saved views (Clients, Pipeline, project tasks, Schedule list)
- [ ] Filter bar shows above each list; typing in the text box narrows results.
- [ ] Facet chips (status, assignee, label, priority, due range) filter correctly.
- [ ] Active filters appear as removable chips; "Clear all" resets them.
- [ ] Click a sortable column header — sorts asc, then desc, then off.
- [ ] Save a view, reload the page — filters and the saved view persist.
- [ ] Rename and delete a saved view from the Views dropdown.

## Bulk actions (Clients table + project task List)
- [ ] Hover a row — a checkbox appears; click to select.
- [ ] Shift-click a row further down selects the whole range.
- [ ] Floating bar shows "N selected" at the bottom with actions.
- [ ] Set status / assignee / (priority, due, label on tasks) updates all selected + toasts.
- [ ] Delete asks to confirm, then removes all selected.
- [ ] Press **Esc** — selection clears and the bar disappears.

## Recurring tasks + schedule items
- [ ] Task drawer has a **Repeat** picker; set one task to Weekly.
- [ ] Mark that task Done — a new copy appears due one week later with a ↻ mark.
- [ ] Toggle Done off and on again — it does **not** create a second copy.
- [ ] Task drawer `…` menu on a recurring task shows **Skip this occurrence**.
- [ ] Schedule form has a Repeat picker; ↻ shows on rows, week events, month chips.
- [ ] A past-dated recurring schedule item spawns its next occurrence on page load.
> Errors here → `2026-07-22_recurrence.sql` didn't run in Supabase.

## General
- [ ] No console errors on any of the above pages.
- [ ] Numbers/money still format correctly (currency toggle unaffected).
