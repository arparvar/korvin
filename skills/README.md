# Operator Skills

Add local skills without editing Korvin source code.

## Structure

Each skill is a directory under `skills/` containing:
- `skill.json` - manifest
- `handler.js` - implementation

## skill.json fields

| Field | Required | Description |
|---|---|---|
| name | yes | Unique skill name (kebab-case) |
| description | yes | What the skill does |
| trigger | yes | JavaScript regex string to match user messages |
| permission | yes | One of: read-only, network-read, local-status |
| handler | yes | Relative path to handler.js (must stay in this directory) |

## Allowed permissions

- `read-only` - may read local state only
- `network-read` - may make outbound HTTP GET requests
- `local-status` - may run fixed local status commands

## handler.js

Must export an async `run(message, match)` function.
Return a string - this is sent back to the user.

## Security

- Skills that request higher permissions are silently skipped.
- Handler paths with `../` are rejected.
- Errors inside handlers are caught and reported as a safe error message.
- Operator skills are checked BEFORE built-in skills.

## Example

See `skills/example/` for a working echo skill.
