import { useState, useEffect, CSSProperties } from 'react';
import { SearchEngine } from '@/types/searchEngine';
import { faviconCache } from '@/lib/faviconCache';

interface Props {
  engine: SearchEngine;
  size?: number;
  className?: string;
}

export function SearchEngineIcon({ engine, size = 18, className = '' }: Props) {
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    if (engine.iconType !== 'favicon' || !engine.iconValue) {
      setFaviconUrl(null);
      setFaviconFailed(false);
      return;
    }
    let cancelled = false;
    const probeUrl = engine.urlTemplate.replace('{query}', 'test');
    let host = '';
    try {
      host = new URL(probeUrl).hostname;
    } catch {
      setFaviconFailed(true);
      return;
    }
    const candidateFaviconUrl = `https://${host}/favicon.ico`;
    faviconCache
      .getFavicon(probeUrl, candidateFaviconUrl)
      .then((url) => {
        if (cancelled) return;
        if (!url || url.endsWith('/icon/favicon.png')) {
          setFaviconFailed(true);
          setFaviconUrl(null);
        } else {
          setFaviconUrl(url);
          setFaviconFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFaviconFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [engine.iconType, engine.iconValue, engine.urlTemplate]);

  const style: CSSProperties = {
    width: size,
    height: size,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (engine.iconType === 'fontawesome' && engine.iconValue) {
    return (
      <span style={style} className={className}>
        <i className={`fa-brands ${engine.iconValue}`} style={{ fontSize: size }} />
      </span>
    );
  }

  if (engine.iconType === 'local' && engine.iconValue) {
    return (
      <span style={style} className={className}>
        <img
          src={import.meta.env.BASE_URL + engine.iconValue}
          alt={engine.name}
          style={{ width: size, height: size, objectFit: 'contain' }}
          draggable={false}
        />
      </span>
    );
  }

  if (engine.iconType === 'favicon' && faviconUrl && !faviconFailed) {
    return (
      <span style={style} className={className}>
        <img
          src={faviconUrl}
          alt={engine.name}
          style={{ width: size, height: size, objectFit: 'contain' }}
          onError={() => setFaviconFailed(true)}
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span
      style={{ ...style, fontSize: size }}
      className={className}
      role="img"
      aria-label={engine.name}
    >
      🍅
    </span>
  );
}
