import { useCallback, useEffect, useRef, useState } from 'react';
import { api, message } from './client';
import type { Envelope } from './types';
export function useResource<T>(path: string) {
  const [data, setData] = useState<Envelope<T>>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError('');
    setData(undefined);
    api
      .request<T>(path, { signal: controller.signal })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, revision]);
  return { data, error, loading, reload };
}
export function useMutation() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function run(
    action: () => Promise<void>,
    onError?: (error: unknown) => Promise<void> | void,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess('Alterações salvas.');
    } catch (e) {
      setError(message(e));
      await onError?.(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, success, run, setError };
}
