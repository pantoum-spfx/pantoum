---
title: Troubleshooting
sidebar_label: Troubleshooting
sidebar_position: 3
description: Common issues and simple recovery steps
---

# Troubleshooting

Use this page for the common failure cases in the public workflow.

## Start With Doctor

```bash
npm run doctor
```

If the environment is not healthy, fix that first.

## Studio Does Not Start

- confirm Node.js 22+
- confirm ports `5201` and `5200` are free
- stop any old `npm run webapp` process and start it again

```bash
npm run webapp
```

## Settings Are Not Persisting

Studio writes to `pantoum.settings.yml` in the current directory. Check write permissions and confirm you are running it from the repository you expect.

## Upgrade Still Fails

When a run fails:

1. open the Markdown report
2. check which patch or build step failed
3. review whether Claude was enabled for M365 CLI issues and build failures
4. rerun with a simpler configuration if needed

## Conservative Retry

If you want a smaller first pass, disable extra work:

```bash
pantoum --localPath . --toVersion 1.22.1 \
  --aiFixM365Errors false \
  --aiFixBuildErrors false \
  --updateThirdPartyDeps none \
  --onSingleSolutionFail halt
```

## Missing Dependencies Or Build Errors

If the upgraded solution complains about missing modules or stale installs, run `npm install` inside the solution and inspect the report again.

## When To File An Issue

If you open an issue, include:

- the `npm run doctor` output
- source and target SPFx versions
- the relevant report excerpt
- the command or Studio path you used
