import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionEditor, Actions, ImportPage, MeetingDetail, Meetings } from './Pages';
import type { Action } from './api';
const action: Action = {
  id: 'a1',
  meetingId: 'm1',
  meetingTitle: 'Plano de produto',
  title: 'Documentar decisões',
  owner: 'Lia',
  dueDate: '2026-10-22',
  status: 'pending',
  sourceSegmentId: 's1',
  overdue: false,
};
const list = { items: [], total: 0, page: 1, pageSize: 8 };
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => list })),
  );
});
describe('formulários e navegação', () => {
  it('combina busca e período no servidor', async () => {
    render(<Meetings />);
    await userEvent.type(screen.getByLabelText('Buscar por título'), 'produto');
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-31' } });
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/meetings?page=1&pageSize=8&q=produto&from=2026-10-01&to=2026-10-31',
        expect.any(Object),
      ),
    );
  });
  it('combina filtros por responsável, status e atraso', async () => {
    render(<Actions />);
    await userEvent.type(screen.getByLabelText('Responsável'), 'Lia');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'in_progress');
    await userEvent.click(screen.getByLabelText('Somente atrasadas'));
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/actions?page=1&pageSize=6&owner=Lia&status=in_progress&overdue=true',
        expect.any(Object),
      ),
    );
  });
  it('salva responsável, data de calendário e status e anuncia o resultado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ...action, owner: 'Bia', status: 'done' }),
      })),
    );
    render(<ActionEditor action={action} />);
    const owner = screen.getByLabelText('Responsável');
    await userEvent.clear(owner);
    await userEvent.type(owner, 'Bia');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'done');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ação' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Alterações salvas.');
    expect(fetch).toHaveBeenCalledWith(
      '/api/actions/a1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ owner: 'Bia', dueDate: '2026-10-22', status: 'done' }),
      }),
    );
    expect(screen.getByRole('link', { name: 'Ver trecho de origem →' })).toHaveAttribute(
      'href',
      '#/meetings/m1?segment=s1',
    );
  });
  it('mantém o status salvo ao editar e atualiza o atraso com a resposta do servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ...action,
          dueDate: '2027-01-10',
          status: 'in_progress',
          overdue: false,
        }),
      })),
    );
    const { container } = render(<ActionEditor action={{ ...action, overdue: true }} />);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'in_progress');
    expect(container.querySelector('.badge')).toHaveTextContent('Pendente');
    expect(screen.getByText('Prazo atrasado')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Prazo'), { target: { value: '2027-01-10' } });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ação' }));
    await waitFor(() =>
      expect(container.querySelector('.badge')).toHaveTextContent('Em andamento'),
    );
    expect(screen.queryByText('Prazo atrasado')).not.toBeInTheDocument();
  });
  it('preserva o controle focado durante a paginação e anuncia a página carregada', async () => {
    let resolvePage: (value: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ...list, total: 24 }) })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolvePage = resolve;
            }),
        ),
    );
    render(<Meetings />);
    const next = await screen.findByRole('button', { name: 'Próxima →' });
    next.focus();
    await userEvent.keyboard('{Enter}');
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute('aria-disabled', 'true');
    resolvePage({ ok: true, json: async () => ({ ...list, total: 24, page: 2 }) });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Página 2 de 3'));
    expect(screen.getByRole('button', { name: 'Próxima →' })).toBe(next);
    expect(next).toHaveFocus();
  });
  it('reaplica os filtros após salvar e mantém a confirmação focada quando a ação sai da lista', async () => {
    let saved = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          saved = true;
          return { ok: true, json: async () => ({ ...action, status: 'done' }) };
        }
        return {
          ok: true,
          json: async () => ({
            items: saved ? [] : [action],
            total: saved ? 0 : 1,
            page: 1,
            pageSize: 6,
          }),
        };
      }),
    );
    render(<Actions />);
    await screen.findByText(action.title);
    await userEvent.selectOptions(screen.getAllByLabelText('Status')[0], 'pending');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await screen.findByText(action.title);
    expect(screen.getAllByLabelText('Responsável')[1]).toHaveAttribute('maxlength', '200');
    await userEvent.selectOptions(screen.getAllByLabelText('Status')[1], 'done');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ação' }));
    await screen.findByText('Nenhuma ação encontrada.');
    expect(screen.queryByText(action.title)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/actions?page=1&pageSize=6&status=pending',
      expect.any(Object),
    );
    expect(screen.getByText('Alterações salvas. Os filtros continuam aplicados.')).toHaveFocus();
    expect(screen.getByText(/0 registros/)).toBeInTheDocument();
  });
  it('limpa o conteúdo anterior ao selecionar um arquivo acima do limite', async () => {
    render(<ImportPage />);
    fireEvent.change(screen.getByLabelText('Conteúdo JSON'), {
      target: { value: '{"version":1,"meetings":[]}' },
    });
    const large = new File([new Uint8Array(1024 * 1024 + 1)], 'large.json', {
      type: 'application/json',
    });
    await userEvent.upload(screen.getByLabelText('Selecionar arquivo'), large);
    expect(screen.getByRole('alert')).toHaveTextContent('O arquivo deve ter no máximo 1 MiB.');
    expect(screen.getByLabelText('Conteúdo JSON')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Importar reuniões' })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejeita JSON inválido antes da requisição e associa erro ao campo', async () => {
    render(<ImportPage />);
    await userEvent.type(screen.getByLabelText('Conteúdo JSON'), 'não é JSON');
    await userEvent.click(screen.getByRole('button', { name: 'Importar reuniões' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('JSON inválido');
    expect(screen.getByLabelText('Conteúdo JSON')).toHaveAttribute('aria-invalid', 'true');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('apresenta o campo rejeitado pelo servidor sem perder o conteúdo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Lote inválido',
            fields: { 'meetings.0.title': 'Título obrigatório' },
          },
        }),
      })),
    );
    render(<ImportPage />);
    fireEvent.change(screen.getByLabelText('Conteúdo JSON'), {
      target: { value: '{"version":1,"meetings":[{}]}' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Importar reuniões' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('meetings.0.title');
    expect(screen.getByLabelText('Conteúdo JSON')).toHaveValue('{"version":1,"meetings":[{}]}');
  });
  it('move o foco para o trecho de origem e preserva texto importado sem HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          id: 'm1',
          title: 'Plano',
          startedAt: '2026-10-22T10:00:00-03:00',
          participants: ['Lia'],
          topics: ['Entrega'],
          segments: [{ id: 's1', speaker: 'Lia', at: '00:15', text: '<script>alert(1)</script>' }],
          actions: [],
        }),
      })),
    );
    render(<MeetingDetail id="m1" segment="s1" />);
    const segment = await screen.findByLabelText('Trecho de origem da ação');
    expect(segment).toHaveFocus();
    expect(segment).toHaveTextContent('<script>alert(1)</script>');
    expect(segment.querySelector('script')).toBeNull();
  });
});
