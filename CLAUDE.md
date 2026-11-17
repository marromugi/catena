# Commands

Run from the repo root.

- `pnpm fmt` / `pnpm fmt:check` — format with oxfmt
- `pnpm lint` — oxlint, including no import cycles and which module may import which (`.oxlintrc.json`)
- `pnpm typecheck` — tsc in the root and each package
- `pnpm test` — vitest across `packages/*`

CI runs `fmt:check`, `lint`, `typecheck` and `test` on every PR (`.github/workflows/ci.yml`); its `TypeScript` job is required on `main`.

# Breaking changed lines

Run these in a copy of the repo under `/private/tmp`, never in this checkout.

StrykerJS, on the changed lines of one file, from the copy's root. Each mutant runs only the tests that cover it.

```sh
pnpm exec stryker run --mutate "packages/<package>/src/<file>.ts:<from>-<to>"
```

The report and sandboxes go to `.catena-stryker-tmp` beside the copy (`stryker.config.mjs`).

Break rules are ast-grep rules with a `fix`, kept in `packages/<package>/break-rules/`. Run them from that package's directory, so only its changed lines are broken and only the tests that reach the broken file run:

```sh
node <is-it-right>/scripts/break-changed.mts --rules break-rules origin/main -- sh -c 'pnpm vitest related "$BREAK_CHANGED_FILE" --run'
```

`<is-it-right>` is the directory of the mgstack `is-it-right` skill.

# Running the software

catena is a library: nothing here starts as a program, so there is no run skill. Its behaviour is checked by its tests.
