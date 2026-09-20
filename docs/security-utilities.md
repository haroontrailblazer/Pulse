# Security utilities


Package advisory checks call [OSV's public API](https://google.github.io/osv.dev/post-v1-query/) directly from the browser, or through native HTTP on Android. Only the submitted package name, ecosystem, exact version, and pagination tokens are sent. No project files are uploaded. Each request times out after 15 seconds; results follow up to three pages and display at most 250 advisories, explicitly marking incomplete results. This is a single-package query, not a dependency-tree scan, package-existence check, or security certification. No matches do not establish that a package is safe. Review upstream advisory links for affected ranges and fixes.

JWT inspection decodes the header and claims locally, explains expiry/activation claims, and flags unsigned or malformed tokens. It does not verify signatures, issuers, or audiences; encrypted JWTs (JWE) are unsupported. Token text is not persisted or transmitted. SHA-256 uses Web Crypto locally for exact UTF-8 text or files up to 10 MB, with optional expected-checksum comparison. Clear a selected file to return to text hashing. Utility inputs reset when their tool is closed.

