import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  meetingDate,
  statusLabels,
  type Action,
  type Detail,
  type Meeting,
  type Page,
  type Status,
} from './api';
import { ApiState, Empty, MeetingRows, useApi } from './App';
export function PageHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">Caderno de trabalho / {number}</p>
        <h1>{title}</h1>
        <p className="lead">{description}</p>
      </div>
    </div>
  );
}
function Pagination({
  data,
  error,
  onChange,
}: {
  data: { page: number; total: number; pageSize: number } | undefined;
  error: string;
  onChange: (page: number) => void;
}) {
  const [lastPage, setLastPage] = useState(data);
  useEffect(() => {
    if (data) setLastPage(data);
  }, [data]);
  const current = data || lastPage;
  if (!current) return null;
  const { page, total, pageSize } = current;
  const busy = !data && !error;
  return (
    <nav className="pagination" aria-label="Paginação">
      <span role="status" aria-atomic="true">
        {total} {total === 1 ? 'registro' : 'registros'} · Página {page} de{' '}
        {Math.max(1, Math.ceil(total / pageSize))}
      </span>
      <div>
        <button
          disabled={page <= 1}
          aria-disabled={busy || !!error || page <= 1}
          onClick={() => {
            if (!busy && !error) onChange(page - 1);
          }}
        >
          ← Anterior
        </button>
        <button
          disabled={page * pageSize >= total}
          aria-disabled={busy || !!error || page * pageSize >= total}
          onClick={() => {
            if (!busy && !error) onChange(page + 1);
          }}
        >
          Próxima →
        </button>
      </div>
    </nav>
  );
}
export function Meetings() {
  const [filters, setFilters] = useState({ q: '', from: '', to: '' });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const result = useApi<Page<Meeting>>(`/meetings?page=${page}&pageSize=8${query}`);
  function apply(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setQuery('&' + new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString());
  }
  return (
    <>
      <PageHeading
        number="02"
        title="As conversas, em ordem."
        description="Encontre uma reunião e retome o contexto."
      />
      <form className="filters" onSubmit={apply}>
        <label className="grow">
          Buscar por título
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            type="search"
            placeholder="Ex.: planejamento"
          />
        </label>
        <label>
          De
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
        <button className="primary">Aplicar filtros</button>
      </form>
      <ApiState error={result.error} reload={result.reload}>
        {result.data && (
          <>
            <MeetingRows items={result.data.items} />
          </>
        )}
      </ApiState>
      <Pagination data={result.data} error={result.error} onChange={setPage} />
    </>
  );
}
export function ActionEditor({
  action,
  onSaved,
  headingLevel = 3,
}: {
  action: Action;
  onSaved?: () => void;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const [savedAction, setSavedAction] = useState(action);
  const [owner, setOwner] = useState(action.owner);
  const [dueDate, setDueDate] = useState(action.dueDate || '');
  const [status, setStatus] = useState(action.status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const prefix = `action-${action.id}`;
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setFields({});
    setMessage('Salvando ação…');
    try {
      const updated = await api<Action>(`/actions/${action.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ owner, dueDate: dueDate || null, status }),
      });
      setSavedAction(updated);
      setMessage('Alterações salvas.');
      onSaved?.();
    } catch (e) {
      setMessage('');
      setError((e as Error).message);
      if (e instanceof ApiError) setFields(e.fields);
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className="action-entry">
      <div className="action-top">
        <span className={`badge ${savedAction.status}`}>{statusLabels[savedAction.status]}</span>
        {savedAction.overdue && <span className="overdue">Prazo atrasado</span>}
      </div>
      <Heading>{action.title}</Heading>
      <a className="action-meeting" href={`#/meetings/${action.meetingId}`}>
        {action.meetingTitle}
      </a>
      <form onSubmit={save} className="action-form">
        <label>
          Responsável
          <input
            id={`${prefix}-owner`}
            required
            maxLength={200}
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setMessage('');
            }}
            aria-invalid={!!fields.owner}
            aria-describedby={fields.owner ? `${prefix}-owner-error` : undefined}
          />
          {fields.owner && (
            <span className="field-error" id={`${prefix}-owner-error`}>
              {fields.owner}
            </span>
          )}
        </label>
        <label>
          Prazo
          <input
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              setMessage('');
            }}
            aria-invalid={!!fields.dueDate}
            aria-describedby={fields.dueDate ? `${prefix}-date-error` : undefined}
          />
          {fields.dueDate && (
            <span className="field-error" id={`${prefix}-date-error`}>
              {fields.dueDate}
            </span>
          )}
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status);
              setMessage('');
            }}
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="action-controls">
          <button disabled={saving} className="primary">
            {saving ? 'Salvando…' : 'Salvar ação'}
          </button>
          {action.sourceSegmentId && (
            <a
              href={`#/meetings/${action.meetingId}?segment=${encodeURIComponent(action.sourceSegmentId)}`}
            >
              Ver trecho de origem →
            </a>
          )}
        </div>
        <p role="status" className="save-message">
          {message}
        </p>
        {error && (
          <p role="alert" className="field-error">
            {error} Revise os campos e tente salvar novamente.
          </p>
        )}
      </form>
    </article>
  );
}
export function Actions({ initialOverdue = false }: { initialOverdue?: boolean }) {
  const savedNotice = useRef<HTMLParagraphElement>(null);
  const [saveCount, setSaveCount] = useState(0);
  const [filters, setFilters] = useState({ owner: '', status: '', overdue: initialOverdue });
  const [query, setQuery] = useState(initialOverdue ? '&overdue=true' : '');
  const [page, setPage] = useState(1);
  const result = useApi<Page<Action>>(`/actions?page=${page}&pageSize=6${query}`);
  useEffect(() => {
    if (saveCount) savedNotice.current?.focus();
  }, [saveCount]);
  function saved() {
    setSaveCount((count) => count + 1);
    setPage(1);
    result.reload();
  }
  function apply(e: FormEvent) {
    e.preventDefault();
    const values: Record<string, string> = {};
    if (filters.owner) values.owner = filters.owner;
    if (filters.status) values.status = filters.status;
    if (filters.overdue) values.overdue = 'true';
    setQuery('&' + new URLSearchParams(values).toString());
    setPage(1);
  }
  return (
    <>
      <PageHeading
        number="03"
        title="Os próximos passos."
        description="Responsáveis, prazos e o contexto de cada entrega."
      />
      <form className="filters" onSubmit={apply}>
        <label className="grow">
          Responsável
          <input
            value={filters.owner}
            onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
            placeholder="Nome do responsável"
          />
        </label>
        <label>
          Status
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Todos os status</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={filters.overdue}
            onChange={(e) => setFilters({ ...filters, overdue: e.target.checked })}
          />
          Somente atrasadas
        </label>
        <button className="primary">Aplicar filtros</button>
      </form>
      <p ref={savedNotice} role="status" tabIndex={-1} className="save-message">
        {saveCount > 0 ? 'Alterações salvas. Os filtros continuam aplicados.' : ''}
      </p>
      <ApiState error={result.error} reload={result.reload}>
        {result.data && (
          <>
            {result.data.items.length ? (
              <div className="actions-list">
                {result.data.items.map((action) => (
                  <ActionEditor key={action.id} action={action} onSaved={saved} headingLevel={2} />
                ))}
              </div>
            ) : (
              <Empty text="Nenhuma ação encontrada." />
            )}
          </>
        )}
      </ApiState>
      <Pagination data={result.data} error={result.error} onChange={setPage} />
    </>
  );
}
function SegmentRow({ segment, active }: { segment: Detail['segments'][number]; active: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (active) {
      ref.current?.focus();
      ref.current?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    }
  }, [active]);
  return (
    <li
      ref={ref}
      tabIndex={-1}
      className={active ? 'segment highlighted' : 'segment'}
      id={`segment-${segment.id}`}
      aria-label={active ? 'Trecho de origem da ação' : undefined}
    >
      <div className="segment-meta">
        <strong>{segment.speaker}</strong>
        <span>{segment.at}</span>
      </div>
      <p>{segment.text}</p>
      {active && <span className="origin-label">Trecho de origem da ação</span>}
    </li>
  );
}
export function MeetingDetail({ id, segment }: { id: string; segment: string | null }) {
  const result = useApi<Detail>(`/meetings/${encodeURIComponent(id)}`);
  const data = result.data;
  return (
    <>
      <a href="#/meetings" className="back-link">
        ← Todas as reuniões
      </a>
      <ApiState error={result.error} reload={result.reload}>
        {data && (
          <>
            <div className="detail-heading">
              <p className="eyebrow">Reunião · {meetingDate(data.startedAt)}</p>
              <h1>{data.title}</h1>
              <p className="lead">{data.participants.join(' · ')}</p>
              <div className="topics">
                {data.topics.map((topic) => (
                  <span key={topic}>{topic}</span>
                ))}
              </div>
            </div>
            <div className="detail-columns">
              <section aria-labelledby="transcript-heading">
                <div className="section-heading">
                  <h2 id="transcript-heading">Transcrição</h2>
                  <span className="muted">{data.segments.length} trechos</span>
                </div>
                <ol className="transcript">
                  {data.segments.map((item) => (
                    <SegmentRow segment={item} active={segment === item.id} key={item.id} />
                  ))}
                </ol>
              </section>
              <section aria-labelledby="meeting-actions">
                <div className="section-heading">
                  <h2 id="meeting-actions">Ações da reunião</h2>
                  <span className="muted">{data.actions.length} ações</span>
                </div>
                {data.actions.length ? (
                  data.actions.map((action) => <ActionEditor key={action.id} action={action} />)
                ) : (
                  <p className="muted">Esta reunião não possui ações.</p>
                )}
              </section>
            </div>
          </>
        )}
      </ApiState>
    </>
  );
}
export function ImportPage() {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const fileReadRevision = useRef(0);
  async function read(file?: File) {
    const revision = ++fileReadRevision.current;
    setText('');
    setError('');
    setMessage('');
    setFields({});
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('O arquivo deve ter no máximo 1 MiB.');
      return;
    }
    try {
      const contents = await file.text();
      if (revision === fileReadRevision.current) setText(contents);
    } catch {
      if (revision === fileReadRevision.current)
        setError('Não foi possível ler o arquivo. Selecione-o novamente ou cole o conteúdo JSON.');
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setFields({});
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      setError('JSON inválido. Confira as aspas, vírgulas e chaves do conteúdo.');
      return;
    }
    if (new TextEncoder().encode(text).length > 1024 * 1024) {
      setError('O conteúdo deve ter no máximo 1 MiB.');
      return;
    }
    setSaving(true);
    try {
      const imported = await api<{ meetingCount: number; actionCount: number }>('/imports', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage(
        `Importação concluída: ${imported.meetingCount} reuniões e ${imported.actionCount} ações importadas.`,
      );
      setText('');
      setFileKey((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError) setFields(e.fields);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeading
        number="04"
        title="Uma nova conversa."
        description="Importe reuniões fictícias e transforme o registro em acompanhamento."
      />
      <div className="import-columns">
        <section aria-labelledby="import-heading">
          <h2 id="import-heading">Importar arquivo JSON</h2>
          <form onSubmit={submit} className="import-form">
            <label>
              Selecionar arquivo
              <input
                key={fileKey}
                type="file"
                accept=".json,application/json"
                onChange={(e) => void read(e.target.files?.[0])}
                aria-describedby="import-help"
              />
            </label>
            <label htmlFor="import-json">
              Conteúdo JSON
              <textarea
                id="import-json"
                rows={13}
                required
                spellCheck={false}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'{ "version": 1, "meetings": […] }'}
                aria-invalid={!!error}
                aria-describedby={error ? 'import-error import-help' : 'import-help'}
              />
            </label>
            <p id="import-help" className="fine">
              Contrato versão 1 · Até 1 MiB e 50 reuniões por lote. O servidor valida todos os
              campos antes de gravar.
            </p>
            {error && (
              <div id="import-error" role="alert" className="notice error">
                <p>{error}</p>
                {Object.keys(fields).length > 0 && (
                  <ul>
                    {Object.entries(fields).map(([field, detail]) => (
                      <li key={field}>
                        <strong>{field}</strong>: {detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <button className="primary" disabled={saving || !text.trim()}>
              {saving ? 'Importando…' : 'Importar reuniões'}
            </button>
            <p role="status" className="save-message">
              {saving ? 'Validando e importando…' : message}
            </p>
            {message && <a href="#/meetings">Consultar reuniões importadas →</a>}
          </form>
        </section>
        <aside className="import-guide">
          <p className="eyebrow">Comece por um exemplo</p>
          <h2>
            Dados de demonstração.
            <br />
            Contexto de verdade.
          </h2>
          <p>
            Baixe um lote com reuniões, transcrições e ações inteiramente sintéticas para explorar o
            fluxo.
          </p>
          <a className="button" href="/demo-meetings.json" download>
            Baixar exemplo JSON ↓
          </a>
          <h3>Como a importação funciona</h3>
          <ol>
            <li>Selecione o arquivo ou cole seu conteúdo.</li>
            <li>Confira o JSON e importe o lote.</li>
            <li>Abra uma reunião para acompanhar as ações.</li>
          </ol>
          <p>
            Identificadores externos não podem se repetir. Um lote duplicado ou inválido é rejeitado
            por inteiro: nenhuma reunião é gravada parcialmente.
          </p>
          <p className="fine">
            Temas e ações vêm do arquivo. Não há extração por IA ou transcrição de áudio.
          </p>
        </aside>
      </div>
    </>
  );
}
