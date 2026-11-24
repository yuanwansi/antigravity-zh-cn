# Security Policy

## Supported Versions

Only the latest minor release line receives security updates and dictionary safety fixes.

| Version | Supported          |
| ------- | ------------------ |
| 1.2.x   | :white_check_mark: |
| < 1.2   | :x:                |

## Security Architecture

- **Zero External Runtime Dependencies**: All Electron ASAR parsing, SHA-256 block integrity calculation, and DOM translation logic use Node.js built-in modules only, eliminating third-party npm supply-chain risk.
- **Origin & Content Isolation**: The localization runtime executes exclusively on local client surfaces (`127.0.0.1`, `localhost`, `plugin:`, `file:`) and skips code blocks, terminal output, file trees, and user/agent conversation payloads.
- **Verified Backups**: Original `app.asar` archives are backed up with SHA-256 verification prior to modification.

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub issues.

Instead, report vulnerabilities privately via **[GitHub Private Vulnerability Reporting](https://github.com/yuanwansi/antigravity-zh-cn/security/advisories/new)** on this repository. Include:

1. Affected version of `antigravity-zh-cn` and operating system;
2. Clear reproduction steps or proof-of-concept;
3. Potential impact assessment.

We aim to acknowledge reports within 48 hours and publish a fix or mitigation within 7 days.
