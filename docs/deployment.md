# Remote Access and Protected Dashboards

KORVIN can run as a self-hosted system without making its dashboard public. This guide explains the recommended post-install pattern for users who want remote browser access without exposing raw service ports directly to the internet.

This document is guidance only. It does not mean the setup wizard is complete. `korvin init` is still roadmap-only until it is implemented and tested.

## The short version

For a private install, keep KORVIN local.

For remote dashboard access, the recommended pattern is:

1. Keep the KORVIN dashboard bound to the local machine.
2. Put Cloudflare Tunnel in front of it.
3. Put Cloudflare Access in front of the public dashboard URL.
4. Only allow approved users to reach the dashboard.

That is what this project means by internet with protection.

It means the dashboard can be reached from a browser, but it is not simply open to the public internet.

## Local-only access

Local-only access means KORVIN is reachable only from the machine where it runs, or from a private environment you control.

This is the simplest and safest mode for early testing.

Use local-only access when:

- You are experimenting on your own machine.
- You do not need to open the dashboard from another location.
- You are not ready to configure a domain, tunnel, or access policy.
- You want the smallest possible public attack surface.

In this mode, there may be no public dashboard URL at all.

## Remote access

Remote access means you want to open the KORVIN dashboard from a browser outside the server or local machine.

Examples:

- You run KORVIN on a VPS and want to open the dashboard from your laptop.
- You want a clean domain such as `dashboard.example.com`.
- You want to manage KORVIN while away from the machine where it runs.

Remote access is useful, but it should be protected. A dashboard should not be exposed by simply opening a raw port to the internet.

## What internet with protection means

Internet with protection means:

- The KORVIN service stays private on the server.
- A tunnel connects the private service to a public domain.
- An access layer checks who is allowed before the dashboard loads.
- Unapproved visitors are blocked before they reach the dashboard.
- Raw service ports are not used as the public entry point.

Plain English version:

A user visits the dashboard URL. Cloudflare checks whether that user is allowed. If the user passes the check, Cloudflare sends the request through the tunnel to the local KORVIN dashboard. If the user does not pass the check, the request stops at Cloudflare.

## Why Cloudflare Tunnel is recommended

Cloudflare Tunnel is recommended for remote dashboard access because it lets a private local service be reached through a public domain without opening the service directly to the internet.

The main benefits are:

- No need to expose raw public service ports.
- No need to point users directly at a server IP address.
- Public traffic can flow through a managed HTTPS route.
- The KORVIN dashboard can remain local behind the tunnel.
- The public URL can be changed without rewriting KORVIN core logic.

Cloudflare Tunnel is not the only possible solution. Advanced users may choose another reverse proxy, VPN, private network, or zero-trust gateway. For a beginner-friendly KORVIN path, Cloudflare Tunnel is the recommended default.

## Why Cloudflare Access is strongly recommended

Cloudflare Tunnel creates a path to the dashboard. Cloudflare Access adds the gate in front of that path.

Cloudflare Access is strongly recommended for any dashboard exposed through a public domain because it can require an approved identity before the dashboard loads.

Examples of Access policies:

- Only allow specific email addresses.
- Only allow users from a specific email domain.
- Require a one-time code or identity provider login.
- Block everyone except explicitly approved users.

Cloudflare Access is not a replacement for writing secure software. It is an additional protection layer in front of the dashboard.

## Recommended access modes

### Mode 1: Local-only

Best for early testing, local development, and private experiments.

Recommended pattern:

- KORVIN dashboard listens locally.
- No public dashboard URL is required.
- No internet exposure is required.

### Mode 2: Remote with protection

Best for a VPS, remote admin, or a self-hosted dashboard you want to reach from anywhere.

Recommended pattern:

- KORVIN dashboard listens locally.
- Cloudflare Tunnel routes a public hostname to the local dashboard.
- Cloudflare Access protects the public hostname.
- Only approved users can reach the dashboard.

### Mode 3: Advanced custom access

Best for experienced users who already manage their own infrastructure.

Possible alternatives:

- VPN-only access
- Private reverse proxy
- Tailscale, WireGuard, or similar private network
- Custom identity-aware proxy
- Internal-only network deployment

These are valid paths, but they are outside the beginner default.

## Protected-access flow

The protected remote access flow looks like this:

1. KORVIN dashboard runs locally on the server.
2. The dashboard is not exposed through a raw public port.
3. Cloudflare Tunnel connects the private dashboard to a public hostname.
4. A user opens the dashboard hostname in a browser.
5. Cloudflare Access checks the user first.
6. Approved users continue to KORVIN.
7. Unapproved users are blocked before reaching KORVIN.

## High-level setup flow

This is the expected user journey after KORVIN is installed.

1. Choose local-only or remote access.
2. If local-only, keep the dashboard private and stop here.
3. If remote, choose a dashboard hostname.
4. Create a Cloudflare Tunnel for the dashboard service.
5. Route the dashboard hostname through the tunnel.
6. Create a Cloudflare Access application for that hostname.
7. Add an Access policy for approved users.
8. Confirm the dashboard is reachable only after Access approval.
9. Confirm raw public ports are not the public entry point.

This guide intentionally avoids exact provider-click instructions until the installer and deployment flow are standardized.

## Open WebUI is optional

Open WebUI can be useful as an auxiliary interface, but it is not KORVIN core.

If Open WebUI is used, treat it the same way as the KORVIN dashboard:

- Keep it separate from KORVIN core.
- Protect any public route with an access layer.
- Do not describe it as required for KORVIN to work.
- Do not expose it through a raw public port.

A user should be able to understand KORVIN without needing Open WebUI.

## What belongs in the README

The README should stay simple and adoption-focused.

Good README content:

- KORVIN can run locally or self-hosted.
- Remote dashboard access should be protected.
- Cloudflare Tunnel plus Cloudflare Access is the recommended beginner-friendly pattern.
- Open WebUI is optional and separate from KORVIN core.
- Link to this post-install guide for details.

The README should not become a full infrastructure tutorial.

## What belongs in this guide

This guide should hold the extra detail that would overwhelm the README:

- Local-only access vs remote access
- What internet with protection means
- Why raw public ports are discouraged
- Why Cloudflare Tunnel is recommended
- Why Cloudflare Access is strongly recommended
- What the protected flow looks like
- What remains optional
- What future installer steps may automate later

## Suggested README pointer

Use wording like this in the README:

```md
For local use, KORVIN can run without exposing a public dashboard. For remote dashboard access, use a protected route. The recommended pattern is Cloudflare Tunnel plus Cloudflare Access, so the dashboard is reachable from the internet only after an access check. See `docs/deployment.md` for the post-install guidance.
```

## Safety checklist

Before treating a dashboard as ready for remote access, confirm:

- The dashboard is not exposed through a raw public service port.
- The public dashboard hostname is protected by an access policy.
- Only approved users can pass the access check.
- Secrets are not placed in documentation, screenshots, issues, or chat logs.
- Open WebUI, if used, is protected separately and remains optional.
- The setup does not claim `korvin init` is already implemented.
- Public docs do not claim security features that are not implemented and tested.

## Current project status note

As of this documentation phase, KORVIN is not yet a one-command beginner installer. The npm package currently represents the JavaScript SDK surface, and `korvin init` remains planned work.

This guide is still useful now because it defines the recommended safe public-access pattern before the installer automates it later.
