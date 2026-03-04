# Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/) for this project.

## Format

```
<type>: <short description>

[optional body]
```

## Types

| Type | Use for |
|------|---------|
| `feat` | New features |
| `fix` | Bug fixes |
| `ui` | UI/layout overhauls |
| `perf` | Performance optimizations |
| `docs` | Documentation only |
| `refactor` | Code restructure (no behavior change) |
| `chore` | Maintenance, dependencies, config |

## Examples

```
feat: refactor scan page architecture
fix: resolve snapshot update issue
ui: overhaul review page layout
perf: optimize hashing pipeline
```

## Setup

To use the template when committing:

```bash
git config commit.template .gitmessage
```
