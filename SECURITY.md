# Security Policy

## Supported versions

Security fixes are applied to the latest release on `main`.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive reports.

Email **karthik [dot] subramanian [at] berkeley [dot] edu** with:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- Affected version / commit if known

You should receive an acknowledgment within a few days. Please give a reasonable window for a fix before any public disclosure.

## Scope notes

Darwin runs untrusted LLM-written tool code. Prefer reports involving:

- Secret leakage from the local sandbox fallback into child processes
- Path traversal via task / tool ids
- Unauthenticated access to a non-loopback live server (`DARWIN_API_TOKEN` bypass)
- Grader isolation breaks (expected answers entering a sandbox)

## Deploying the live server

Bind to loopback by default. If you expose `darwin.server.app` beyond `127.0.0.1`, set a strong `DARWIN_API_TOKEN` and send `Authorization: Bearer …` on `POST /api/run` and `WS /ws`.
