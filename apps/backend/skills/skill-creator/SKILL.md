---
name: skill-creator
description: Create new AI agent skills following TatachioMirabel conventions. Triggers on "create skill", "new skill", "add agent instructions", "document AI patterns".
---

# Skill Creator

## When to Create a Skill

- A pattern is used repeatedly and AI agents need guidance
- Project-specific conventions differ from generic best practices
- Complex workflows need step-by-step instructions
- Decision trees help AI choose the right approach

Don't create a skill for:
- Documentation that already exists (create a reference instead)
- Trivial or self-explanatory patterns
- One-off tasks

## Skill Structure

```
skills/{skill-name}/
├── SKILL.md              # Required — main skill file
├── assets/               # Optional — templates, schemas, examples
│   ├── template.ts
│   └── schema.json
└── references/           # Optional — links to local docs
    └── docs.md
```

## SKILL.md Template

```markdown
---
name: {skill-name}
description: >
  {One-line description of what this skill does}.
  Trigger: {When the AI should load this skill}.
---

## When to Use

{Bullet points of when to use this skill}

## Critical Patterns

{The most important rules — what AI MUST know}

## Code Examples

{Minimal, focused examples}

## Resources

- **Templates**: See [assets/](assets/) for {description}
- **Documentation**: See [references/](references/) for local docs
```

## Naming Conventions

| Type | Pattern | Examples |
|------|---------|----------|
| Generic skill | `{technology}` | `typescript`, `prisma-database-setup`, `zod-4` |
| Workflow skill | `{action}-{target}` | `git-commit`, `skill-creator` |

Skills live under `apps/backend/skills/`. Use lowercase with hyphens.

## Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier (lowercase, hyphens) |
| `description` | Yes | What + Trigger keywords in one block |

Include trigger keywords in the description so agents know when to auto-invoke this skill.

## Decision: assets/ vs references/

```
Need code templates?        → assets/
Need JSON schemas?          → assets/
Need example configs?       → assets/
Link to existing docs?      → references/
```

`references/` should point to LOCAL files, not web URLs.

## Content Guidelines

### DO
- Start with the most critical patterns
- Use tables for decision trees
- Keep code examples minimal and focused
- Use TypeScript + ESM throughout

### DON'T
- Add Keywords section (agents search frontmatter, not body)
- Duplicate content from existing docs (reference instead)
- Include lengthy explanations (link to docs)
- Use web URLs in references (use local paths)
- Include command execution instructions

## Registering the Skill

After creating the skill, add it to `apps/backend/AGENTS.md` under the Core Skills table.

## Checklist

- [ ] Skill doesn't already exist (check `apps/backend/skills/`)
- [ ] Pattern is reusable (not one-off)
- [ ] Name follows conventions
- [ ] Frontmatter is complete (description includes trigger keywords)
- [ ] Critical patterns are clear
- [ ] Code examples are minimal and TypeScript/ESM
- [ ] Added to AGENTS.md
