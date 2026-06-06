const { useState, useEffect, useCallback } = React;

// ─────────────────────────────────────────────
// PARSER: Markdown → noticias estructuradas
// Secciones: **TIKR** / **Seeking Alpha** (bold)
// Bullets:   - TICKER — texto | Relevancia: alta/media/baja
//              Detalle: preview de 2-3 frases
//            📄 Resumen: cuerpo expandible completo
//            🔗 Link: URL externa
// ─────────────────────────────────────────────
function parseMarkdown(mdText, filename) {
  console.log('RAW MD:', mdText.substring(0, 500));
  console.log('TIKR match:', mdText.match(/\*\*TIKR\*\*/));
  console.log('bullets:', mdText.match(/^- .+/gm));

  const fecha = filename.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || new Date().toISOString().slice(0, 10);
  const noticias = [];
  const relevanciaMap = { alta: 5, media: 3, baja: 1 };

  const BULLET = new RegExp('^- ([A-Z0-9.]+) — (.+?) \\| Relevancia: (alta|media|baja)', 'i');

  const parseSect = (bloque, fuente) => {
    if (!bloque) return;
    let current = null;

    bloque.split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) return;

      if (current) {
        // Detalle: preview corto (2-3 frases)
        if (/^Detalle:\s*/i.test(line)) {
          current.detalle = line.replace(/^Detalle:\s*/i, '').trim();
          return;
        }
        // 📄 Resumen: cuerpo expandible completo
        if (line.startsWith('📄')) {
          current.cuerpo = line.replace(/^📄\s*Resumen:\s*/i, '').trim() || current.cuerpo;
          return;
        }
        // 🔗 Link: URL externa
        if (line.startsWith('🔗')) {
          current.link = line.replace(/^🔗\s*Link:\s*/i, '').trim();
          return;
        }
      }

      const m = line.match(BULLET);
      if (m) {
        if (current) noticias.push(current);
        const ticker = m[1];
        const titulo = m[2].trim();
        current = {
          id:      `${fuente}-${ticker}-${fecha}`,
          fuente,  ticker,  empresa: titulo,
          fecha,   resumen: titulo,  cuerpo: titulo,
          detalle: null,   link: null,
          relevancia: relevanciaMap[m[3].toLowerCase()] || 3
        };
      }
    });

    if (current) noticias.push(current);
  };

  const tikrBloque = mdText.match(/\*\*TIKR\*\*[^\n]*\n([\s\S]*?)(?=\*\*Seeking Alpha\*\*|\*\*TIKR\*\*|$)/i);
  const saBloque   = mdText.match(/\*\*Seeking Alpha\*\*[^\n]*\n([\s\S]*?)(?=\*\*TIKR\*\*|\*\*Seeking Alpha\*\*|$)/i);

  parseSect(tikrBloque?.[1], 'TIKR');
  parseSect(saBloque?.[1],   'SeekingAlpha');

  return noticias;
}

// ─────────────────────────────────────────────
// STORAGE helpers
// ─────────────────────────────────────────────
const KEYS = { noticias: 'pdi_noticias', patrones: 'pdi_patrones', sync: 'pdi_last_sync' };

function limpiarNoticias(noticias) {
  const limite = new Date();
  limite.setDate(limite.getDate() - 7);
  const cutoff = limite.toISOString().slice(0,10);
  return noticias.filter(n => n.fecha >= cutoff);
}

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}

function saveLocal(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ─────────────────────────────────────────────
// SVG CHARTS — sin librerías externas
// ─────────────────────────────────────────────
const COLORS_CHART = ['#c9a84c','#5b9cf6','#3ddc84','#ff5c5c','#9b72f5','#ff9f43'];

function SVGBarChart({ data, height = 140 }) {
  const [hovered, setHovered] = useState(null);
  if (!data || data.length === 0) return null;

  const W = 400, H = height;
  const mt = 8, mr = 8, mb = 28, ml = 26;
  const cW = W - ml - mr;
  const cH = H - mt - mb;
  const baseY = mt + cH;

  const maxVal = Math.max(1, ...data.map(d => (d.TIKR || 0) + (d.SA || 0)));
  const barSlot = cW / data.length;
  const barW = Math.min(barSlot * 0.65, 28);
  const yTicks = [0, Math.ceil(maxVal / 2), Math.ceil(maxVal)];

  let tipEl = null;
  if (hovered) {
    const tx = Math.min(Math.max(hovered.px, ml + 36), W - mr - 36);
    const ty = Math.max(hovered.py - 6, mt + 40);
    tipEl = (
      <g style={{ pointerEvents: 'none' }}>
        <rect x={tx - 34} y={ty - 40} width={68} height={38}
              fill="var(--bg-card)" stroke="var(--border)" rx="4"/>
        <text x={tx} y={ty - 27} textAnchor="middle" fill="var(--text-muted)" fontSize="8">{hovered.d.fecha}</text>
        <text x={tx} y={ty - 15} textAnchor="middle" fill="#5b9cf6" fontSize="9">TIKR {hovered.d.TIKR}</text>
        <text x={tx} y={ty - 4}  textAnchor="middle" fill="#9b72f5" fontSize="9">SA {hovered.d.SA}</text>
      </g>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height}
         style={{ overflow: 'visible', display: 'block' }}>
      {yTicks.map(v => {
        const y = baseY - (v / maxVal) * cH;
        return (
          <g key={v}>
            <line x1={ml} x2={ml + cW} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5"/>
            <text x={ml - 3} y={y + 3} textAnchor="end" fill="var(--text-muted)" fontSize="8">{v}</text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const tikr  = d.TIKR || 0;
        const sa    = d.SA   || 0;
        const tikrH = (tikr / maxVal) * cH;
        const saH   = (sa   / maxVal) * cH;
        const x     = ml + i * barSlot + (barSlot - barW) / 2;
        return (
          <g key={i}
             onMouseEnter={() => setHovered({ d, px: x + barW / 2, py: baseY - tikrH - saH })}
             onMouseLeave={() => setHovered(null)}>
            {tikrH > 0 && <rect x={x} y={baseY - tikrH} width={barW} height={tikrH} fill="#5b9cf6" rx="1"/>}
            {saH   > 0 && <rect x={x} y={baseY - tikrH - saH} width={barW} height={saH} fill="#9b72f5" rx="2"/>}
            <rect x={x} y={mt} width={barW} height={cH} fill="transparent"/>
            <text x={x + barW / 2} y={H - 4} textAnchor="middle" fill="var(--text-muted)" fontSize="8">{d.fecha}</text>
          </g>
        );
      })}
      {tipEl}
    </svg>
  );
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutPath(cx, cy, innerR, outerR, startAngle, endAngle) {
  const p1 = polarToCartesian(cx, cy, outerR, startAngle);
  const p2 = polarToCartesian(cx, cy, outerR, endAngle);
  const p3 = polarToCartesian(cx, cy, innerR, endAngle);
  const p4 = polarToCartesian(cx, cy, innerR, startAngle);
  const large = (endAngle - startAngle > 180) ? 1 : 0;
  return `M${p1.x},${p1.y} A${outerR},${outerR} 0 ${large} 1 ${p2.x},${p2.y} L${p3.x},${p3.y} A${innerR},${innerR} 0 ${large} 0 ${p4.x},${p4.y}Z`;
}

function SVGPieChart({ data, height = 160 }) {
  const [hovered, setHovered] = useState(null);
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const W = 300, H = height;
  const cx = 72, cy = H / 2;
  const outerR = 54, innerR = 26, padAngle = 2;

  let angle = 0;
  const sectors = data.map((d, i) => {
    const sweep = Math.max(0, (d.value / total) * 360 - padAngle);
    const s = { ...d, start: angle, end: angle + sweep, color: COLORS_CHART[i % COLORS_CHART.length] };
    angle += sweep + padAngle;
    return s;
  });

  const legendX = cx + outerR + 16;
  const legendStartY = H / 2 - (sectors.length * 15) / 2 + 6;

  let tipEl = null;
  if (hovered) {
    const mid = (hovered.start + hovered.end) / 2;
    const tp = polarToCartesian(cx, cy, outerR + 18, mid);
    const tx = Math.min(Math.max(tp.x, 38), W - 38);
    const ty = Math.min(Math.max(tp.y, 18), H - 10);
    tipEl = (
      <g style={{ pointerEvents: 'none' }}>
        <rect x={tx - 38} y={ty - 22} width={76} height={20} fill="var(--bg-card)" stroke="var(--border)" rx="4"/>
        <text x={tx} y={ty - 8} textAnchor="middle" fill={hovered.color} fontSize="10">{hovered.name}: {hovered.value}</text>
      </g>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height}
         style={{ overflow: 'visible', display: 'block' }}>
      {sectors.map((s, i) => (
        <path key={i} d={donutPath(cx, cy, innerR, outerR, s.start, s.end)}
              fill={s.color} stroke="var(--bg-card)" strokeWidth="1.5"
              style={{ cursor: 'default' }}
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(null)}/>
      ))}
      {sectors.map((s, i) => (
        <g key={i} transform={`translate(${legendX}, ${legendStartY + i * 15})`}>
          <rect x={0} y={-6} width={8} height={8} fill={s.color} rx="1"/>
          <text x={12} y={2} fill="var(--text-secondary)" fontSize="10">
            {s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name}
          </text>
        </g>
      ))}
      {tipEl}
    </svg>
  );
}

// ─────────────────────────────────────────────
// Componentes auxiliares
// ─────────────────────────────────────────────
function RelevanceDots({ nivel }) {
  return (
    <div className="news-relevance">
      {[1,2,3,4,5].map(i => (
        <div key={i} className={`relevance-dot ${i <= nivel ? 'filled' : ''}`}/>
      ))}
    </div>
  );
}

function NewsCard({ noticia, style }) {
  const [expanded, setExpanded] = useState(false);
  const cls = noticia.fuente === 'TIKR' ? 'tikr' : 'sa';

  // Collapsed preview: Detalle > primeras 2 líneas del cuerpo > título
  const preview = noticia.detalle
    || noticia.cuerpo.split('\n').filter(Boolean).slice(0, 2).join(' ')
    || noticia.empresa;

  return (
    <div className={`news-card ${cls} ${expanded ? 'expanded' : ''}`}
         style={style} onClick={() => setExpanded(e => !e)}>
      <div className="news-header">
        {noticia.ticker !== '—' && <span className="news-ticker">{noticia.ticker}</span>}
        <span className="news-date">{noticia.fecha}</span>
      </div>
      {noticia.empresa && noticia.empresa !== noticia.ticker && (
        <div className="news-title">{noticia.empresa}</div>
      )}
      <div className={`news-summary ${expanded ? 'expanded' : ''}`}>
        {expanded ? noticia.cuerpo : preview}
      </div>
      {expanded && noticia.link && (
        <a href={noticia.link}
           target="_blank"
           rel="noopener noreferrer"
           onClick={e => e.stopPropagation()}
           style={{
             display: 'inline-block',
             marginTop: 10,
             padding: '6px 14px',
             background: 'var(--accent-gold-dim)',
             color: 'var(--accent-gold)',
             fontFamily: 'var(--font-mono)',
             fontSize: 11,
             borderRadius: 6,
             textDecoration: 'none',
             border: '1px solid var(--accent-gold-dim)'
           }}>
          Leer artículo →
        </a>
      )}
      <RelevanceDots nivel={noticia.relevancia} />
    </div>
  );
}

function EmptyState({ fetchStatus }) {
  if (fetchStatus === 'error') {
    return (
      <div className="empty-state">
        <div className="empty-icon">📡</div>
        <div className="empty-title">Sin datos</div>
        <div className="empty-sub">Conecta a internet para cargar el periódico</div>
      </div>
    );
  }
  if (fetchStatus === 'loading') {
    return (
      <div className="empty-state">
        <div className="empty-icon">⟳</div>
        <div className="empty-title">Cargando...</div>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <div className="empty-icon">📰</div>
      <div className="empty-title">Sin noticias disponibles</div>
      <div className="empty-sub">Pulsa ↻ Actualizar para intentarlo de nuevo</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: PERIÓDICO
// ─────────────────────────────────────────────
function TabPeriodico({ noticias, patronesMeta, fetchStatus }) {
  const [filtroFuente, setFiltroFuente] = useState('all');
  const [filtroOrden, setFiltroOrden] = useState('fecha');
  const [filtroTicker, setFiltroTicker] = useState('');

  const tickers = [...new Set(noticias.map(n => n.ticker))].filter(t => t !== '—');

  let filtradas = [...noticias];
  if (filtroFuente !== 'all') filtradas = filtradas.filter(n => n.fuente === filtroFuente);
  if (filtroTicker) filtradas = filtradas.filter(n => n.ticker === filtroTicker);
  filtradas.sort((a,b) =>
    filtroOrden === 'relevancia' ? b.relevancia - a.relevancia : b.fecha.localeCompare(a.fecha)
  );

  const tikrNews = filtradas.filter(n => n.fuente === 'TIKR').slice(0,7);
  const saNews   = filtradas.filter(n => n.fuente === 'SeekingAlpha').slice(0,7);

  return (
    <div className="content">
      <div className="filter-bar">
        <button className={`filter-chip ${filtroFuente==='all'?'active':''}`}
                onClick={() => setFiltroFuente('all')}>Todas</button>
        <button className={`filter-chip ${filtroFuente==='TIKR'?'active':''}`}
                onClick={() => setFiltroFuente('TIKR')}>TIKR</button>
        <button className={`filter-chip ${filtroFuente==='SeekingAlpha'?'active':''}`}
                onClick={() => setFiltroFuente('SeekingAlpha')}>Seeking Alpha</button>
        <button className={`filter-chip ${filtroOrden==='relevancia'?'active':''}`}
                onClick={() => setFiltroOrden(o => o==='relevancia'?'fecha':'relevancia')}>
          {filtroOrden==='relevancia'?'▼ Relevancia':'↕ Relevancia'}
        </button>
      </div>

      {tickers.length > 0 && (
        <div className="filter-bar" style={{marginTop: -6}}>
          <button className={`filter-chip ${filtroTicker===''?'active':''}`}
                  onClick={() => setFiltroTicker('')}>Todo</button>
          {tickers.slice(0,6).map(t => (
            <button key={t} className={`filter-chip ${filtroTicker===t?'active':''}`}
                    onClick={() => setFiltroTicker(f => f===t?'':t)}>{t}</button>
          ))}
        </div>
      )}

      {noticias.length === 0 ? (
        <EmptyState fetchStatus={fetchStatus}/>
      ) : (
        <>
          {(filtroFuente === 'all' || filtroFuente === 'TIKR') && (
            <div className="news-section">
              <div className="source-label tikr">TIKR · {tikrNews.length}</div>
              {tikrNews.length === 0
                ? <div style={{color:'var(--text-muted)',fontSize:12,padding:'8px 0'}}>Sin noticias de TIKR en el período</div>
                : tikrNews.map((n,i) => <NewsCard key={n.id} noticia={n} style={{animationDelay:`${i*30}ms`}}/>)
              }
            </div>
          )}
          {(filtroFuente === 'all' || filtroFuente === 'SeekingAlpha') && (
            <div className="news-section">
              <div className="source-label sa">Seeking Alpha · {saNews.length}</div>
              {saNews.length === 0
                ? <div style={{color:'var(--text-muted)',fontSize:12,padding:'8px 0'}}>Sin noticias de Seeking Alpha en el período</div>
                : saNews.map((n,i) => <NewsCard key={n.id} noticia={n} style={{animationDelay:`${i*30}ms`}}/>)
              }
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: PATRONES
// ─────────────────────────────────────────────
function TabPatrones({ patrones, resumen, historial, meta }) {
  const [ordenConf, setOrdenConf] = useState(true);

  const confOrder = { alta: 3, media: 2, baja: 1 };
  const sorted = [...patrones].sort((a,b) =>
    ordenConf ? (confOrder[b.confianza]||0) - (confOrder[a.confianza]||0) : 0
  );

  const historialData = (historial || []).slice(-14).map(h => ({
    fecha: h.fecha.slice(5),
    TIKR: h.fuentes?.TIKR || 0,
    SA: h.fuentes?.SeekingAlpha || 0,
    total: h.noticias || 0
  }));

  const distribSectorial = Object.entries(
    patrones.reduce((acc, p) => {
      const s = p.sector || 'Otros';
      acc[s] = (acc[s]||0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const tendencias = {
    alcista: patrones.filter(p => p.tendencia === 'alcista').length,
    bajista: patrones.filter(p => p.tendencia === 'bajista').length,
    neutral: patrones.filter(p => p.tendencia === 'neutral').length,
  };

  if (patrones.length === 0) {
    return (
      <div className="content">
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-title">Sin patrones detectados</div>
          <div className="empty-sub">Los patrones se acumulan a medida que llegan noticias durante varios días</div>
          {meta && (
            <div className="empty-note">
              <strong>Estado:</strong> {meta.estado}<br/>
              <strong>Cobertura:</strong> {meta.cobertura}<br/>
              <strong>Archivos:</strong> {meta.archivosAnalizados}/{meta.archivosPeriodoEsperado}<br/><br/>
              {meta.nota}
            </div>
          )}
        </div>

        {historialData.length > 0 && (
          <div className="chart-container" style={{marginTop:16}}>
            <div className="chart-title">Frecuencia de noticias · {historialData.length}d</div>
            <SVGBarChart data={historialData} height={140}/>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="content">
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--accent-gold)'}}>{patrones.length}</div>
          <div className="stat-label">Patrones</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--accent-green)'}}>{resumen?.porConfianza?.alta || 0}</div>
          <div className="stat-label">Alta conf.</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--accent-red)'}}>{tendencias.bajista}</div>
          <div className="stat-label">Bajistas</div>
        </div>
      </div>

      <div className="chart-container">
        <div className="chart-title">Distribución de tendencias</div>
        <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'center',padding:'8px 0'}}>
          <div className="tendencia-badge tend-alcista">▲ {tendencias.alcista} alcista{tendencias.alcista!==1?'s':''}</div>
          <div className="tendencia-badge tend-neutral">● {tendencias.neutral} neutral{tendencias.neutral!==1?'es':''}</div>
          <div className="tendencia-badge tend-bajista">▼ {tendencias.bajista} bajista{tendencias.bajista!==1?'s':''}</div>
        </div>
        {distribSectorial.length > 0 && <SVGPieChart data={distribSectorial} height={130}/>}
      </div>

      {historialData.length > 1 && (
        <div className="chart-container">
          <div className="chart-title">Frecuencia de noticias · rolling</div>
          <SVGBarChart data={historialData} height={120}/>
        </div>
      )}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div className="section-title">Patrones detectados</div>
        <button className="filter-chip active" onClick={() => setOrdenConf(o=>!o)}>
          {ordenConf ? '▼ Confianza' : '↕ Orden'}
        </button>
      </div>

      {sorted.map((p, i) => (
        <div className="pattern-card" key={p.id || i} style={{animationDelay:`${i*25}ms`}}>
          <div className="pattern-header">
            <span className={`pattern-tipo tipo-${p.tipo?.toLowerCase() || 'tendencia'}`}>
              {p.tipo || 'Tendencia'}
            </span>
            <span className={`pattern-confianza conf-${p.confianza}`}>
              {p.confianza === 'alta' ? '●●●' : p.confianza === 'media' ? '●●○' : '●○○'} {p.confianza}
            </span>
          </div>
          <div className="pattern-empresa">{p.empresa}</div>
          {p.ticker && <div className="pattern-ticker-badge">{p.ticker}</div>}
          <div className="pattern-desc">{p.descripcion}</div>
          {p.tags?.length > 0 && (
            <div className="pattern-tags">
              {p.tags.map(t => <span key={t} className="tag">{t}</span>)}
            </div>
          )}
          <div className="pattern-footer">
            <span className={`tendencia-badge tend-${p.tendencia || 'neutral'}`}>
              {p.tendencia === 'alcista' ? '▲' : p.tendencia === 'bajista' ? '▼' : '●'} {p.tendencia || 'neutral'}
            </span>
            <span className="pattern-freq">×{p.frecuencia || 1} apariciones</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// APP PRINCIPAL
// ─────────────────────────────────────────────
function App() {
  const [tab,          setTab]          = useState('periodico');
  const [noticias,     setNoticias]     = useState([]);
  const [patrones,     setPatrones]     = useState([]);
  const [patronesMeta, setPatronesMeta] = useState(null);
  const [resumenStats, setResumenStats] = useState(null);
  const [historial,    setHistorial]    = useState([]);
  const [lastFetch,    setLastFetch]    = useState(null);
  // 'idle' | 'loading' | 'done' | 'error'
  const [fetchStatus,  setFetchStatus]  = useState('idle');

  const fetchData = useCallback(async () => {
    setFetchStatus('loading');
    try {
      // 1. Leer índice
      const idxRes = await fetch('./data/index.json');
      if (!idxRes.ok) throw new Error('index.json no disponible');
      const idx = await idxRes.json();

      // 2. Resumen diario MD
      const mdRes = await fetch(`./data/resumen-diario-${idx.ultimo_resumen}.md`);
      if (mdRes.ok) {
        const mdText = await mdRes.text();
        const nuevas = parseMarkdown(mdText, `resumen-diario-${idx.ultimo_resumen}.md`);
        const limpias = limpiarNoticias(nuevas);
        setNoticias(limpias);
        saveLocal(KEYS.noticias, limpias);
      }

      // 3. Patrones acumulados
      const patRes = await fetch('./data/patrones-acumulados.json');
      if (patRes.ok) {
        const patData = await patRes.json();
        setPatrones(patData.patrones || []);
        setPatronesMeta(patData.meta || null);
        setResumenStats(patData.resumenEstadistico || null);
        setHistorial(patData.historial || []);
        saveLocal(KEYS.patrones, patData);
      }

      const now = new Date().toISOString();
      setLastFetch(now);
      saveLocal(KEYS.sync, now);
      setFetchStatus('done');
    } catch {
      setFetchStatus('error');
    }
  }, []);

  // Carga localStorage al instante, luego fetch remoto
  useEffect(() => {
    const cached = limpiarNoticias(loadLocal(KEYS.noticias, []));
    setNoticias(cached);
    const pat = loadLocal(KEYS.patrones, null);
    if (pat) {
      setPatrones(pat.patrones || []);
      setPatronesMeta(pat.meta || null);
      setResumenStats(pat.resumenEstadistico || null);
      setHistorial(pat.historial || []);
    }
    setLastFetch(loadLocal(KEYS.sync, null));
    fetchData();
  }, [fetchData]);

  const today = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
  const lastFetchTime = lastFetch
    ? new Date(lastFetch).toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'})
    : null;

  const statusText =
    fetchStatus === 'loading' ? 'Actualizando...' :
    fetchStatus === 'error'   ? 'Sin conexión (caché)' :
    lastFetchTime             ? `Actualizado ${lastFetchTime}` : '—';

  const statusColor =
    fetchStatus === 'loading' ? 'var(--text-muted)' :
    fetchStatus === 'error'   ? 'var(--accent-gold)' :
    'var(--accent-green)';

  const statusBarText =
    noticias.length > 0
      ? `${noticias.length} noticias · rolling 7d · ${patrones.length} patrones 30d`
      : fetchStatus === 'error'
        ? 'Sin datos — conecta a internet para cargar'
        : fetchStatus === 'loading'
          ? 'Cargando datos...'
          : 'Sin datos disponibles';

  return (
    <div className="shell">
      <div className="header">
        <div className="header-top">
          <div>
            <div className="masthead">Mi Periódico<br/><span>de Inversiones</span></div>
          </div>
          <div className="date-stamp">
            {today}<br/>
            <span style={{color: statusColor}}>{statusText}</span>
          </div>
        </div>

        <button
          className={`sync-btn${fetchStatus === 'loading' ? ' syncing' : fetchStatus === 'done' ? ' synced' : ''}`}
          onClick={fetchData}
          disabled={fetchStatus === 'loading'}>
          {fetchStatus === 'loading' ? '⟳ Actualizando...' : '↻ Actualizar'}
        </button>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab==='periodico'?'active':''}`}
                onClick={() => setTab('periodico')}>
          Periódico
          <span className="tab-count">{noticias.length}</span>
        </button>
        <button className={`tab-btn ${tab==='patrones'?'active':''}`}
                onClick={() => setTab('patrones')}>
          Patrones
          <span className="tab-count">{patrones.length}</span>
        </button>
      </div>

      {tab === 'periodico' ? (
        <TabPeriodico
          noticias={noticias}
          patronesMeta={patronesMeta}
          fetchStatus={fetchStatus}
        />
      ) : (
        <TabPatrones
          patrones={patrones}
          resumen={resumenStats}
          historial={historial}
          meta={patronesMeta}
        />
      )}

      <div className="status-bar">{statusBarText}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Mount + Service Worker
// ─────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  });
}
