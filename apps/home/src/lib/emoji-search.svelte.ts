// The Emoji Viewer's search, lifted out so two places can share it: the SEARCH control
// (drawn in the panel header, like Weather's) and the emoji wall in the body that filters
// on it. Neither owns the other, so the query lives here between them.
export const emojiSearch = $state({ query: '', open: false });
