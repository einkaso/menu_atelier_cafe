# Production source backup before guest table ordering

Release: menu-20261025-offer-side-handles-369
Snapshot date: 2026-10-25
Archive: menu-369-source.tar.gz
Files: 833
SHA-256: 222008726c7ada0bf3ce01ac06503b427da085904070e46d408d2403931e7e21

This is a source-code snapshot, not a public database or full server image.
It includes application code, database schema and migrations, tests, scripts,
package manifests/lockfile and build configuration. No guest-order changes
have been made in this snapshot.

Excluded: environment files, production credentials and tokens, database dumps,
customer/employee data, runtime files, node_modules, generated builds, uploaded
photos, static media, operational documentation and binary test fixtures.
Production secret values were checked against the selected text files; no matches
were found. Secret-like literals in tests were reviewed as synthetic test values.
The private local backup retains the source/static assets, database and environment.
Managed uploads remain private on the server and in its existing backups.

Restore into a separate directory, not over a running production service:
1. Verify the archive checksum.
2. Extract with tar -xzf menu-369-source.tar.gz -C <restore-directory>.
3. Restore static media and managed uploads from private storage; restore the
   matching private database/configuration separately.
4. Use the lockfile and supported Node version to install dependencies, build
   and validate before switching production. Do not publish secrets to GitHub.

The repository root may contain an older release: this archive is the current
production source checkpoint.
