## Lazy Fetch (CLI Companion)

This project uses [lazy-fetch](https://github.com/Clemens865/Lazy-Fetch) for context, persistence, and process tracking.

### IMPORTANT: Automatic Behaviors

These actions are **required** — do them without being asked:

1. **Session start** → Call `lazy_read` to load git state, plan, and memory
2. **Before implementing any non-trivial task** → Call `lazy_contract` to define testable success criteria
3. **After every significant code change** → Call `lazy_check` to validate (includes typecheck, tests, security)
4. **After implementing against a contract** → Call `lazy_eval`, follow the QA instructions, then call `lazy_eval_record` with results
5. **When you make an architectural decision** → Call `lazy_remember` so it survives across sessions
6. **When you complete a task** → Call `lazy_done` to mark it and see what's next
7. **When memory is empty on first session** → Call `lazy scan` to bootstrap from the existing codebase (also discovers installed skills)

### Pattern Recognition — Auto-Select the Right Tool

When the user says something, **match their intent and act**:

| User says | You do (automatically) |
|-----------|----------------------|
| Reports a bug, error, crash | `lazy_blueprint_run` with `fix-bug` |
| Wants new functionality | `lazy_blueprint_run` with `add-feature` |
| Wants to try/explore something | `lazy_blueprint_run` with `experiment` |
| Wants a code review | `lazy_blueprint_run` with `review-code` |
| Describes a goal or project | `lazy_plan` to create phased tasks |
| Asks "where are we?" or "what's next?" | `lazy_status` then `lazy_next` |
| Asks about something stored | `lazy_recall` with the topic |
| Describes what they want to build (1-2 sentences) | `lazy_yolo_plan` with the idea → generates PRD → starts yolo |
| Provides a PRD file | `lazy_yolo_start` with the file path |
| Says "check" or "does it work?" | `lazy_check` then `lazy_eval` if contract exists |
| Asks about security | `lazy_secure` for full audit |
| Says "screenshot" or wants to see the UI | `lazy_doc_screenshot` with the URL |

### The Standard Implementation Loop

For every task, follow this loop:

```
1. lazy_gather <task>           ← understand what files matter
2. lazy_contract <task>         ← define what "done" means (testable criteria)
3. implement the work           ← write code
4. lazy_check                   ← typecheck + tests + security gate
5. lazy_eval → test → lazy_eval_record  ← skeptical QA against contract
6. if eval fails → fix → goto 4
7. lazy_done <task>             ← mark complete, see what's next
```

Skip step 2 (contract) only for trivial changes (typo fixes, config tweaks, one-line changes).

### Available Commands

| Command | When to use |
|---------|------------|
| `lazy plan <goal>` | Break a goal into phased tasks |
| `lazy plan --file <file>` | Import tasks from a bullet-point markdown file |
| `lazy status` | Check current plan progress |
| `lazy done <task or #>` | Mark a task complete |
| `lazy stuck <task or #>` | Mark a task as blocked |
| `lazy add <task>` | Add a task to the current plan |
| `lazy gather <task>` | Find relevant files before starting a task |
| `lazy check` | Validate: typecheck, tests, lint, security |
| `lazy contract <title>` | Generate testable success criteria |
| `lazy eval` | Evaluate work against contract (skeptical QA) |
| `lazy remember <key> <value>` | Store a decision or fact for future sessions |
| `lazy recall [key]` | Retrieve stored knowledge |
| `lazy journal <entry>` | Log a decision or milestone |
| `lazy scan` | Re-scan project: detect stack, commands, git history, TODOs, installed skills |
| `lazy skills` | Discover installed Claude Code skills for use in workflows |
| `lazy secure` | Full security audit: secrets, injection, auth, deps |
| `lazy doc` | Show documentation overview |
| `lazy doc screenshot <url>` | Capture a Playwright screenshot |
| `lazy yolo <prd-file>` | Autonomous mode: PRD → sprints → done |
| `lazy yolo report` | Run scorecard after yolo completion |
| `lazy yolo resume` | Resume paused/failed yolo session |
| `lazy selftest` | Verify lazy-fetch works correctly |

### Blueprints — Prefer These for Structured Tasks

Blueprints handle the full cycle: gather → checkpoint → implement → validate → remember. **Use them instead of ad-hoc implementation** when the task matches.

| Blueprint | Trigger keywords | Command |
|-----------|-----------------|---------|
| **fix-bug** | bug, broken, error, fix, crash, doesn't work, 500, fails | `lazy bp run fix-bug "<description>"` |
| **add-feature** | add, implement, build, create, new feature, support for | `lazy bp run add-feature "<description>"` |
| **experiment** | try, experiment, what if, explore, prototype, spike | `lazy bp run experiment "<description>"` |
| **review-code** | review, check my code, audit, look over, code quality | `lazy bp run review-code "<description>"` |

### Sprint Contracts & Evaluation

**Contracts define "done"** with testable criteria. **Evaluation tests against those criteria skeptically.**

The key insight (from Anthropic research): separating evaluation from generation produces better results than self-assessment. When you evaluate your own work, be a **skeptical QA tester**:
- Do NOT assume something works because the code looks correct
- Actually make HTTP requests, navigate pages, run commands
- A failing grade with specific feedback is more valuable than a false pass
- Use `lazy_doc_screenshot` to capture visual evidence for UI criteria

### Security

`lazy_check` includes a security gate automatically. For a full audit: `lazy_secure` (23 rules covering OWASP Top 10, secrets, deps).

In yolo mode, security gates run between sprints — blocking advancement on critical/high issues.

### Auto-Documentation

Generated automatically — no action needed:
- `docs/plan.md` — updates on every task change
- `docs/validation.md` — appends on every `lazy_check`
- `docs/sprints/` — sprint archives on completion (yolo mode)
- `docs/screenshots/` — Playwright captures

### MCP Tools

**The Loop:** `lazy_read`, `lazy_plan`, `lazy_plan_from_file`, `lazy_add`, `lazy_status`, `lazy_update`, `lazy_done`, `lazy_stuck`, `lazy_next`, `lazy_remove`, `lazy_reset_plan`, `lazy_check`

**Context:** `lazy_context`, `lazy_gather`, `lazy_watch`, `lazy_claudemd`

**Persist:** `lazy_remember`, `lazy_recall`, `lazy_journal`, `lazy_snapshot`

**Evaluate:** `lazy_contract`, `lazy_eval`, `lazy_eval_record`

**Documentation:** `lazy_doc`, `lazy_doc_screenshot`

**Security:** `lazy_secure`

**Blueprints:** `lazy_blueprint_list`, `lazy_blueprint_show`, `lazy_blueprint_run`

**Yolo:** `lazy_yolo_plan`, `lazy_yolo_start`, `lazy_yolo_status`, `lazy_yolo_advance`, `lazy_yolo_resume`, `lazy_yolo_report`

### Key Principles
- **Act, don't just suggest** — call the tool directly when you know it's the right one
- Run `lazy_read` at session start — always
- Use contracts before implementing — define "done" before you build
- Use `lazy_check` after every significant change — don't skip it
- Use `lazy_remember` for decisions that should survive across sessions
- Evaluate skeptically — test, don't assume
- **Check `.lazy/context/skills.json` for available skills** — use specialized skills (e.g., `/frontend-design` for UI, `/investigate` for debugging, `/api-database-scout` for API research) instead of doing everything generically
- Tell the user what you did and what's next — transparency builds trust
