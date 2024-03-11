### usage

```bash
node index.js ~/Development/endo2/packages/daemon/tsconfig.json ~/Development/endo2/packages/daemon/**/*.ts > graph.dot
dot -Tsvg graph.dot -o graph.svg
```