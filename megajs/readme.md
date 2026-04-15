A patched version of qgustavor's [megajs](https://github.com/qgustavor/mega#) project.

## Local fixes

### Shared folder root detection

Some shared-folder API responses no longer identify the root node in a way that matches the older `megajs` heuristic. The original logic assumed the shared root could always be found from the first segment of a node's `k` value. For some newer folders, that assumption is no longer reliable, which can cause shared-folder loading to fail with an undefined root node.

### Shared folder key-slot selection

Some shared folders return node keys in a multi-slot `k` format (for example `id:key/id:key`) where the decryptable slot is not always the last one. The older logic picked the last slot and could fail with `Attributes could not be decrypted with provided key.` even when the link key was valid. Now it iterates candidate key slots, decrypts each candidate, and selects the one that successfully decrypts node attributes.
