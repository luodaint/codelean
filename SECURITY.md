# Security policy

Codelean is an early self-hosted application. Use the latest reviewed revision; there is no maintained long-term support branch or guaranteed response SLA.

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/luodaint/codelean/security/advisories/new). Include affected versions, a minimal reproduction, impact, and a proposed fix if available. Do not include active credentials or private customer source code. If private reporting is unavailable, open a non-sensitive issue requesting a private contact channel; do not disclose the vulnerability publicly while arranging it.

## Deployment boundaries

Keep authentication enabled, use HTTPS, restrict signup for private instances, and install your GitHub App only on intended repositories. Never expose development login bypass, PostgreSQL, or the scanner publicly. The scanner is a restricted container sharing the host kernel, not a VM security boundary. Reviews are advisory and do not authorize merges.

Model providers receive selected source content. Findings and checkpoints can contain code excerpts; protect database backups and configure retention for your needs. Provider keys, GitHub keys, SMTP credentials, and authentication secrets must stay server-side.

See [configuration](docs/configuration.md), [installation](docs/installation.md), and [repository security](docs/repository-security.md) for operating guidance. No scanner or repository setting guarantees the absence of vulnerabilities.
