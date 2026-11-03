---
description: 'Pre-validate new machine-generated cards (AI audit, AuditAgent, invariant violations) in parallel: PoC or refutation per card; conclusive cases move automatically, the rest wait for the auditor'
---

# Skill: Pre-validate

Machine-generated findings favour recall over precision. This skill puts every new `unverified` card through an independent validation by background agents, so the auditor triages conclusions ("6 reproduced, 5 refuted, 3 need you"), not raw claims. `/ai-audit` and `/ingest-aa-report` call it at the end; the auditor can also run it directly (`/prevalidate`, or `/prevalidate H-012 H-015`).

Use `npx --no-install hex …` for every Hex command.

## What may move on its own

The CLI enforces this; agents cannot override it:

- **Reproduced → Verified** only when the PoC **passes** and **asserts the impact**, and the finding **passes the reality gate** (it is true *and* a security issue, not by design, not self-inflicted, not out of scope).
- **Refuted → Rejected** only when **two independent refuter agents** both cite the code that blocks the attack.
- Everything else stays in **Potential** with its verdict (`uncertain`) and memo. The auditor decides.

Every auto-move is marked on the card and can be reverted from the board (or `npx --no-install hex issue revert-auto <id>`).

## Step 1 — Pick the cards

Arguments, if given; otherwise every tracking entry with `status: "unverified"` and no `validation` yet (`npx --no-install hex issue show <id>` shows it). Skip cards in Duplicate or Rejected. If there are none, say so and stop.

## Step 2 — Validate in parallel

Spawn one **validator** agent per card as background Agent calls, **at most 6 at a time** (start the next batch as earlier ones finish). Give each validator this brief, with the card id substituted:

> Validate card **{id}** in this Hex project. Read it with `npx --no-install hex issue show {id}`, the code it points to, and exact facts via `npx --no-install hex facts query …`. Also read the triage rules (`npx --no-install hex rules list`): a finding whose whole impact depends on a rule is not security-relevant.
>
> 1. **Correctness.** Trace the claimed path in the code. Find every guard, modifier, check and invariant that could stop it.
> 2. **Reality gate.** Is it security-relevant? Not by design, not a missing feature, not only self-inflicted by a trusted role, not defense-in-depth noise.
> 3. **PoC.** If it is correct and security-relevant, write a minimal PoC following the project's own test setup in `test/hex-pocs/{id}_<short>.t.sol` (Foundry; `.test.ts` for Hardhat). Assert the **impact** (funds lost, invariant broken, access gained), not just that a call succeeds, and log the economic impact. Run it (`forge test --match-path <file> -vv`) and iterate until it passes or you are convinced it cannot.
> 4. Write the memo to `.hex/validations/{id}_memo.md` (sections: Claim, Analysis, Protections evaluated, Reality gate, PoC, Verdict).
> 5. Record the result. Use exactly one of:
>    - `npx --no-install hex issue validation {id} --verdict reproduced --by agent --poc <file> --poc-status passing --reality-gate --memo .hex/validations/{id}_memo.md --auto-move`
>    - `npx --no-install hex issue validation {id} --verdict refuted --by agent --memo .hex/validations/{id}_memo.md` (a single refutation never moves the card)
>    - `npx --no-install hex issue validation {id} --verdict uncertain --by agent --memo .hex/validations/{id}_memo.md`
>
> Do not move the card yourself and do not edit .hex JSON by hand.

## Step 3 — Second refuter

For every card a validator **refuted**, spawn a second, **independent** refuter that does not see the first memo: the same brief, plus "Look for the strongest reason this finding is NOT real; cite the exact code." If it also refutes, record both:

```bash
npx --no-install hex issue validation <id> --verdict refuted --by agent --refuters 2 --memo .hex/validations/<id>_memo.md --auto-move
```

(Append the second refuter's reasoning to the memo first.) If the two disagree, record `--verdict uncertain` with both arguments in the memo.

## Step 4 — Summary

```
Pre-validation — N cards
- R reproduced → Verified (auto): H-…, H-…
- X refuted → Rejected (auto, 2 refuters): H-…
- U uncertain → still in Potential: H-…
Review the auto-moves on the Board; revert any with one click.
```

Then, for each uncertain card, one line on what it needs from the auditor.
