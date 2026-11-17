# Commands

Run from the repo root.

- `pnpm fmt` / `pnpm fmt:check` — format with oxfmt
- `pnpm lint` — oxlint, including no import cycles and which module may import which (`.oxlintrc.json`)
- `pnpm typecheck` — tsc in the root and each package
- `pnpm test` — vitest across `packages/*`

CI runs `fmt:check`, `lint`, `typecheck` and `test` on every PR (`.github/workflows/ci.yml`); its `TypeScript` job is required on `main`.

# Breaking changed lines

Run these in a clone of the repo under `/private/tmp`, at the commit under review and after `pnpm install`, never in this checkout.

StrykerJS, on the changed lines of one file, from the copy's root. Each mutant runs only the tests that cover it.

```sh
pnpm exec stryker run --mutate "packages/<package>/src/<file>.ts:<from>-<to>"
```

The report and sandboxes go to `.<copy's directory name>-stryker-tmp` beside the copy (`stryker.config.mjs`).

Break rules are ast-grep rules with a `fix`, kept in `break-rules/`; the directory comes with the first rule a review writes. Run them from the copy's root, where Vitest finds tests across packages, so only the tests that reach the broken file run:

```sh
node <is-it-right>/scripts/break-changed.mts --rules break-rules origin/main -- sh -c 'pnpm vitest related "$BREAK_CHANGED_FILE" --run'
```

`<is-it-right>` is the directory of the mgstack `is-it-right` skill.

# Running the software

catena is used as the `catena` command, the `bin` of `packages/catena`. From a checkout, after `pnpm install`:

```sh
node packages/catena/bin/catena.js draw <diagram.json> [-o <out.svg>]
node packages/catena/bin/catena.js schema
```

`pnpm link --global` in `packages/catena` puts `catena` on the PATH. The diagram file's shape is `src/cli/diagram-file.ts`.

Every run reads the user's config, `config.json` in `$CATENA_CONFIG_DIR`, else in `$XDG_CONFIG_HOME/catena`, else in `~/.config/catena` (`src/config/custom-icons.ts`); its custom icons are what a bare string naming no built-in icon draws. A config that isn't there is no icons; one the reader refuses stops every draw with exit 1. Set `CATENA_CONFIG_DIR` to run against another config, or a directory without one.

The diagram file's JSON Schema, `diagram.schema.json`, lives in the config's directory, listing the built-in and config icon names (`src/cli/diagram-schema.ts`). Every `catena draw` rewrites it there, making the directory, when what it would write differs; `catena schema` writes it and prints the `"$schema": "<absolute path>"` line a diagram file points at it with. Editors don't expand `~` or `$HOME` in that path. There is no run skill; the command's behaviour is checked by its tests (`src/cli/cli.test.ts`).
