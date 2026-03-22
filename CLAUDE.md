@AGENTS.md

# gstack

Use the /browse skill from gstack for all web browsing, never use mcp__claude-in-chrome__* tools.

Available skills:
- /office-hours — YC Office Hours: startup diagnostic + builder brainstorm
- /plan-ceo-review — CEO-level plan review (strategy)
- /plan-eng-review — Engineering plan review (architecture)
- /plan-design-review — Design plan review
- /design-consultation — Create a design system
- /design-review — Design audit + fix loop
- /review — Code review before merge
- /ship — Deploy / create PR
- /qa — QA testing
- /qa-only — Report-only QA (no fixes)
- /investigate — Systematic root-cause debugging
- /retro — Weekly retrospective
- /document-release — Post-ship doc updates
- /codex — Second opinion / adversarial code review
- /careful — Production/live systems safety mode
- /freeze — Scope edits to one module/directory
- /guard — Maximum safety mode (destructive warnings + edit restrictions)
- /unfreeze — Remove edit restrictions
- /gstack-upgrade — Upgrade gstack to latest version

If gstack skills aren't working, run: `cd .claude/skills/gstack && ./setup`
