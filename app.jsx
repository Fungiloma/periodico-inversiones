const { useState, useEffect, useCallback, useRef } = React;
const {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} = Recharts;

// ─────────────────────────────────────────────
// PARSER: Markdown → noticias estructuradas
// ─────────────────────────────────────────────
function parseMarkdown(mdText, filename) {
  const fecha = filename.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || new Date().toISOString().slice(0,10);
  const noticias = [];

  // Detectar secciones TIKR y Seeking Alpha
  const secciones = {
    tikr: { regex: /## TIKR.*?\n([\s\S]*?)(?=## Seeking Alpha|## Patrones|$)/i, fuente: 'TIKR' },
    sa:   { regex: /## Seeking Alpha.*?\n([\s\S]*?)(?=## TIKR|## Patrones|$)/i, fuente: 'SeekingAlpha' }
  };

  Object.values(secciones).forEach(({ regex, fuente }) => {
    const match = mdText.match(regex);
    if (!match) return;
    const bloque = match[1];

    // Sin noticias hoy
    if (/sin noticias hoy/i.test(bloque)) return;

    // Parsear subsecciones por ### TICKER — Empresa o ### Empresa
    const items = bloque.split(/\n(?=###\s)/);
    items.forEach(item => {
      const headerMatch = item.match(/###\s+([A-Z0-9.]+)(?:\s*[—–-]\s*(.+))?/);
      if (!headerMatch) return;

      const ticker = headerMatch[1].trim();
      const empresa = headerMatch[2]?.trim() || ticker;
      const cuerpo = item.replace(/###.+\n/, '').trim();
      if (!cuerpo) return;

      // Extraer primer párrafo como resumen, resto como cuerpo completo
      const lineas = cuerpo.split('\n').filter(l => l.trim());
      const resumen = lineas[0] || '';

      // Scoring de relevancia (keywords financieras)
      const keywords = ['earnings','revenue','growth','beat','miss','guidance','buyback',
                        'dividend','acquisition','merger','downgrade','upgrade','target',
                        'ganancias','ingresos','beneficio','compra','fusión','dividendo'];
      const textoLower = cuerpo.toLowerCase();
      const hits = keywords.filter(k => textoLower.includes(k)).length;
      const relevancia = Math.min(5, Math.max(1, hits + (ticker.length <= 5 ? 1 : 0)));

      noticias.push({ id: `${fuente}-${ticker}-${fecha}`, fuente, ticker, empresa, fecha, resumen, cuerpo, relevancia });
    });

    // Si hay texto libre sin headers ###
    if (noticias.filter(n => n.fecha === fecha && n.fuente === fuente).length === 0) {
      const lineas = bloque.split('\n').filter(l => l.trim() && !l.startsWith('>'));
      if (lineas.length > 0 && !/sin noticias/i.test(lineas[0])) {
        noticias.push({
          id: `${fuente}-misc-${fecha}`,
          fuente, ticker: '—', empresa: 'Varios', fecha,
          resumen: lineas[0],
          cuerpo: lineas.join('\n'),
          relevancia: 2
        });
      }
    }
  });

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

  return (
    <div className={`news-card ${cls} ${expanded ? 'expanded' : ''}`}
         style={style}
         onClick={() => setExpanded(e => !e)}>
      <div className="news-header">
        {noticia.ticker !== '—' && <span className="news-ticker">{noticia.ticker}</span>}
        <span className="news-date">{noticia.fecha}</span>
      </div>
      {noticia.empresa && noticia.empresa !== noticia.ticker && (
        <div className="news-title">{noticia.empresa}</div>
      )}
      <div className={`news-summary ${expanded ? 'expanded' : ''}`}>
        {expanded ? noticia.cuerpo : noticia.resumen}
      </div>
      <RelevanceDots nivel={noticia.relevancia} />
    </div>
  );
}

function EmptyNewsPaper({ meta }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">📰</div>
      <div className="empty-title">Sin noticias en caché</div>
      <div className="empty-sub">Sincroniza tus archivos .md diarios para ver las noticias</div>
      {meta && (
        <div className="empty-note">
          <strong>ℹ️ Nota del sistema:</strong><br/>
          {meta.nota || 'Sin datos disponibles.'}<br/><br/>
          <strong>Acción:</strong> {meta.accionRecomendada}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: PERIÓDICO
// ─────────────────────────────────────────────
function TabPeriodico({ noticias, onSyncMd, syncing, syncedMd, patronesMeta }) {
  const [filtroFuente, setFiltroFuente] = useState('all');
  const [filtroOrden, setFiltroOrden] = useState('fecha');
  const [filtroTicker, setFiltroTicker] = useState('');

  const tickers = [...new Set(noticias.map(n => n.ticker))].filter(t => t !== '—');

  let filtradas = [...noticias];
  if (filtroFuente !== 'all') filtradas = filtradas.filter(n => n.fuente === filtroFuente);
  if (filtroTicker) filtradas = filtradas.filter(n => n.ticker === filtroTicker);
  filtradas.sort((a,b) => {
    if (filtroOrden === 'relevancia') return b.relevancia - a.relevancia;
    return b.fecha.localeCompare(a.fecha);
  });

  const tikrNews = filtradas.filter(n => n.fuente === 'TIKR').slice(0,7);
  const saNews   = filtradas.filter(n => n.fuente === 'SeekingAlpha').slice(0,7);

  return (
    <div className="content">
      {/* Filter bar */}
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
        <EmptyNewsPaper meta={patronesMeta} />
      ) : (
        <>
          {/* TIKR section */}
          {(filtroFuente === 'all' || filtroFuente === 'TIKR') && (
            <div className="news-section">
              <div className="source-label tikr">TIKR · {tikrNews.length}</div>
              {tikrNews.length === 0
                ? <div style={{color:'var(--text-muted)',fontSize:12,padding:'8px 0'}}>Sin noticias de TIKR en el período</div>
                : tikrNews.map((n,i) => <NewsCard key={n.id} noticia={n} style={{animationDelay:`${i*30}ms`}}/>)
              }
            </div>
          )}

          {/* Seeking Alpha section */}
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
const COLORS_CHART = ['#c9a84c','#5b9cf6','#3ddc84','#ff5c5c','#9b72f5','#ff9f43'];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',padding:'8px 12px',borderRadius:6,fontFamily:'var(--font-mono)',fontSize:11}}>
      <div style={{color:'var(--text-muted)',marginBottom:4}}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{color:p.color}}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</div>
      ))}
    </div>
  );
}

function TabPatrones({ patrones, resumen, historial, meta }) {
  const [ordenConf, setOrdenConf] = useState(true);

  const confOrder = { alta: 3, media: 2, baja: 1 };
  const sorted = [...patrones].sort((a,b) =>
    ordenConf ? (confOrder[b.confianza]||0) - (confOrder[a.confianza]||0) : 0
  );

  // Datos para gráficos
  const historialData = (historial || []).slice(-14).map(h => ({
    fecha: h.fecha.slice(5), // MM-DD
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

        {/* Historial aunque no haya patrones */}
        {historialData.length > 0 && (
          <div className="chart-container" style={{marginTop:16}}>
            <div className="chart-title">Frecuencia de noticias · {historialData.length}d</div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={historialData} margin={{top:4,right:4,bottom:0,left:-20}}>
                <XAxis dataKey="fecha" tick={{fill:'var(--text-muted)',fontSize:9}} />
                <YAxis tick={{fill:'var(--text-muted)',fontSize:9}} allowDecimals={false} />
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="TIKR" stackId="a" fill="#5b9cf6" radius={[0,0,0,0]}/>
                <Bar dataKey="SA" stackId="a" fill="#9b72f5" radius={[2,2,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="content">
      {/* Stats */}
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

      {/* Tendencia visual */}
      <div className="chart-container">
        <div className="chart-title">Distribución de tendencias</div>
        <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'center',padding:'8px 0'}}>
          <div className="tendencia-badge tend-alcista">▲ {tendencias.alcista} alcista{tendencias.alcista!==1?'s':''}</div>
          <div className="tendencia-badge tend-neutral">● {tendencias.neutral} neutral{tendencias.neutral!==1?'es':''}</div>
          <div className="tendencia-badge tend-bajista">▼ {tendencias.bajista} bajista{tendencias.bajista!==1?'s':''}</div>
        </div>
        {distribSectorial.length > 0 && (
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={distribSectorial} dataKey="value" nameKey="name"
                   cx="50%" cy="50%" outerRadius={50} innerRadius={25}
                   paddingAngle={2}>
                {distribSectorial.map((_, i) => (
                  <Cell key={i} fill={COLORS_CHART[i % COLORS_CHART.length]} stroke="none"/>
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip/>}/>
              <Legend iconSize={8} formatter={(v) => v}/>
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Historial frecuencia */}
      {historialData.length > 1 && (
        <div className="chart-container">
          <div className="chart-title">Frecuencia de noticias · rolling</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={historialData} margin={{top:4,right:4,bottom:0,left:-20}}>
              <XAxis dataKey="fecha" tick={{fill:'var(--text-muted)',fontSize:9}} />
              <YAxis tick={{fill:'var(--text-muted)',fontSize:9}} allowDecimals={false}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="TIKR" stackId="a" fill="#5b9cf6"/>
              <Bar dataKey="SA" stackId="a" fill="#9b72f5" radius={[2,2,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Orden */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div className="section-title">Patrones detectados</div>
        <button className="filter-chip active" onClick={() => setOrdenConf(o=>!o)}>
          {ordenConf ? '▼ Confianza' : '↕ Orden'}
        </button>
      </div>

      {/* Pattern cards */}
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
            <span className="pattern-freq">
              ×{p.frecuencia || 1} apariciones
            </span>
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
  const [tab, setTab] = useState('periodico');
  const [noticias, setNoticias] = useState([]);
  const [patrones, setPatrones] = useState([]);
  const [patronesMeta, setPatronesMeta] = useState(null);
  const [resumenStats, setResumenStats] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [syncingMd, setSyncingMd] = useState(false);
  const [syncingJson, setSyncingJson] = useState(false);
  const [syncedMd, setSyncedMd] = useState(false);
  const [syncedJson, setSyncedJson] = useState(false);

  // Load from localStorage on mount
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
    setLastSync(loadLocal(KEYS.sync, null));
  }, []);

  // Sync: read MD files
  const handleMdSync = useCallback((e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setSyncingMd(true);

    Promise.all(files.map(f => new Promise(res => {
      const r = new FileReader();
      r.onload = ev => res({ name: f.name, text: ev.target.result });
      r.readAsText(f);
    }))).then(results => {
      let todasNoticias = limpiarNoticias(loadLocal(KEYS.noticias, []));

      results.forEach(({ name, text }) => {
        const nuevas = parseMarkdown(text, name);
        // Reemplazar noticias del mismo día
        const fechaArchivo = name.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
        if (fechaArchivo) todasNoticias = todasNoticias.filter(n => n.fecha !== fechaArchivo);
        todasNoticias = [...todasNoticias, ...nuevas];
      });

      const limpias = limpiarNoticias(todasNoticias);
      setNoticias(limpias);
      saveLocal(KEYS.noticias, limpias);

      const now = new Date().toISOString();
      setLastSync(now);
      saveLocal(KEYS.sync, now);
      setSyncingMd(false);
      setSyncedMd(true);
      setTimeout(() => setSyncedMd(false), 2500);
    });
    e.target.value = '';
  }, []);

  // Sync: read JSON
  const handleJsonSync = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSyncingJson(true);
    const r = new FileReader();
    r.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        setPatrones(data.patrones || []);
        setPatronesMeta(data.meta || null);
        setResumenStats(data.resumenEstadistico || null);
        setHistorial(data.historial || []);
        saveLocal(KEYS.patrones, data);
        const now = new Date().toISOString();
        setLastSync(now);
        saveLocal(KEYS.sync, now);
      } catch {}
      setSyncingJson(false);
      setSyncedJson(true);
      setTimeout(() => setSyncedJson(false), 2500);
    };
    r.readAsText(file);
    e.target.value = '';
  }, []);

  const today = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
  const syncTime = lastSync ? new Date(lastSync).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'}) : null;

  return (
    <div className="shell">
      {/* Header */}
      <div className="header">
        <div className="header-top">
          <div>
            <div className="masthead">Mi Periódico<br/><span>de Inversiones</span></div>
          </div>
          <div className="date-stamp">
            {today}<br/>
            {syncTime ? `Sync ${syncTime}` : 'Sin sincronizar'}
          </div>
        </div>

        {/* Sync buttons */}
        <div style={{display:'flex',gap:8,marginTop:10}}>
          <button className={`sync-btn ${syncingMd?'syncing':''} ${syncedMd?'synced':''}`}
                  style={{flex:1}}
                  onClick={() => document.getElementById('md-input').click()}>
            {syncedMd ? '✓ Noticias' : syncingMd ? '⟳ Leyendo…' : '↑ Noticias .md'}
          </button>
          <button className={`sync-btn ${syncingJson?'syncing':''} ${syncedJson?'synced':''}`}
                  style={{flex:1}}
                  onClick={() => document.getElementById('json-input').click()}>
            {syncedJson ? '✓ Patrones' : syncingJson ? '⟳ Leyendo…' : '↑ Patrones .json'}
          </button>
        </div>
      </div>

      {/* Tabs */}
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

      {/* Content */}
      {tab === 'periodico' ? (
        <TabPeriodico
          noticias={noticias}
          onSyncMd={() => document.getElementById('md-input').click()}
          syncing={syncingMd}
          syncedMd={syncedMd}
          patronesMeta={patronesMeta}
        />
      ) : (
        <TabPatrones
          patrones={patrones}
          resumen={resumenStats}
          historial={historial}
          meta={patronesMeta}
        />
      )}

      {/* Status bar */}
      <div className="status-bar">
        {noticias.length > 0
          ? `${noticias.length} noticias · rolling 7d · ${patrones.length} patrones 30d`
          : 'Sube los archivos .md y .json para comenzar'
        }
      </div>

      {/* Hidden file inputs */}
      <input id="md-input" type="file" accept=".md" multiple onChange={handleMdSync}/>
      <input id="json-input" type="file" accept=".json" onChange={handleJsonSync}/>
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
