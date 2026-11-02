# Security policy

trace-rank fetches untrusted websites and reads untrusted repositories, so we treat reports about SSRF, path traversal, secret exposure, prompt injection through the agent skill, or unapproved writes as high priority.

## Reporting

Please use GitHub's private vulnerability reporting ("Report a vulnerability" on the Security tab). Do not open a public issue. Include the version (`trace-rank --version`), the command you ran, and a minimal reproduction.

We aim to acknowledge reports within three working days.

## Supported versions

Only the latest published 0.x release receives fixes during the alpha.
