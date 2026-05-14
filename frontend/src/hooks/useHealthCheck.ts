import { useState, useEffect, useCallback } from 'react';

export type ServiceStatus = 'up' | 'down' | 'checking';

export interface ServiceHealth {
  frontend: ServiceStatus;
  backend: ServiceStatus;
  questionService: ServiceStatus;
}

async function checkService(url: string): Promise<ServiceStatus> {
  try {
    const resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) });
    return resp.ok || resp.status === 404 ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

export function useHealthCheck(intervalMs = 15000) {
  const [health, setHealth] = useState<ServiceHealth>({
    frontend: 'up', // If this code runs, frontend is up
    backend: 'checking',
    questionService: 'checking',
  });

  const check = useCallback(async () => {
    const [backend, questionService] = await Promise.all([
      checkService('/health'),
      checkService('/api/questions/health'),
    ]);
    setHealth({ frontend: 'up', backend, questionService });
  }, []);

  useEffect(() => {
    check();
    const timer = setInterval(check, intervalMs);
    return () => clearInterval(timer);
  }, [check, intervalMs]);

  return health;
}
