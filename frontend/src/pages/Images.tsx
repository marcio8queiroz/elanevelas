import { useEffect, useRef, useState } from 'react';
import { api, ApiError, message } from '../api/client';
import { useMutation } from '../api/hooks';
import type { Category, Picture } from '../api/types';
import { Feedback, Field, Loading } from '../components/ui';
import type { Kind } from './Catalog';
export function Images({
  kind,
  id,
  onDirty,
  onBusy,
}: {
  kind: Kind;
  id: string;
  onDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
}) {
  const product = kind === 'products';
  const base = `/${kind}/${id}/${product ? 'images' : 'image'}`;
  const [images, setImages] = useState<Picture[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [alt, setAlt] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const mutation = useMutation();
  const alive = useRef(true);
  async function reload(signal?: AbortSignal) {
    setLoading(true);
    setLoadError('');
    try {
      const response = product
        ? await api.request<Picture[]>(base, { signal })
        : await api.request<Category>(`/categories/${id}`, { signal });
      if (alive.current && !signal?.aborted)
        setImages(
          product
            ? (response.data as Picture[])
            : (response.data as Category).image?.url
              ? [(response.data as Category).image!]
              : [],
        );
    } catch (e) {
      if (alive.current && !signal?.aborted) setLoadError(message(e));
    } finally {
      if (alive.current && !signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void reload(controller.signal);
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [base]);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    onDirty(!!file || !!alt || Object.keys(drafts).length > 0);
  }, [file, alt, drafts, onDirty]);
  useEffect(() => {
    onBusy(mutation.busy);
  }, [mutation.busy, onBusy]);
  async function action(work: () => Promise<void>) {
    setConflict('');
    await mutation.run(work, async (e) => {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(
          /migra/i.test(e.message)
            ? 'Imagens antigas: solicite a migração ao operador do servidor. O painel não executa migrações.'
            : /limite/i.test(e.message)
              ? 'Limite atingido: remova uma imagem antes de enviar outra.'
              : 'Alteração concorrente: o estado foi recarregado. Revise as imagens antes de repetir sua ação.',
        );
        await reload();
      }
    });
  }
  const legacy = images.some((image) => !image.id);
  return (
    <section className="panel image-panel">
      <div className="section-title">
        <div>
          <h2>{product ? 'Imagens do produto' : 'Imagem da categoria'}</h2>
          <p>
            JPEG, PNG ou WebP estático · até 5 MiB ·{' '}
            {product ? 'máximo de 20 imagens' : 'uma imagem'}
          </p>
        </div>
      </div>
      <p className="hint">
        Até 8192 px por dimensão e 16 milhões de pixels. Remover ou substituir desvincula a imagem
        do catálogo; o arquivo é mantido no armazenamento.
      </p>
      <Feedback error={mutation.error || loadError} success={mutation.success} />
      {conflict && (
        <p role="alert" className="notice">
          {conflict}
        </p>
      )}
      {legacy && (
        <p className="notice">
          Imagens antigas precisam de migração pelo operador do servidor antes de serem gerenciadas.
        </p>
      )}
      {loadError && <button onClick={() => void reload()}>Recarregar imagens</button>}
      {loading && <Loading />}
      <div className="image-grid">
        {images.map((image) => (
          <article key={image.id || image.url} className="image-card">
            <img src={image.url} alt={image.alt || ''} />
            {image.isMain && <span className="badge paid">Principal</span>}
            {product && image.id ? (
              <>
                <Field label="Texto alternativo">
                  {(id) => (
                    <input
                      id={id}
                      maxLength={200}
                      disabled={mutation.busy || legacy || loading || !!loadError}
                      value={drafts[image.id!] ?? image.alt ?? ''}
                      onChange={(e) => setDrafts({ ...drafts, [image.id!]: e.target.value })}
                    />
                  )}
                </Field>
                <div className="actions">
                  <button
                    disabled={
                      mutation.busy ||
                      legacy ||
                      loading ||
                      !!loadError ||
                      drafts[image.id] === undefined
                    }
                    onClick={() =>
                      void action(async () => {
                        const response = await api.mutate<Picture[]>(
                          `${base}/${image.id}`,
                          'PATCH',
                          { alt: drafts[image.id!] },
                        );
                        setImages(response.data);
                        setDrafts((current) => {
                          const next = { ...current };
                          delete next[image.id!];
                          return next;
                        });
                      })
                    }
                  >
                    Salvar alt
                  </button>
                  <button
                    disabled={mutation.busy || legacy || loading || !!loadError || image.isMain}
                    onClick={() =>
                      void action(async () => {
                        setImages(
                          (
                            await api.mutate<Picture[]>(`${base}/${image.id}`, 'PATCH', {
                              isMain: true,
                            })
                          ).data,
                        );
                      })
                    }
                  >
                    Tornar principal
                  </button>
                </div>
                <div className="actions">
                  {([-1, 1] as const).map((direction) => (
                    <button
                      key={direction}
                      aria-label={`${direction < 0 ? 'Mover antes' : 'Mover depois'}: ${image.alt || image.id}`}
                      disabled={
                        mutation.busy ||
                        legacy ||
                        loading ||
                        !!loadError ||
                        images.findIndex((i) => i.id === image.id) + direction < 0 ||
                        images.findIndex((i) => i.id === image.id) + direction >= images.length
                      }
                      onClick={() =>
                        void action(async () => {
                          const ids = images.map((i) => i.id!);
                          const position = ids.indexOf(image.id!);
                          [ids[position], ids[position + direction]] = [
                            ids[position + direction],
                            ids[position],
                          ];
                          setImages(
                            (
                              await api.mutate<Picture[]>(`${base}/order`, 'PATCH', {
                                imageIds: ids,
                              })
                            ).data,
                          );
                        })
                      }
                    >
                      {direction < 0 ? '← Antes' : 'Depois →'}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p>{image.alt || 'Sem texto alternativo'}</p>
            )}
            <button
              className="danger"
              disabled={mutation.busy || legacy || loading || !!loadError}
              onClick={() => {
                if (
                  window.confirm(
                    'Remover esta imagem do catálogo? O arquivo continuará retido no armazenamento.',
                  )
                )
                  void action(async () => {
                    await api.mutate(product ? `${base}/${image.id}` : base, 'DELETE');
                    setDrafts((current) => {
                      const next = { ...current };
                      if (image.id) delete next[image.id];
                      return next;
                    });
                    await reload();
                  });
              }}
            >
              Remover imagem
            </button>
          </article>
        ))}
      </div>
      {!loading && !images.length && !loadError && (
        <p className="empty">Nenhuma imagem adicionada.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          void action(async () => {
            const body = new FormData();
            body.append('file', file);
            body.append('alt', alt);
            const response = await api.mutate<Picture[] | Picture>(
              base,
              product ? 'POST' : 'PUT',
              body,
            );
            setImages(product ? (response.data as Picture[]) : [response.data as Picture]);
            setFile(undefined);
            setAlt('');
            if (input.current) input.current.value = '';
          });
        }}
      >
        <fieldset
          disabled={
            mutation.busy || legacy || loading || !!loadError || (product && images.length >= 20)
          }
        >
          <h3>{product ? 'Adicionar imagem' : 'Enviar ou substituir imagem'}</h3>
          <Field label="Arquivo de imagem">
            {(id) => (
              <input
                id={id}
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const candidate = e.target.files?.[0];
                  mutation.setError('');
                  if (
                    candidate &&
                    (!['image/jpeg', 'image/png', 'image/webp'].includes(candidate.type) ||
                      candidate.size > 5 * 1024 * 1024)
                  ) {
                    mutation.setError('Selecione JPEG, PNG ou WebP de até 5 MiB.');
                    e.target.value = '';
                    setFile(undefined);
                    return;
                  }
                  setFile(candidate);
                }}
              />
            )}
          </Field>
          {preview && <img className="preview" src={preview} alt="Prévia do arquivo selecionado" />}
          <Field label="Texto alternativo da nova imagem">
            {(id) => (
              <input id={id} maxLength={200} value={alt} onChange={(e) => setAlt(e.target.value)} />
            )}
          </Field>
          <button className="primary" disabled={!file}>
            {mutation.busy ? 'Enviando…' : product ? 'Enviar imagem' : 'Confirmar substituição'}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
