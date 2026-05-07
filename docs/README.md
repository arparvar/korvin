# KORVIN Documentation

This folder contains extended documentation for KORVIN.

KORVIN is an open-source, self-hosted AI agent framework for low-cost hardware. Voice-first. Memory-persistent. Model-agnostic. No lock-in.

## Start Here

- [Quickstart](quickstart.md)
  Install the published CLI and create a safe local-only KORVIN starter folder.

- [Commands](commands.md)
  CLI commands such as `korvin init`, `korvin doctor`, and version checks.

- [Configuration](configuration.md)
  Generated files, safe defaults, and configuration boundaries.

## Deployment and Access

- [Deployment](deployment.md)
  Safe remote access guidance using local-only services, Cloudflare Tunnel, and Cloudflare Access.

## Product Positioning

- [Positioning](positioning.md)
  Public wording, project boundaries, and claim discipline.

- [Landing Page Copy v1](landing-page-copy-v1.md)
  Reference copy used for the first public landing page.

## Planning and Specs

These documents guide future implementation. They should not be read as completed runtime features unless the feature is already implemented and tested.

- [korvin init UX spec](specs/korvin-init-ux-spec-v0.1.md)
- [korvin init implementation plan](specs/korvin-init-implementation-plan-v0.1.md)
- [korvin init local validation plan](specs/korvin-init-local-validation-plan-v0.1.md)

## Current Boundaries

The current public CLI supports local setup files and local checks.

It does not automatically configure VPS infrastructure, Cloudflare, Telegram, LiteLLM runtime services, dashboard services, systemd services, provider keys, or public ports.
