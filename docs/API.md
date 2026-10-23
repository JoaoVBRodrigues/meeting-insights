# API de demonstração

Base local: `http://localhost:3001/api`. Dados exclusivamente sintéticos, sem autenticação no MVP; escute apenas na máquina local. CORS permite `CORS_ORIGIN` (padrão `http://localhost:5178`). Contrato completo: [openapi.yaml](./openapi.yaml).

## Contrato de importação v1

`POST /imports`, `Content-Type: application/json`, recebe `{ "version": 1, "meetings": [...] }`. Consulte [exemplo importável](../fixtures/import-example.json), [seed de demonstração](../fixtures/demo-meetings.json) e [referência inválida](../fixtures/invalid-reference.json).

Cada reunião contém `externalId`, `title`, `startedAt` (ISO 8601 com fuso), `participants` (nomes), `topics` (temas previamente informados), `segments` e `actions`. Segmentos contêm `id`, `speaker`, `at` (`HH:MM:SS` decorrido) e `text`. Ações contêm `title`, `owner`, `dueDate` opcional/nulo (`AAAA-MM-DD`), `status` (`pending`, `in_progress`, `done`) e `sourceSegmentId` opcional/nulo. A origem deve existir na mesma reunião. Temas e ações já vêm informados; não há extração por IA. Campos desconhecidos são rejeitados.

Limites: corpo de 1 MiB, 1–50 reuniões, até 500 segmentos e 200 ações por reunião, 50 participantes e 30 temas. Campos curtos têm até 200 caracteres; texto de segmento até 10.000. A data do prazo é validada como calendário real, sem conversão de fuso. Referências, IDs duplicados no lote e todo o conteúdo são validados antes de gravar. A importação usa uma transação PostgreSQL: qualquer conflito com `externalId` já existente retorna 409 e reverte o lote inteiro. Não atualiza registros existentes. Sucesso 201: `{ "meetingCount": 1, "actionCount": 1 }`.

O seed usa os mesmos validadores e ignora somente reuniões cujo identificador externo já existe; pode ser repetido sem criar duplicatas, preservando edições realizadas.

## Consultas e atualização

Listas retornam `{items,total,page,pageSize}`. Páginas começam em 1; tamanho padrão 10, máximo 50. Ordem de reuniões: início decrescente e ID. Ordem das ações: prazo crescente (sem prazo ao fim) e ID. `total` considera os filtros, independentemente da página.

| Método | Rota | Parâmetros/corpo |
| --- | --- | --- |
| GET | `/health` | Verifica conexão PostgreSQL; 200 `{status:"ok"}` ou 503 |
| GET | `/meetings` | `q` (parte literal do título, sem distinção de maiúsculas), `from`, `to` (datas inclusivas em São Paulo), `page`, `pageSize` |
| GET | `/meetings/{id}` | UUID; retorna participantes, temas, segmentos em ordem e ações |
| GET | `/actions` | `owner` (parte literal do nome, sem distinção de maiúsculas), `status`, `overdue=true/false`, `page`, `pageSize`; filtros combinam por E |
| PATCH | `/actions/{id}` | Pelo menos um entre `owner`, `dueDate` (data ou null), `status`; retorna ação persistida |
| GET | `/summary` | Indicadores globais de todo o banco, sem filtros |

Reunião de lista: `{id,externalId,title,startedAt,participants,topics,actionCount}`. Detalhe acrescenta `segments:[{id,speaker,at,text}]` e `actions`. Ação: `{id,meetingId,meetingTitle,title,owner,dueDate,status,sourceSegmentId,overdue}`. IDs de reunião e ação são UUIDs gerados no servidor. IDs de segmento são preservados da importação e sempre pertencem à respectiva reunião.

Resumo: `{meetingCount,actionCount,openCount,overdueCount,byStatus:{pending,in_progress,done},referenceDate,timeZone}`. Abertas são `pending` + `in_progress`. Atraso significa prazo estritamente anterior à data corrente no fuso `America/Sao_Paulo` e status diferente de `done`; sem prazo não há atraso. Prazo igual a hoje não está atrasado. O relógio é injetável em `createApp` para testes determinísticos. A interface informa o escopo global e a data de referência.

## Erros e operação

Formato: `{ "error": { "code": "VALIDATION_ERROR", "message": "Revise os campos informados.", "fields": { "meetings.0.title": "Campo obrigatório." } } }`. `fields` aparece em validação. Códigos: 400 `VALIDATION_ERROR`/`INVALID_JSON`, 404 `NOT_FOUND`, 409 `DUPLICATE_MEETING`, 413 `PAYLOAD_TOO_LARGE`, 415 `UNSUPPORTED_MEDIA_TYPE`, 500 `INTERNAL_ERROR`, 503 `DATABASE_UNAVAILABLE`. Mensagens 500 não expõem SQL, pilha ou detalhes internos. Toda resposta contém `X-Request-ID`; logs estruturados registram método, caminho, status e duração, sem corpo importado.

Pool: até 10 conexões; conexão expira em 5s e consulta em 10s. Não há repetição automática de gravações. Após falha de rede na importação, consulte a lista antes de repetir: a restrição de identificador externo impede duplicação. PATCH define valores finais e pode ser repetido. Sem rate limiter ou autenticação no MVP local; não exponha a API publicamente sem esses controles. Não há promessa de disponibilidade ou desempenho validada por carga.

Migrations são versionadas, transacionais e protegidas contra execução concorrente por advisory lock. `db:migrate` nunca apaga tabelas/bancos. O teste de integração exige `TEST_DATABASE_URL` com banco terminado em `_test`, distinto de `DATABASE_URL`; apenas esse banco recebe `TRUNCATE`.
