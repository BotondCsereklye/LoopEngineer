# Contributing

Open an issue before a broad workflow or security change. Describe the user problem, trust boundary and acceptance criteria.

Create a focused branch, add tests first and run the full validation suite from [development notes](docs/development.md). Do not commit fixtures that contain provider output, access tokens, personal paths or private repository content.

Pull requests should explain behavior changes, security impact and manual checks. Keep provider-specific flags inside adapters. Keep workflow policy inside the orchestrator and security modules.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
