export type Status = 'pending' | 'in_progress' | 'done';
export interface Action {
  id: string;
  meetingId: string;
  meetingTitle: string;
  title: string;
  owner: string;
  dueDate: string | null;
  status: Status;
  sourceSegmentId: string | null;
  overdue: boolean;
}
export interface Meeting {
  id: string;
  externalId: string;
  title: string;
  startedAt: string;
  participants: string[];
  topics: string[];
  actionCount: number;
}
export interface Segment {
  id: string;
  speaker: string;
  at: string;
  text: string;
}
export interface Detail extends Meeting {
  segments: Segment[];
  actions: Action[];
}
export interface Summary {
  meetingCount: number;
  actionCount: number;
  openCount: number;
  overdueCount: number;
  byStatus: Record<Status, number>;
  referenceDate: string;
  timeZone: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export class ApiError extends Error {
  fields: Record<string, string>;
  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.fields = fields;
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('Não foi possível conectar à API. Confira sua conexão e tente novamente.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      body?.error?.message || 'Não foi possível concluir a solicitação.',
      body?.error?.fields,
    );
  return body as T;
}
export const statusLabels: Record<Status, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  done: 'Concluída',
};
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
export const meetingDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(
    new Date(value),
  );
