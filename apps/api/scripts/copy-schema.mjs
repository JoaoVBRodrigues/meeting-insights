import { copyFile } from 'node:fs/promises';
await copyFile(
  new URL('../src/schema.sql', import.meta.url),
  new URL('../dist/schema.sql', import.meta.url),
);
