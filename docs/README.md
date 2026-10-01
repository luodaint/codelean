# Documentation

## Install and operate

- [Local setup, GitHub login, workspace onboarding, troubleshooting](getting-started.md)
- [Installation, Compose/Dokploy, GitHub App, backups, upgrades, recovery](installation.md)
- [Complete environment reference and upgrade configuration](configuration.md)
- [NaN, Helmcode, OpenAI, and compatible LLM providers](llm-providers.md)
- [Server preparation and installation brief for humans or coding agents](server-bootstrap.txt)
- [Domain, DNS, HTTPS, webhook tunnel, and rename compatibility](domain-setup.md)
- [Optional billing setup, reconciliation, and operations](billing.md)

## Understand and extend

- [Architecture and security boundaries](architecture.md)
- [Extension points and development workflow](extending.md)
- [Review skills, phases, versioning, and upstream attribution](../review-skills/README.md)
- [Resumable review batches and checkpoints](resumable-reviews.md)
- [Brand assets](branding.md)
- [Contribution instructions](../CONTRIBUTING.md)
- [Security reporting](../SECURITY.md)
- [Public repository controls and maintainer policy](repository-security.md)
- [Coding-agent instructions](../AGENTS.md)
- [MIT license](../LICENSE)

## Design and review records

These are historical records, not configuration defaults; use the current guides above for deployment.

- [Original pricing and billing proposal](pricing-and-billing-proposal.md)
- [Billing PR review resolution](pr-3-review-resolution.md)

## Deployment source files

- [Environment example](../.env.example)
- [Application Dockerfile](../Dockerfile) and [scanner Dockerfile](../scanner/Dockerfile)
- [Base Compose](../compose.yml), [Dokploy routing](../compose.dokploy.yml), [local production smoke test](../compose.local.yml), [development dependencies](../compose.dev.yml)
- [Validation workflow](../.github/workflows/ci.yml)
