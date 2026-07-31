---
name: git-commit
description: Creates conventional commits for the TatachioMirabel project. Triggers on "commit", "git commit", "conventional commit".
---

# Git Commit — Conventional Commits

## Commit Format

```
type(scope): concise description

- Key change 1
- Key change 2
```

- First line under 72 characters
- Body uses 2-5 bullet points for significant changes
- Never include "counts" (3 files, 6 subsections) in the title
- ALWAYS ask for user confirmation before committing
- NEVER use `git push --force` or `-f`

## Types

| Type | Use When |
|------|----------|
| `feat` | New feature or functionality |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `chore` | Maintenance, dependencies, configs |
| `refactor` | Code change without feature/fix |
| `test` | Adding or updating tests |
| `perf` | Performance improvement |
| `style` | Formatting, no logic change |

## Scopes

| Scope | When |
|-------|------|
| `backend` | Changes in `apps/backend/src/` |
| `cli` | Changes in CLI tooling |
| `shared` | Changes in shared packages |
| `docs` | Changes in documentation |
| `config` | Configuration, CI, skills, AGENTS.md |

Omit scope when changes span multiple scopes or are root-level.

## Examples

```
# Good
feat(backend): add member census report generation
fix(backend): resolve duplicate document number validation
docs(shared): document API response formats
chore(config): update ESLint to v9

# Bad — too specific
feat(backend): add member census report generation with Excel export and 5 sheet types
fix(backend): fix the bug in member controller on line 45
```

## Workflow

1. Inspect changes with `git status` and `git diff --stat HEAD`
2. Check recent commit style with `git log -3 --oneline`
3. Draft the commit message
4. Present proposed message to user for confirmation
5. After confirmation, stage and commit

## Decision Tree

```
Single file changed?
├─ Yes → Title only (body optional)
└─ No → Include body with key changes

Multiple scopes affected?
├─ Yes → Omit scope: feat: description
└─ No → Include scope: feat(backend): description

Fixing a bug?
├─ User-facing → fix(scope): description
└─ Internal/dev → chore(scope): description

Adding documentation?
├─ Code docs (docstrings) → Part of feat/fix commit
└─ Standalone docs → docs: or docs(scope):
```
