# Releasing

Releases are intended for npm trusted publishing from GitHub Actions. No long-lived npm token
should be stored in the repository. Configure `@integration-testing/testcontainers` to trust the release
workflow, then publish immutable versions with provenance.

Prereleases use semantic prerelease versions such as `0.1.0-beta.0` and the npm `beta`
distribution tag. Only a stable release may use the `latest` tag.

Before a release:

```bash
bun install --frozen-lockfile
bun run verify
bun run release:check
```

Only `packages/testcontainers-integration` is publishable. `release:check` confirms that every
other package directory is private and that the primary package version does not already exist
on npm. The release workflow dry-runs the primary package, prevents concurrent releases, and
publishes it with provenance.
