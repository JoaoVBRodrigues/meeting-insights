# Verificação
Vitest + React Testing Library verificam estados da interface. Supertest usa uma aplicação Express real com PostgreSQL exclusivo de testes. Playwright verifica o fluxo integrado e axe avalia barreiras detectáveis automaticamente.

## Resultados locais — 22/10/2026

Windows, Node 22.23.2, npm 10.9.8, PostgreSQL 17 via Docker Compose, Chromium instalado pelo Playwright. Todos os comandos abaixo foram executados; o E2E roda depois dos testes, sem concorrência entre suítes que disputem recursos.

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Passou |
| `npm run typecheck` | Passou nos dois workspaces |
| `npm test` | 17 testes API/guard com PostgreSQL + 14 testes React passaram |
| `npm run build` | API compilada com schema e frontend de produção gerados |
| `npm run db:migrate` e `npm run db:seed` | Executados; seed inicial criou 3 reuniões e 8 ações; repetição testada preserva edições |
| `npm run test:e2e` | 3 testes passaram em Chromium com API e banco reais |
| `npm audit` | Zero vulnerabilidades após atualização do Vitest |

Os testes API cobrem JSON inválido, limite, campo inválido, datas/fusos inválidos, referências, duplicação e rollback real, filtros/paginação, inexistência, atualização persistente, seed repetível e relógio em São Paulo. A proteção de testes exige protocolo PostgreSQL, destino diferente de desenvolvimento, nome `_test` e consulta `current_database()` antes de migration e TRUNCATE. Nunca apontar TEST_DATABASE_URL para desenvolvimento ou produção.

Os testes React cobrem falha/retry, gráfico/tabela, calendário, skip link, filtros, PATCH, resposta salva, origem e HTML não executado, importação inválida e troca de arquivo, manutenção do foco na paginação e remoção da ação que sai do filtro.

E2E: importação via teclado → busca → reunião → origem com foco → alteração de responsável e status → salvar → recarregar → indicadores globais. A suíte também simula falha de resumo e recuperação e executa axe em quatro páginas a 360/768/1440px, além do detalhe no fluxo. Os dados próprios do E2E são sintéticos e permanecem no banco usado pelo navegador; use um banco dedicado para demonstrações limpas.

## Inspeção e limites

Capturas reais em `docs/screenshots`: visão geral desktop/mobile, detalhe desktop/mobile, ações tablet e importação mobile. Inspecionadas hierarquia, margens, leitura sequencial, alinhamento e foco de origem. Nenhuma rolagem horizontal em 360, 768 ou 1440px nas rotas verificadas. Reduced motion exercitado no E2E. Zoom CSS 200% é uma simulação adicional de reflow, não substitui zoom nativo do navegador.

Antes da execução final, falhas reais foram corrigidas: títulos pulando nível, marca decorativa de baixo contraste, coleta duplicada de testes compilados, e cache de configuração após um manifesto com BOM. O limite de teste de integração é 15s e o de navegador 60s para acomodar banco/axe reais; nenhuma asserção foi removida para passar.

CI: **configurado, execução remota não verificada**. Push ao origin retorna 403 com a conta Git atualmente configurada; não há evidência de uma execução remota deste workflow.

Pendente: leitor de tela, Safari/Firefox e zoom nativo/alto contraste em outros sistemas. Não foi executado teste assistivo com leitor de tela. Axe não comprova conformidade completa com WCAG.
