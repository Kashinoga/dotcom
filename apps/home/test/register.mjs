// Installs the resolve hook (see ./loader.mjs) for `node --test`. Passed with `--import`, so it
// runs before any test file is loaded.
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
