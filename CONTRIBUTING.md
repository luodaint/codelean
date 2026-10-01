# Contributing to Codelean

Bug reports, documentation improvements, review skills, and focused code changes are welcome. Use [issues](https://github.com/luodaint/codelean/issues) for reproducible bugs or feature proposals. Search existing issues first. For substantial behavior changes, explain the use case before investing in a large PR.

1. Fork the repository and create a feature branch in your fork.
2. Follow [local setup](docs/getting-started.md); keep credentials in ignored `.env` files.
3. Read [AGENTS.md](AGENTS.md), [architecture](docs/architecture.md), and [extension guidance](docs/extending.md).
4. Make a focused change, update relevant documentation, and run `npm run typecheck`, `npm test`, Python scanner tests, and `npm run build`.
5. Open a PR against `main` with the problem, resulting behavior, and validation. Maintainers review and merge accepted changes; contributors do not need upstream write access.

Use a disposable database for integration tests. Do not use deployment credentials in CI or paste private repository contents, logs containing secrets, or customer data into issues. Report vulnerabilities using [SECURITY.md](SECURITY.md).

Be respectful, provide actionable feedback, and keep discussion relevant. Do not harass contributors or disclose private information. Contributions are under the [MIT license](LICENSE); preserve third-party licenses and provenance.
