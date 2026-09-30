# Upstream provenance

- Repository: https://github.com/cloudflare/security-audit-skill
- Pinned commit: c1c8a8c1471069fb0e188eeaff69b8e8db6564a8
- Source directory: skills/security-audit
- License: MIT; the original notice is retained in LICENSE.

The upstream/ directory contains unmodified SKILL.md and ATTACK-CLASSES.md
from the pinned commit. No upstream scripts are installed or executed by Codelean. SKILL.md beside
this file is a Codelean-authored adapter using the upstream guidance methodology.
Only files explicitly listed in review-skills/skills.json enter
the security prompt. Currently these are the adapter and upstream/ATTACK-CLASSES.md.
The upstream SKILL.md describes the full workflow for reference. Other companion
documents remain in the linked upstream repository and are not loaded automatically.

To update, review a new upstream commit, replace upstream/ and LICENSE from that
exact revision, update the pin here, and review the adapter and enabled file list.
No live network fetch or automatic upstream update happens during a PR review.
