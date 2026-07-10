import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Screenshots the suites take while running. They're debugging aids for a failure, not
// assertions — nothing reads them back — so they land in an ignored directory rather than
// the working tree.
const DIR = join(dirname(fileURLToPath(import.meta.url)), '.artifacts');
mkdirSync(DIR, { recursive: true });

export const artifact = (name) => join(DIR, name);
