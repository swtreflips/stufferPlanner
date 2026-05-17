# fork.md — The fork flow when combinations conflict

> Note on phase: forking ships in **Phase 5.6**. Phase 4 (just landed) only ships the container tray. This doc describes what the Phase 5.6 UX is supposed to look like per the locked model in [CONTCONFIG.md](CONTCONFIG.md) and evaluates how intuitive that flow actually is.

---

## The canonical conflict

Internal user Mike is building OFQs out of Ditar's POs in scenario "Main":

- `POCORE` — 800 cases (the anchor)
- `OptA` — 200 cases
- `OptB` — 200 cases

He builds **Container 1** in Main with `POCORE × 800 + OptA × 200` (a full 40HC). Looks good. Master grid now shows:

| PO     | Available in Main |
|--------|-------------------|
| POCORE | 0                 |
| OptA   | 0                 |
| OptB   | 200               |

Then he thinks: *what if I paired POCORE with OptB instead?* He wants to compare.

This is a **conflict** because POCORE can't simultaneously be in two containers in the same scenario — it's already fully allocated in Container 1.

---

## How the current model resolves it

The model's answer is: **fork the scenario, then rebuild the conflicting container.** Step by step:

**Step 1 — Notice the conflict.**
Mike tries to drag POCORE onto a new draft container. The drag fails because availability is 0.

**Step 2 — Fork the scenario.**
Click *Fork scenario* in the tray header. Dialog asks for a name. Mike types *"Alt-OptB"*. Hit Create. The scenario switcher gains a new entry; Mike is now viewing Alt-OptB.

What's in Alt-OptB right now? A **deep copy** of Main's drafts. So Container 1 (with POCORE×800 + OptA×200) is duplicated as Container 1' in Alt-OptB.

**Step 3 — Empty the conflicting container.**
Click *Empty* on Container 1'. Confirm. All allocations on Container 1' are removed *in Alt-OptB only*. Master availability in Alt-OptB now shows:

| PO     | Available in Alt-OptB |
|--------|-----------------------|
| POCORE | 800                   |
| OptA   | 200                   |
| OptB   | 200                   |

**Step 4 — Re-allocate.**
Mike drags POCORE × 800 into Container 1', then OptB × 200. Done. Now Alt-OptB has the alternative arrangement, Main still has the original.

**Step 5 — Flip and compare.**
The scenario switcher lets Mike toggle between Main (POCORE+OptA) and Alt-OptB (POCORE+OptB). When he picks a winner, he commits the container in that scenario — the other scenario goes stale.

---

## Is it intuitive? An honest read

**Not on first contact.** Once you understand the model the steps are clean, but several moments in the flow rely on the user already knowing how the system thinks.

### Friction points

1. **The dead-end drag.** When POCORE has 0 available, the user drags it onto a new container and... nothing happens. There's no breadcrumb pointing toward *fork to explore this*. A first-time user will likely think the app is broken.

2. **"Fork" is a programmer word.** Domain users don't fork — they say "I want to try a different combination." The button label *Fork scenario* doesn't surface intent. Something like *Try an alternative* or *Compare with...* would land better.

3. **The empty-then-rebuild dance is inverted from intent.**
   - What Mike *wants* to do: "Replace OptA with OptB in this container."
   - What he *has to do*: fork (which preserves what he doesn't want), then empty the container, then rebuild from scratch — re-allocating POCORE × 800 even though that part wasn't supposed to change.
   - Re-allocating the anchor is busywork that has nothing to do with the actual decision being explored.

4. **"Empty" feels destructive in context.** Right after forking, the user is told to click a destructive-looking button on the copy. The reassurance that the original is untouched lives only in the user's head — there's no visual contract reinforcing it.

5. **No comparison view.** Mike has to flip back and forth in the switcher to compare. CBM, cargo-ready, line count — none of these are visible side by side. For a workflow whose entire purpose is comparing alternatives, comparison support is the missing thing.

6. **The mental load of "what scenario am I in?" grows fast.** After three forks, the switcher has Main + three alts with lineage labels. The grid availability silently changes when you switch scenarios. If the user doesn't notice the switcher, they'll wonder why the same PO has different availabilities on different screen loads.

### What does work

- The model itself is sound. Each verb (`allocate`, `empty`, `commit`, `fork`, `delete`) does one thing, and the user can always predict what their click did.
- Total siloing holds without the user thinking about it.
- Stale-after-commit is a natural consequence, not a special case.

The model is *learnable*. It's just not *discoverable*.

---

## What would make it intuitive

These are Phase 5.6+ UX additions worth committing to before the flow ships to real users:

1. **Surface fork at the conflict point.** When a drag fails because availability is 0, show a tooltip on the dragged row:
   > *"POCORE is fully allocated in Main. Fork to try an alternative arrangement."*
   The tooltip text is a button that opens the Fork dialog directly. The user doesn't have to know that *fork* is the right verb — the conflict itself teaches them.

2. **Add a "Try alternative" shortcut on the container card.** A small button on every draft card: *Try alternative arrangement*. Click it → forks the scenario, empties only *this* container in the new fork, switches to the new scenario, all in one go. Bundles the three-step dance into one verb that matches user intent.

3. **Rename "Fork scenario" → "Save & branch"** (or *Try alternative*, or *Compare with...*). The current name describes the data operation, not the user's goal.

4. **Show the scenario name everywhere availability is computed.** The grid header could say *"Showing availability in: Main"*. Reduces "wait, why is this different?" confusion when scenarios are switched.

5. **Side-by-side compare view (deferred, but worth keeping on the radar).** Two trays, one per scenario, with diff highlights on containers whose contents differ.

6. **Onboarding hint on the first fork.** A one-time tooltip: *"You're now in a copy of your previous plan. Both arrangements exist independently — pick the winner by committing it."* Cheap to add, big win on first encounter.

---

## TL;DR

The model handles conflict **correctly** and **predictably**. It is **not yet discoverable** — the user has to know what to do when a drag fails. Most of the discoverability gap closes with one addition: surfacing the fork affordance at the moment of conflict, instead of hiding it as a free-standing button in the tray header.

The fork-then-empty dance itself is a minor wart that a "Try alternative on this container" shortcut would eliminate, but that's optimization, not correctness. The base model is sound. Worth committing to the discoverability additions before Phase 5.6 ships to a real internal user.
