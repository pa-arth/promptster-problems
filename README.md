# promptster-problems

Verification test files for [Promptster](https://promptster.ai) OSS issue assessments.

Each directory under `issues/` contains a `.promptster.json` config and a test file that verifies whether a candidate's fix is correct. The test file is fetched by the Promptster CLI at submission time and run in the candidate's workspace.

## Structure

```
issues/
  {issueId}/
    .promptster.json    — metadata, test command, file placement
    verify.*            — test file (vitest, go test, pytest, etc.)
```

## How it works

1. Candidate clones the OSS repo at `brokenSha` via `promptster start`
2. Candidate fixes the bug using Claude Code / Cursor
3. On `promptster done`, the CLI:
   - Fetches the verify test file from this repo
   - Drops it into the workspace at `testDestination`
   - Runs `testCommand`
   - Uploads pass/fail results
   - Removes the test file before submitting code
