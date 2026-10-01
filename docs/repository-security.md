# Public repository maintenance

Public GitHub repositories allow reading, forks, issues, and pull requests. They do not grant strangers write access. Keep collaborator and team access minimal; contributors should work in forks. Repository administrators remain able to change policy, so protect those accounts with MFA/passkeys.

## Maintainer settings

Apply and verify these settings in GitHub; adding this document does not enforce them:

- Issues and pull requests enabled, creation allowed for all users.
- Active branch ruleset targeting `main`: require a PR, one approving review, code-owner review, dismiss stale approvals, resolve conversations, and pass the `application` CI check with the branch up to date. Block branch deletion and force pushes. No routine bypass actors.
- `.github/CODEOWNERS` names the maintainer. A PR author cannot approve their own PR; a second trusted reviewer is needed to merge maintainer-authored work under one-approval policy. Never weaken the rule merely to merge a pending PR.
- Keep repository collaborator/team write access limited to trusted maintainers. Public contributors use forks; branch protection governs the upstream merge path.
- GitHub Actions token defaults to read-only contents/packages; workflows cannot create or approve PRs. Require approval for workflows from all outside contributors. Run CI on GitHub-hosted runners, without deployment secrets or `pull_request_target` execution of fork code.
- Enable dependency graph, Dependabot alerts/security updates, secret scanning and push protection where available. Enable private vulnerability reporting.
- Keep deployment credentials out of repository Actions. If deployment automation is added, use protected environments with required human approval and narrowly scoped credentials.

For `luodaint/codelean`, public visibility and the active `main` ruleset were verified on 2026-10-01. The ruleset has no bypass actors and also requires approval of the latest reviewable push. Actions require full-length commit SHA references, permit organization/GitHub actions, and require approval for all external contributors. Secret scanning (including generic patterns), push protection, private vulnerability reporting, dependency and malware alerts, and grouped security updates are enabled. CodeQL default setup scans JavaScript/TypeScript, Python, and GitHub Actions. These hosted settings do not transfer automatically to forks. Version-update scheduling, CODEOWNERS, and the security policy take effect on the default branch once the contribution containing them is merged.

The CI workflow declares read-only permissions and does not persist checkout credentials. Review workflow, dependency, Dockerfile, and CODEOWNERS changes carefully. Approving a fork workflow executes contributor code; inspect it first.

## Before making a private repository public

Scan all branches/tags and full history for secrets, plus the current tracked tree. Ignoring a file now does not remove it from history. Review old issues, PRs, Actions logs/artifacts, releases, and documentation for private material. Rotate any exposed real credential before publication; history cleanup alone does not revoke it. `.env`, PEM/private keys, dumps, and build outputs are excluded from version control and Docker build context.

The preparation scan found no Gitleaks matches in tracked files and exported local Git history. This is a point-in-time scan, not a guarantee. Verify GitHub settings and remaining hosted content at publication time.

## Operating policy

Use [SECURITY.md](../SECURITY.md) for private vulnerability reports and [CONTRIBUTING.md](../CONTRIBUTING.md) for community contributions. Retain third-party notices and use reviews for security-sensitive changes. Public visibility and free self-hosting do not imply open signup on every deployment.
