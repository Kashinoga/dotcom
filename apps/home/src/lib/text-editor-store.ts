// The WORKSPACE'S BACKING STORE — what a tree of documents is, and what can be done to one.
//
// The editor grew up against one backing store and had it in its hands: every verb in the pane
// called a `FileSystemFileHandle` method directly, and the row it called through carried the handle
// as a field. That is a fine shape for one store and an impossible one for two, because a document
// that lives on a server has no handle to carry and never will.
//
// So a row is a NAME AND A PATH, and this is the thing that knows what a path means. Nothing above
// here touches a handle: the map from path to handle is private to the local store, in the same way
// a URL and a session cookie would be private to a remote one. The editor asks for a listing, a
// body, a write, a rename, a move, a delete; the store answers, and where it cannot it says so.
//
// Two implementations live here, and they are the two ways a browser will hand over a folder:
//
//   `localStore`    — a real directory handle from `showDirectoryPicker`. Chromium only, and the
//                     only one that can be written to. See `canWrite` in $lib/text-editor-state
//                     for why the detect is on that one function and on nothing else.
//   `snapshotStore` — the `<input webkitdirectory>` fallback. Every browser, read-only, and gone
//                     at the end of the session: those are File objects with nothing behind them.
//
// WHAT BELONGS HERE, and what does not. The store owns the rules that every backing store has to
// keep, whatever it is made of — a name is a name and not a path, a move that would overwrite is
// refused rather than performed, a new file gets a free name rather than landing on top of an old
// one. It does NOT own the shelf or the scratch notes: a loose document is a single file from
// anywhere at all and a scratch note has no file, so neither is a path in a tree and neither is
// this module's business.

/**
 * A document in the tree. Its name and where it sits, and — deliberately — nothing else. Every
 * field this used to carry (`file`, `handle`, `parent`) was the local store's own bookkeeping,
 * published to the whole editor because there was nowhere else to put it.
 */
export type FolderEntry = { name: string; path: string };

/**
 * WHY A WRITE DID NOT HAPPEN. A write is the one verb in this app whose failure leaves NOTHING on
 * screen to notice — a rename that was refused shows the old name, a delete that was refused leaves
 * the row where it was, a move that was refused leaves it in its folder. A save that was refused
 * looks exactly like a save that worked, and the words are still on the sheet either way. So this
 * one answers with a reason and the others answer with a yes or a no.
 *
 * The reasons are what a row can usefully SAY, not a translation of the platform's error list.
 * `conflict` in particular could not exist before there was somewhere to keep a document other
 * than this machine, and it is the one nobody would guess: it means the document changed under you
 * and nothing was overwritten, which is good news wearing the shape of bad news.
 */
export type WriteError = 'conflict' | 'offline' | 'denied' | 'gone' | 'failed';

/** A write's answer. Only `{ ok: true }` means the words are safe. */
export type WriteResult = { ok: true } | { ok: false; why: WriteError };

export const WROTE: WriteResult = { ok: true };
export const notWritten = (why: WriteError): WriteResult => ({ ok: false, why });

/**
 * What the File System Access API throws, said in the words above. Its exceptions are DOMExceptions
 * whose `name` is the whole of the information — the message is for a console, not for a row.
 */
export function whyLocal(error: unknown): WriteError {
	const name = error instanceof DOMException ? error.name : '';
	if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
	if (name === 'NotFoundError') return 'gone';
	return 'failed';
}

/** What a walk found: the readable documents, and every directory it went into. */
export type Listing = { files: FolderEntry[]; dirs: string[] };

/**
 * A document taken OUT of a tree, so it can outlive it — what the shelf holds when a folder is
 * changed underneath the document on the sheet. It is the shelf's `LooseDoc`, described here
 * because the store is the only thing that can produce one: it knows what the row was made of.
 */
export type DetachedDoc = {
	id: string;
	name: string;
	file?: File;
	handle?: FileSystemFileHandle;
	/**
	 * A document on a SERVER: which drive, and where in it. The connection is named by its id rather
	 * than carried as an object, and both halves of that matter.
	 *
	 * A store cannot be carried: it is closures, so IndexedDB will not clone one, and a row that
	 * could not be written down would be a cloud row that vanished on every reload — which is worse
	 * than the local rows, not better. And a store holds the TOKEN, so carrying one would put a
	 * password into a second place, in a list that is written to disk.
	 *
	 * An id and a path are plain data. The row is remembered, the connection is remembered beside
	 * it, and opening the row re-reads from the server exactly as a handle row re-reads from disk.
	 *
	 * A flat optional beside `file` and `handle` rather than a discriminated union, because those
	 * two are already the same idea — one of several ways of saying where a document came from — and
	 * a union would have rewritten every consumer to say what this says by standing here.
	 */
	drive?: { connection: string; path: string };
};

/**
 * WHAT A WORKSPACE CAN DO. Every method that changes something answers with what it did rather
 * than throwing — a null or a false, which the caller reports on the row. That is not politeness:
 * over a network every one of these can fail for reasons that are nobody's mistake, and an
 * exception thrown out of a drag handler is a failure the visitor never sees.
 */
export type Store = {
	/** Which kind, for the messages that have to name it. */
	kind: 'local' | 'snapshot' | 'dav';
	/** The folder's own name — the head of the tree. */
	name: string;
	/** Can anything in here be written? False for a snapshot, always. */
	writable: boolean;
	/**
	 * Read the tree. Called when the folder is picked, and again when it is reconnected.
	 *
	 * NULL means the store could not be read AT ALL — the folder moved, was deleted, or the grant
	 * went away between the check and the call — and that is a different answer from an empty
	 * listing. A remembered folder that answers null is forgotten; one that answers an empty tree is
	 * an empty tree. A partial read (a folder that went away mid-walk) answers with what it got:
	 * some of a workspace is worth showing, and the rows that are there are all still true.
	 */
	list(): Promise<Listing | null>;
	/**
	 * ONE FOLDER'S OWN CHILDREN — present only on a store where reading the whole tree at once is
	 * not free. Its presence is what tells the workspace the tree is PARTIAL: a store without it has
	 * already said everything it knows in `list`, and a store with it has said only the top.
	 *
	 * A flag would have done, and this is better: the flag and the method could disagree, and a
	 * store that claimed to be lazy without a way to fetch would draw a tree nobody could open.
	 *
	 * `list()` on a lazy store returns the ROOT LEVEL, not everything — the caller walks the rest as
	 * folders are opened.
	 */
	listDir?(path: string): Promise<Listing | null>;
	/** A document's words, or null if they cannot be got at. */
	read(path: string): Promise<string | null>;
	/** Write a document back — and say why not, where it did not. See `WriteError`. */
	write(path: string, body: string): Promise<WriteResult>;
	/**
	 * Make a NEW document under `dir` ('' is the root), named `base` + `ext` or the first free
	 * variant of it, holding `body`. Answers with the entry it made, or null.
	 */
	create(dir: string, base: string, ext: string, body: string): Promise<FolderEntry | null>;
	/** Rename in place. `to` is a NAME, not a path. Answers with the entry at its new path. */
	rename(path: string, to: string): Promise<FolderEntry | null>;
	/** Move to another directory in the same tree. Refused if the name is taken there. */
	move(path: string, dir: string): Promise<FolderEntry | null>;
	remove(path: string): Promise<boolean>;
	/**
	 * Make a FOLDER under `dir` ('' is the root), named `name`. Answers with its path, or null.
	 *
	 * A separate verb from `create` rather than a flag on it, because the two answer different
	 * questions: `create` finds a free name because a document is a thing you make and the name is
	 * incidental, and a folder is named on purpose — asking for `Notes` and silently getting
	 * `Notes 2` is not the same favour.
	 */
	createDir?(dir: string, name: string): Promise<string | null>;
	/**
	 * Delete a FOLDER AND EVERYTHING UNDER IT. Separate from `remove` for the same reason it asks a
	 * different question of the visitor: this is the most destructive thing this app can do, it is
	 * recursive, and on a drive it is not undoable from here — Nextcloud has a trash bin but the
	 * proxy's path allow-list does not reach it, so this app cannot offer a restore it cannot make.
	 * The caller confirms by NAME. See `doomedDir` in $lib/TextEditor.
	 */
	removeDir?(path: string): Promise<boolean>;
	/** A reference to this document that outlives the store, for the shelf. Null if there is none. */
	detach(path: string): DetachedDoc | null;
};

/** The directory part of a path — '' for a document at the root. */
export const dirOf = (path: string) =>
	path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

/** A path, from a directory and a name. The root takes no leading slash. */
export const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** Folders not worth walking into. A workspace is for documents, not for a dependency tree. */
const SKIP_DIR = /^(node_modules|\.git|\.svn|\.hg|\.cache|dist|build|\.next|\.svelte-kit)$/;

/** How much of a folder is worth walking. See the note in `walk`. */
const MAX_FILES = 500;
const MAX_DEPTH = 6;

// ── The local store ───────────────────────────────────────────────────────────

/** The local store, plus the two things only a handle-backed folder has: a root, and permission. */
export type LocalStore = Store & {
	kind: 'local';
	/** The directory handle itself — what IndexedDB keeps so the folder comes back next visit. */
	root: FileSystemDirectoryHandle;
	permission(): Promise<'granted' | 'denied' | 'prompt' | undefined>;
	requestPermission(): Promise<'granted' | 'denied' | 'prompt' | undefined>;
};

/**
 * A real folder on the disk, through the File System Access API.
 *
 * The two maps are the whole reason this is a closure rather than a bag of functions. A tree row is
 * derived from paths, so a folder in the sidebar is a STRING — and every write needs the actual
 * handle behind it. Collecting them on the way down the walk is the only place they all pass
 * through; the alternative is re-walking from the root on every drop.
 */
export function localStore(root: FileSystemDirectoryHandle, openable: RegExp): LocalStore {
	let files = new Map<string, FileSystemFileHandle>();
	let dirs = new Map<string, FileSystemDirectoryHandle>();

	async function walk(dir: FileSystemDirectoryHandle, prefix: string, out: FolderEntry[]) {
		dirs.set(prefix, dir);
		// A folder can be arbitrarily deep and arbitrarily large; a workspace that walked all of it
		// would hang on a home directory. Stop at a depth and a count that still cover any notes
		// folder anyone actually keeps.
		if (out.length > MAX_FILES || prefix.split('/').length > MAX_DEPTH) return;
		for await (const [name, entry] of dir.entries()) {
			const path = join(prefix, name);
			if (entry.kind === 'directory') {
				if (!SKIP_DIR.test(name) && !name.startsWith('.')) {
					await walk(entry as FileSystemDirectoryHandle, path, out);
				}
			} else if (openable.test(name)) {
				files.set(path, entry as FileSystemFileHandle);
				out.push({ name, path });
			}
		}
	}

	/**
	 * `Ephemeral 1.md`, or the first numbered variant that is free. `getFileHandle(create: true)`
	 * hands back an EXISTING file of that name rather than failing, so making a second note over a
	 * first one would be silent — the same trap `move` sets, answered the same way.
	 */
	async function freeName(dir: FileSystemDirectoryHandle, base: string, ext: string) {
		for (let n = 1; n < 100; n += 1) {
			const name = n === 1 ? `${base}${ext}` : `${base} ${n}${ext}`;
			try {
				await dir.getFileHandle(name);
			} catch {
				return name;
			}
		}
		return `${base} ${Date.now()}${ext}`;
	}

	async function put(handle: FileSystemFileHandle, body: string): Promise<WriteResult> {
		try {
			const w = await handle.createWritable();
			await w.write(body);
			await w.close();
			return WROTE;
		} catch (error) {
			// Permission withdrawn, or the file went away. Which of those it was is worth carrying:
			// one is fixed by clicking Reconnect and the other is not fixable at all.
			return notWritten(whyLocal(error));
		}
	}

	const store: LocalStore = {
		kind: 'local',
		name: root.name,
		writable: true,
		root,

		async list() {
			const out: FolderEntry[] = [];
			files = new Map();
			dirs = new Map();
			try {
				await walk(root, '', out);
			} catch {
				// Nothing at all came back, so the ROOT is what failed: the folder moved, or was
				// deleted, or a grant lapsed between the check and here. Anything else is a folder
				// that went away mid-walk, and what was gathered before it did is still true.
				if (!out.length && dirs.size <= 1) return null;
			}
			out.sort((a, b) => a.path.localeCompare(b.path));
			return { files: out, dirs: [...dirs.keys()].filter(Boolean) };
		},

		async read(path) {
			const handle = files.get(path);
			if (!handle) return null;
			try {
				return await (await handle.getFile()).text();
			} catch {
				return null;
			}
		},

		async write(path, body) {
			const handle = files.get(path);
			// No handle at that path is the tree disagreeing with the disk, which is what happens
			// when something was moved or deleted by another program while this was open.
			return handle ? put(handle, body) : notWritten('gone');
		},

		async create(dir, base, ext, body) {
			const into = dirs.get(dir);
			if (!into) return null;
			const name = await freeName(into, base, ext);
			let handle: FileSystemFileHandle;
			try {
				handle = await into.getFileHandle(name, { create: true });
			} catch {
				return null;
			}
			if (!(await put(handle, body)).ok) return null;
			const path = join(dir, name);
			files.set(path, handle);
			return { name, path };
		},

		async rename(path, to) {
			const handle = files.get(path);
			// A name is a NAME, not a path — a rename that could write into another directory is a
			// move, and this is the last place that difference can still be enforced.
			if (!handle || !to || /[/\\]/.test(to)) return null;
			try {
				await handle.move(to);
			} catch {
				return null;
			}
			const moved = { name: to, path: join(dirOf(path), to) };
			files.delete(path);
			files.set(moved.path, handle);
			return moved;
		},

		async move(path, dir) {
			const handle = files.get(path);
			const into = dirs.get(dir);
			const name = path.slice(path.lastIndexOf('/') + 1);
			if (!handle || !into || dirOf(path) === dir) return null;
			// A name already taken at the destination. `move` OVERWRITES without a word — the
			// platform will not warn you that the README you dropped has just replaced the README
			// that was there — so this is the one place the store checks BEFORE acting.
			try {
				await into.getFileHandle(name);
				return null;
			} catch {
				/* nothing there by that name, which is what we wanted */
			}
			try {
				await handle.move(into, name);
			} catch {
				return null;
			}
			const moved = { name, path: join(dir, name) };
			files.delete(path);
			files.set(moved.path, handle);
			return moved;
		},

		async remove(path) {
			// Deleting is the DIRECTORY'S verb, not the file's: `removeEntry` is called on the folder
			// that contains it, which is why the walk keeps both maps rather than only the files.
			const parent = dirs.get(dirOf(path));
			if (!parent) return false;
			try {
				await parent.removeEntry(path.slice(path.lastIndexOf('/') + 1));
			} catch {
				return false;
			}
			files.delete(path);
			return true;
		},

		async createDir(dir, name) {
			const into = dirs.get(dir);
			if (!into || !name || /[/\\]/.test(name)) return null;
			// It must not already exist. `getDirectoryHandle(create: true)` hands back an EXISTING
			// folder rather than failing — the same trap `getFileHandle` sets — and "made you a
			// folder" when it did nothing is the kind of lie this store is built to avoid.
			try {
				await into.getDirectoryHandle(name);
				return null;
			} catch {
				/* nothing there by that name, which is what we wanted */
			}
			let made: FileSystemDirectoryHandle;
			try {
				made = await into.getDirectoryHandle(name, { create: true });
			} catch {
				return null;
			}
			const path = join(dir, name);
			dirs.set(path, made);
			return path;
		},

		async removeDir(path) {
			const parent = dirs.get(dirOf(path));
			if (!parent || !path) return false;
			try {
				// RECURSIVE, deliberately. Without it a folder with anything in it simply refuses, and
				// the visitor has already been asked to type its name — a confirmation that strong
				// followed by "no" is worse than not offering the verb.
				await parent.removeEntry(path.slice(path.lastIndexOf('/') + 1), { recursive: true });
			} catch {
				return false;
			}
			// Everything under it went with it, so everything under it goes from both maps.
			for (const key of [...files.keys()])
				if (key === path || key.startsWith(`${path}/`)) files.delete(key);
			for (const key of [...dirs.keys()])
				if (key === path || key.startsWith(`${path}/`)) dirs.delete(key);
			return true;
		},

		detach(path) {
			const handle = files.get(path);
			if (!handle) return null;
			return { id: path, name: handle.name, handle };
		},

		permission: () => Promise.resolve(root.queryPermission?.({ mode: 'readwrite' })),
		requestPermission: () => Promise.resolve(root.requestPermission?.({ mode: 'readwrite' }))
	};
	return store;
}

// ── The snapshot store ────────────────────────────────────────────────────────

/**
 * A `<input webkitdirectory>` folder: a flat list of File objects, read-only, and only as fresh as
 * the moment it was picked. Every browser has it and none of them will let it be written to, so
 * every verb below the reading one answers no.
 *
 * It knows no DIRECTORIES either — an empty folder leaves no File to be seen in, so `dirs` is
 * empty and a tree derived from these paths is the whole of what this store can say. That is the
 * platform's limit, not a shortcut: it is also why moving is not offered here.
 */
export function snapshotStore(name: string, picked: File[], openable: RegExp): Store {
	const files = new Map<string, File>();
	const out: FolderEntry[] = [];
	// The folder's own name is the first segment of every entry's relative path — and it is only
	// ever the first segment, so it comes OFF the paths as well as out of them. Left on, it would
	// be a tree with one root node holding everything, indenting every document by a level to
	// repeat what the heading above the list already says.
	const root = picked[0]?.webkitRelativePath?.split('/')[0] ?? '';
	for (const f of picked) {
		if (!openable.test(f.name)) continue;
		const full = f.webkitRelativePath || f.name;
		const path = root && full.startsWith(`${root}/`) ? full.slice(root.length + 1) : full;
		files.set(path, f);
		out.push({ name: f.name, path });
	}
	out.sort((a, b) => a.path.localeCompare(b.path));

	const no = async () => null;
	return {
		kind: 'snapshot',
		name: name || root,
		writable: false,
		list: async () => ({ files: out, dirs: [] }),
		read: async (path) => {
			const file = files.get(path);
			if (!file) return null;
			try {
				return await file.text();
			} catch {
				// A file that vanished between picking and reading, or one the browser will not hand
				// over. A snapshot is a list of promises about a folder as it was.
				return null;
			}
		},
		// Not "it failed" — it was never possible. A snapshot is a list of File objects and no
		// browser will write through one.
		write: async () => notWritten('denied'),
		create: no,
		rename: no,
		move: no,
		remove: async () => false,
		// A File CAN be shelved, even though it cannot be saved to: the shelf re-reads a row when it
		// is opened, and a File will still answer for as long as the tab is alive. The row is lost on
		// a reload, like every other snapshot row, because there is nothing behind it to remember.
		detach: (path) => {
			const file = files.get(path);
			return file ? { id: path, name: file.name, file } : null;
		}
	};
}
