# Security Policy

## Reporting a Vulnerability
If you discover a vulnerability in Korvin, please report it privately to:

**security@nosistech.com**

We will acknowledge your report within **24 hours** and provide an estimated fix timeline.

## Response Times
- **Critical:** Fix within 30 days
- **Other:** Fix within 90 days

## Credit
We publicly credit researchers who report valid vulnerabilities, with their consent, in the CONTRIBUTORS.md file and in release notes when appropriate.

## CVE Assignment
For qualifying vulnerabilities, we will request a CVE identifier from MITRE or another CNA.

## Coordinated Disclosure
We follow a coordinated disclosure model:
1. Researcher reports privately
2. We develop and test a patch
3. We release the patch and publish an advisory
4. Researcher may publish their findings after the patch is available

## Independent Review
All reports are evaluated by the NosisTech security team with priority given to severity classification and user impact.
## Scope
This policy applies to the core Korvin framework, including:
- Agent core (Python)
- Gateway (Node.js)
- Voice components
- Sandbox executor
- Dashboard (FastAPI)

The policy does not cover third-party services (LLM providers, messaging platforms, etc.), though we welcome reports of integration issues.

## Safe Harbor
We will not pursue legal action against researchers who comply with this policy. We consider good-faith security research to be authorized for this project.
