// AMBIENT DECLARATIONS — and this file must stay free of any top-level import or export.
//
// That is the whole reason it is not in app.d.ts. A `.d.ts` containing `export {}` is a MODULE, and
// `declare module 'x'` inside a module is an AUGMENTATION of x rather than a declaration of it — so
// for a package that resolves to real untyped JavaScript, TypeScript keeps the untyped original and
// reports it as implicitly `any`. The same line here, in a script rather than a module, declares the
// module outright. (`declare module '*.html?raw'` survives in app.d.ts only because a wildcard
// pattern matches nothing that resolves, so there is nothing for it to augment.)

// The design system ships one plain script alongside its CSS. It carries no types and needs none:
// it is imported for its effect on the document, never for a value.
declare module '@kashinoga/design-system/docs.js';
