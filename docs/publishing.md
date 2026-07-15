# Publishing to npm

This guide is for maintainers publishing `loop-engineer`. Users do not need npm publisher access.

## Requirements

- An npm account with two-factor authentication
- Publish access to the `loop-engineer` package
- Node.js 20 or newer
- A clean checkout of the release commit

Check the account and package before changing a version:

```bash
npm login
npm whoami
npm view loop-engineer name version dist-tags --json
```

An npm `E404` response means the package has no public release at the time of the check. It does not reserve the name.

`npm login` authenticates the CLI but does not satisfy the publish security requirement by itself. Enable two-factor authentication on the npm account before the first publish:

```bash
npm profile enable-2fa auth-and-writes
```

npm will open the browser and ask you to register a security key or platform authenticator. A granular access token with write access and **Bypass 2FA** can also publish, but interactive 2FA avoids storing a long-lived publishing credential.

## Prepare the release

Update `package.json`, `package-lock.json` and `CHANGELOG.md` in the same pull request. The CLI version comes from `package.json`, so these commands must print the same version:

```bash
npm run build
head -1 dist/index.js
node dist/index.js --version
node -p "require('./package.json').version"
```

Run the full validation suite and inspect the package contract:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
node scripts/verify-package.mjs
npm pack
```

The verifier requires the executable `dist/index.js`, its Node shebang, matching CLI and package versions, the GUI runtime assets and a tarball smaller than 2 MB. It rejects source files, tests and repository-only assets.

## Test the tarball

Install the generated file before publishing it:

```bash
npm install --global ./loop-engineer-0.1.0.tgz
loopeng --version
loopeng --help
```

Replace `0.1.0` with the version from `package.json`. Remove the test installation with `npm uninstall --global loop-engineer` if you plan to keep using `npm link` from a checkout.

## Publish

Publish from the reviewed release commit:

```bash
git status --short
npm publish --access public
npm view loop-engineer name version dist-tags --json
```

`git status --short` must print nothing. npm does not allow a publisher to replace an existing version. Fix a failed release with a new patch version instead of reusing the old version number.

If npm returns `E403` with “Two-factor authentication ... is required,” finish the account 2FA setup and run the same publish command again. npm prompts for the second factor during the publish. Do not place a one-time code or access token in the repository, shell scripts or documentation.

Create and push the Git tag only after npm confirms the release:

```bash
git tag -a v0.1.0 -m "Loop Engineer v0.1.0"
git push origin v0.1.0
```

Create the matching GitHub release from that tag and copy the release section from `CHANGELOG.md` into the release notes.

## After publishing

Install from the registry in a clean environment:

```bash
npm install --global loop-engineer@0.1.0
loopeng --version
loopeng doctor
```

Then replace source-install instructions in the README and website with `npm install --global loop-engineer`.
