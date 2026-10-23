import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  api,
  statusLabels,
  meetingDate,
  dateLabel,
  type Summary,
  type Page,
  type Meeting,
  type Status,
} from './api';
import { Actions, ImportPage, MeetingDetail, Meetings } from './Pages';

export function useApi<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError('');
    api<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, reload: () => setRevision((x) => x + 1) };
}
export function ApiState({
  error,
  reload,
  children,
}: {
  error: string;
  reload: () => void;
  children?: ReactNode;
}) {
  return error ? (
    <div className="notice error" role="alert">
      <p>{error}</p>
      <button onClick={reload}>Tentar novamente</button>
    </div>
  ) : (
    children || (
      <p role="status" className="loading">
        Carregando dados…
      </p>
    )
  );
}
export function MeetingRows({ items }: { items: Meeting[] }) {
  return items.length ? (
    <ol className="meeting-list">
      {items.map((meeting, index) => (
        <li key={meeting.id}>
          <span className="row-number" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="meeting-body">
            <p className="eyebrow">
              {meetingDate(meeting.startedAt)}{' '}
              <span>· {meeting.participants.length} participantes</span>
            </p>
            <a className="meeting-title" href={`#/meetings/${meeting.id}`}>
              {meeting.title}
              <span aria-hidden="true"> ↗</span>
            </a>
            <p className="muted">{meeting.topics.join(' · ')}</p>
          </div>
          <span className="row-meta">{meeting.actionCount} ações</span>
        </li>
      ))}
    </ol>
  ) : (
    <Empty text="Nenhuma reunião encontrada." />
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <p>{text}</p>
      <p className="muted">Importe um exemplo ou ajuste os filtros para continuar.</p>
      <a href="#/import">Ir para importação →</a>
    </div>
  );
}
function PageContent({ route }: { route: string }) {
  const [path, query = ''] = route.split('?');
  const params = new URLSearchParams(query);
  if (path === '/meetings') return <Meetings />;
  if (path.startsWith('/meetings/'))
    return (
      <MeetingDetail
        id={decodeURIComponent(path.slice('/meetings/'.length))}
        segment={params.get('segment')}
      />
    );
  if (path === '/actions')
    return <Actions key={route} initialOverdue={params.get('overdue') === 'true'} />;
  if (path === '/import') return <ImportPage />;
  return (
    <>
      <h1>Página não encontrada.</h1>
      <p>
        <a href="#/">Voltar à visão geral →</a>
      </p>
    </>
  );
}
function Overview() {
  const summary = useApi<Summary>('/summary');
  const meetings = useApi<Page<Meeting>>('/meetings?page=1&pageSize=4');
  const data = summary.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Caderno de trabalho / 01</p>
          <h1>Do encontro à ação.</h1>
          <p className="lead">
            Uma visão clara do que foi conversado.
            <br />E do que vem a seguir.
          </p>
        </div>
        <a className="button primary" href="#/import">
          Importar reuniões <span aria-hidden="true">↗</span>
        </a>
      </div>
      <ApiState error={summary.error} reload={summary.reload}>
        {data && (
          <>
            <div className="period">
              <span>Panorama de todas as reuniões importadas</span>
              <span>Referência: {dateLabel(data.referenceDate)} · São Paulo</span>
            </div>
            <dl className="metrics">
              <div>
                <dt>Reuniões registradas</dt>
                <dd>{String(data.meetingCount).padStart(2, '0')}</dd>
              </div>
              <div>
                <dt>Ações abertas</dt>
                <dd>
                  {String(data.openCount).padStart(2, '0')}
                  <a href="#/actions" aria-label="Consultar todas as ações">
                    ↗
                  </a>
                </dd>
              </div>
              <div className="metric-overdue">
                <dt>Ações atrasadas</dt>
                <dd>
                  {String(data.overdueCount).padStart(2, '0')}
                  <a href="#/actions?overdue=true" aria-label="Consultar ações atrasadas">
                    ↗
                  </a>
                </dd>
              </div>
              <div>
                <dt>Ações concluídas</dt>
                <dd>{String(data.byStatus.done).padStart(2, '0')}</dd>
              </div>
            </dl>
            <div className="overview-columns">
              <section aria-labelledby="rhythm">
                <div className="section-heading">
                  <h2 id="rhythm">Ritmo das ações</h2>
                  <span className="muted">{data.actionCount} no total</span>
                </div>
                <div className="bars" aria-hidden="true">
                  {(Object.keys(statusLabels) as Status[]).map((status) => (
                    <div className={`bar-row ${status}`} key={status}>
                      <span>{statusLabels[status]}</span>
                      <div className="bar-track">
                        <div
                          style={{
                            width: `${(data.byStatus[status] / Math.max(data.actionCount, 1)) * 100}%`,
                          }}
                        />
                      </div>
                      <strong>{data.byStatus[status]}</strong>
                    </div>
                  ))}
                </div>
                <table className="status-table">
                  <caption>Contagem de ações por status</caption>
                  <thead>
                    <tr>
                      <th scope="col">Status</th>
                      <th scope="col">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(statusLabels) as Status[]).map((status) => (
                      <tr key={status}>
                        <th scope="row">{statusLabels[status]}</th>
                        <td>{data.byStatus[status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="fine">
                  Abertas = pendentes + em andamento. Atrasadas = prazo anterior à referência,
                  exceto concluídas.
                </p>
              </section>
              <aside className="editorial-note">
                <p className="eyebrow">Da conversa ao próximo passo</p>
                <h2>
                  O contexto também
                  <br />
                  faz parte da entrega.
                </h2>
                <p>
                  Cada ação pode guardar o trecho da conversa que lhe deu origem. Volte à
                  transcrição para retomar o fio.
                </p>
                <a href="#/actions">Acompanhar ações →</a>
              </aside>
            </div>
          </>
        )}
      </ApiState>
      <section className="latest">
        <div className="section-heading">
          <h2>Últimas reuniões</h2>
          <a href="#/meetings">Ver todas →</a>
        </div>
        <ApiState error={meetings.error} reload={meetings.reload}>
          {meetings.data && <MeetingRows items={meetings.data.items} />}
        </ApiState>
      </section>
    </>
  );
}
export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/');
  const navigationPending = useRef(false);
  useEffect(() => {
    const update = () => {
      navigationPending.current = true;
      setRoute(location.hash.slice(1) || '/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const path = route.split('?')[0];
  useEffect(() => {
    const title =
      path === '/'
        ? 'Visão geral'
        : path === '/meetings'
          ? 'Reuniões'
          : path.startsWith('/meetings/')
            ? 'Detalhe da reunião'
            : path === '/actions'
              ? 'Ações'
              : path === '/import'
                ? 'Importação'
                : 'Página não encontrada';
    document.title = `${title} · Pauta`;
    // The transcript row owns focus when a source segment is requested.
    if (navigationPending.current && !new URLSearchParams(route.split('?')[1]).has('segment')) {
      document.getElementById('main')?.focus();
    }
    navigationPending.current = false;
  }, [path, route]);
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Pular para o conteúdo
      </a>
      <div className="shell">
        <header className="masthead">
          <a href="#/" className="brand" aria-label="Pauta, visão geral">
            Pauta<span className="brand-dot">.</span>
          </a>
          <p className="tagline">Reuniões que viram próximos passos.</p>
          <span className="demo-label">
            <span aria-hidden="true" />
            Demonstração · dados sintéticos
          </span>
        </header>
        <nav className="main-nav" aria-label="Navegação principal">
          {[
            ['/', 'Visão geral'],
            ['/meetings', 'Reuniões'],
            ['/actions', 'Ações'],
            ['/import', 'Importação'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={`#${href}`}
              aria-current={
                (href === '/' ? path === '/' : path.startsWith(href)) ? 'page' : undefined
              }
            >
              {label}
            </a>
          ))}
          <span className="nav-note">MEETING INSIGHTS</span>
        </nav>
        <main id="main" tabIndex={-1}>
          {path === '/' ? <Overview /> : <PageContent route={route} />}
        </main>
        <footer>
          <span>Pauta — um registro do que vem a seguir.</span>
          <span>Portfólio · Dados inteiramente sintéticos</span>
        </footer>
      </div>
    </>
  );
}
