# Desenvolvimento
- Manter o MVP descrito em docs/PLAN.md; dados exclusivamente sintéticos.
- Node 22.23.2, npm workspaces, TypeScript estrito. Não versionar segredos ou artefatos temporários.
- Validar entradas no servidor e usar SQL parametrizado. Não apagar bancos existentes.
- Cada incremento: verificar, revisar diff, atualizar PROGRESS, commit Conventional Commit e push em feat/mvp.
- Testes destrutivos somente com TEST_DATABASE_URL cujo banco termina em _test.
- Agentes podem trabalhar em paralelo com propriedade explícita de arquivos; preservar alterações dos demais.
