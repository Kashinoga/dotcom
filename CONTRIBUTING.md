# Working on this repo

## The working directory is the local clone

    C:\Users\Kashinoga\Downloads\Git\dotcom

Edit there, build there, run the dev server there.

`Z:\git\dotcom` is a **mirror**, not a second working copy. It cannot build: the share is SMB and
Windows refuses to create symlinks on it, so `pnpm install` fails there outright — with
`--node-linker=hoisted`, with the store on local disk, with anything. A failed attempt leaves a few
hundred megabytes of half-written `node_modules` behind to clean up.

The two copies silently diverged for a whole session once: the share sat on `main` at the
pre-rebuild commit while every commit landed on a branch in the clone. Nothing edited on the share
could reach the running site, and nothing said so.

## After every push, update the mirror

    git -C Z:/git/dotcom fetch origin
    git -C Z:/git/dotcom checkout -B <branch> origin/<branch>

Once the branch is checked out and tracking, `git -C Z:/git/dotcom pull` is enough. `_TO_MIGRATE/`
on the share is untracked and survives a checkout, so it needs no protecting.

## `vite preview` does not hot-reload

`pnpm --filter home preview` serves a **frozen build**. No watcher, no websocket, no reload — a tab
left on one looks exactly like broken hot-reloading, and stays that way however many times you save.
Use `pnpm dev` for anything you intend to iterate on, and stop preview servers when the check they
were opened for is finished.

## A dependency updated in place needs care

`@kashinoga/design-system` is a git dependency. Vite pre-bundles dependencies and caches the result
under `node_modules/.vite`, and a git dependency updated in place does not reliably invalidate that
cache — so the version in `package.json` is new, the file on disk is new, and the browser gets the
old one. `apps/home/vite.config.ts` excludes it from pre-bundling for exactly this reason. If
something from the design system still looks stale, delete `apps/home/node_modules/.vite` and
restart.
