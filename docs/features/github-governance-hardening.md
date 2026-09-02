# GitHub governance hardening

## Goal

Make `main` review-only and deployable, require the full test suite before UAT,
deploy the exact reviewed commit, and add repository ownership and automated
dependency/security checks.

## Acceptance checklist

- [x] Pull requests to `main` run backend, frontend, and ML test jobs.
- [x] Pushes and manual UAT deployments run the same reusable CI workflow.
- [x] UAT deploys only after CI succeeds and use a protected `uat` environment.
- [x] The server checks out the exact GitHub commit SHA being deployed.
- [x] Concurrent UAT deployments are serialized.
- [x] Repository code ownership is explicit.
- [x] Dependency updates are automated for npm, pip, and GitHub Actions.
- [x] CodeQL scans JavaScript/TypeScript and Python on PRs and weekly.
- [x] The README documents structure, local checks, and the release path.
- [x] GitHub `main` branch protection requires PRs and all five checks.
- [x] GitHub `uat` environment protection requires owner approval.

## Verification

The workflow YAML files are parsed locally, whitespace is checked with
`git diff --check`, and the PR's GitHub Actions results are the authoritative
integration proof before merge.
