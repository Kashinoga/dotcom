# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.16.2 create --template minimal --types ts --no-install apps/home
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Tests

`pnpm check` type-checks. `pnpm test:e2e` drives a real browser — most of what breaks here
(a `max-width` silently ignored on a table cell, two map labels overlapping at every phone
size, a focus ring that fell back to a hairline) type-checks perfectly well.

Install the browser once per machine, then run the suites:

```sh
pnpm --filter home exec playwright install firefox
pnpm test                      # from the repo root; runs every suite
pnpm --filter home test:e2e oplong map    # …or just the ones whose names match
```

The runner spawns its own dev server on port **5199**, not Vite's 5173, so it never assumes
a server you already have running is its own — and it tears down only the process group it
created. Point it at a server you're already running with `E2E_BASE=http://localhost:5173`.
