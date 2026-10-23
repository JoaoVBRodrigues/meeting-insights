import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { dateLabel } from './api';
const summary = {
  meetingCount: 3,
  actionCount: 9,
  openCount: 6,
  overdueCount: 2,
  byStatus: { pending: 4, in_progress: 2, done: 3 },
  referenceDate: '2026-10-22',
  timeZone: 'America/Sao_Paulo',
};
const list = { items: [], total: 0, page: 1, pageSize: 4 };
beforeEach(() => {
  location.hash = '#/';
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => ({
      ok: true,
      json: async () => (path.includes('summary') ? summary : list),
    })),
  );
});
describe('visão geral', () => {
  it('apresenta indicadores reais e tabela equivalente ao gráfico', async () => {
    render(<App />);
    expect(
      await screen.findByRole('table', { name: 'Contagem de ações por status' }),
    ).toBeInTheDocument();
    expect(screen.getByText('9 no total')).toBeInTheDocument();
    expect(screen.getByText('Demonstração · dados sintéticos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Visão geral' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
  it('permite recuperar falha da API sem recarregar a aplicação', async () => {
    let failed = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path.includes('summary') && failed) throw Error('offline');
        return { ok: true, json: async () => (path.includes('summary') ? summary : list) };
      }),
    );
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar');
    failed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
  });
  it('preserva o dia de calendário de um prazo', () => {
    expect(dateLabel('2026-10-22')).toBe('22/10/2026');
  });
  it('pula a navegação sem alterar a rota atual', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('link', { name: 'Pular para o conteúdo' }));
    expect(screen.getByRole('main')).toHaveFocus();
    expect(location.hash).toBe('#/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Do encontro à ação.');
  });
});
