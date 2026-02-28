export interface IpcMessage {
  id: string;
  type: 'request' | 'response' | 'notification';
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}
