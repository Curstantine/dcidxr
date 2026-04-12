A patched version of qgustavor's [megajs](https://github.com/qgustavor/mega#) project.

## Local fixes

### Shared folder root detection

Some shared-folder API responses no longer identify the root node in a way that matches the older `megajs` heuristic. The original logic assumed the shared root could always be found from the first segment of a node's `k` value. For some newer folders, that assumption is no longer reliable, which can cause shared-folder loading to fail with an undefined root node.
