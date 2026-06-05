const {
  useState,
  useEffect,
  useCallback,
  useRef
} = React;
const {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend
} = Recharts;

// ─────────────────────────────────────────────
// PARSER: Markdown → noticias estructuradas
// ─────────────────────────────────────────────
function parseMarkdown(mdText, filename) {
  const fecha = filename.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || new Date().toISOString().slice(0, 10);
  const noticias = [];

  // Detectar secciones TIKR y Seeking Alpha
  const secciones = {
    tikr: {
      regex: /## TIKR.*?\n([\s\S]*?)(?=## Seeking Alpha|## Patrones|$)/i,
      fuente: 'TIKR'
    },
    sa: {
      regex: /## Seeking Alpha.*?\n([\s\S]*?)(?=## TIKR|## Patrones|$)/i,
      fuente: 'SeekingAlpha'
    }
  };
  Object.values(secciones).forEach(({
    regex,
    fuente
  }) => {
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
      const keywords = ['earnings', 'revenue', 'growth', 'beat', 'miss', 'guidance', 'buyback', 'dividend', 'acquisition', 'merger', 'downgrade', 'upgrade', 'target', 'ganancias', 'ingresos', 'beneficio', 'compra', 'fusión', 'dividendo'];
      const textoLower = cuerpo.toLowerCase();
      const hits = keywords.filter(k => textoLower.includes(k)).length;
      const relevancia = Math.min(5, Math.max(1, hits + (ticker.length <= 5 ? 1 : 0)));
      noticias.push({
        id: `${fuente}-${ticker}-${fecha}`,
        fuente,
        ticker,
        empresa,
        fecha,
        resumen,
        cuerpo,
        relevancia
      });
    });

    // Si hay texto libre sin headers ###
    if (noticias.filter(n => n.fecha === fecha && n.fuente === fuente).length === 0) {
      const lineas = bloque.split('\n').filter(l => l.trim() && !l.startsWith('>'));
      if (lineas.length > 0 && !/sin noticias/i.test(lineas[0])) {
        noticias.push({
          id: `${fuente}-misc-${fecha}`,
          fuente,
          ticker: '—',
          empresa: 'Varios',
          fecha,
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
const KEYS = {
  noticias: 'pdi_noticias',
  patrones: 'pdi_patrones',
  sync: 'pdi_last_sync'
};
function limpiarNoticias(noticias) {
  const limite = new Date();
  limite.setDate(limite.getDate() - 7);
  const cutoff = limite.toISOString().slice(0, 10);
  return noticias.filter(n => n.fecha >= cutoff);
}
function loadLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}
function saveLocal(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// ─────────────────────────────────────────────
// Componentes auxiliares
// ─────────────────────────────────────────────
function RelevanceDots({
  nivel
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "news-relevance"
  }, [1, 2, 3, 4, 5].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `relevance-dot ${i <= nivel ? 'filled' : ''}`
  })));
}
function NewsCard({
  noticia,
  style
}) {
  const [expanded, setExpanded] = useState(false);
  const cls = noticia.fuente === 'TIKR' ? 'tikr' : 'sa';
  return /*#__PURE__*/React.createElement("div", {
    className: `news-card ${cls} ${expanded ? 'expanded' : ''}`,
    style: style,
    onClick: () => setExpanded(e => !e)
  }, /*#__PURE__*/React.createElement("div", {
    className: "news-header"
  }, noticia.ticker !== '—' && /*#__PURE__*/React.createElement("span", {
    className: "news-ticker"
  }, noticia.ticker), /*#__PURE__*/React.createElement("span", {
    className: "news-date"
  }, noticia.fecha)), noticia.empresa && noticia.empresa !== noticia.ticker && /*#__PURE__*/React.createElement("div", {
    className: "news-title"
  }, noticia.empresa), /*#__PURE__*/React.createElement("div", {
    className: `news-summary ${expanded ? 'expanded' : ''}`
  }, expanded ? noticia.cuerpo : noticia.resumen), /*#__PURE__*/React.createElement(RelevanceDots, {
    nivel: noticia.relevancia
  }));
}
function EmptyNewsPaper({
  meta
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("div", {
    className: "empty-icon"
  }, "\uD83D\uDCF0"), /*#__PURE__*/React.createElement("div", {
    className: "empty-title"
  }, "Sin noticias en cach\xE9"), /*#__PURE__*/React.createElement("div", {
    className: "empty-sub"
  }, "Sincroniza tus archivos .md diarios para ver las noticias"), meta && /*#__PURE__*/React.createElement("div", {
    className: "empty-note"
  }, /*#__PURE__*/React.createElement("strong", null, "\u2139\uFE0F Nota del sistema:"), /*#__PURE__*/React.createElement("br", null), meta.nota || 'Sin datos disponibles.', /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Acci\xF3n:"), " ", meta.accionRecomendada));
}

// ─────────────────────────────────────────────
// TAB: PERIÓDICO
// ─────────────────────────────────────────────
function TabPeriodico({
  noticias,
  onSyncMd,
  syncing,
  syncedMd,
  patronesMeta
}) {
  const [filtroFuente, setFiltroFuente] = useState('all');
  const [filtroOrden, setFiltroOrden] = useState('fecha');
  const [filtroTicker, setFiltroTicker] = useState('');
  const tickers = [...new Set(noticias.map(n => n.ticker))].filter(t => t !== '—');
  let filtradas = [...noticias];
  if (filtroFuente !== 'all') filtradas = filtradas.filter(n => n.fuente === filtroFuente);
  if (filtroTicker) filtradas = filtradas.filter(n => n.ticker === filtroTicker);
  filtradas.sort((a, b) => {
    if (filtroOrden === 'relevancia') return b.relevancia - a.relevancia;
    return b.fecha.localeCompare(a.fecha);
  });
  const tikrNews = filtradas.filter(n => n.fuente === 'TIKR').slice(0, 7);
  const saNews = filtradas.filter(n => n.fuente === 'SeekingAlpha').slice(0, 7);
  return /*#__PURE__*/React.createElement("div", {
    className: "content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "filter-bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: `filter-chip ${filtroFuente === 'all' ? 'active' : ''}`,
    onClick: () => setFiltroFuente('all')
  }, "Todas"), /*#__PURE__*/React.createElement("button", {
    className: `filter-chip ${filtroFuente === 'TIKR' ? 'active' : ''}`,
    onClick: () => setFiltroFuente('TIKR')
  }, "TIKR"), /*#__PURE__*/React.createElement("button", {
    className: `filter-chip ${filtroFuente === 'SeekingAlpha' ? 'active' : ''}`,
    onClick: () => setFiltroFuente('SeekingAlpha')
  }, "Seeking Alpha"), /*#__PURE__*/React.createElement("button", {
    className: `filter-chip ${filtroOrden === 'relevancia' ? 'active' : ''}`,
    onClick: () => setFiltroOrden(o => o === 'relevancia' ? 'fecha' : 'relevancia')
  }, filtroOrden === 'relevancia' ? '▼ Relevancia' : '↕ Relevancia')), tickers.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "filter-bar",
    style: {
      marginTop: -6
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: `filter-chip ${filtroTicker === '' ? 'active' : ''}`,
    onClick: () => setFiltroTicker('')
  }, "Todo"), tickers.slice(0, 6).map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    className: `filter-chip ${filtroTicker === t ? 'active' : ''}`,
    onClick: () => setFiltroTicker(f => f === t ? '' : t)
  }, t))), noticias.length === 0 ? /*#__PURE__*/React.createElement(EmptyNewsPaper, {
    meta: patronesMeta
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, (filtroFuente === 'all' || filtroFuente === 'TIKR') && /*#__PURE__*/React.createElement("div", {
    className: "news-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "source-label tikr"
  }, "TIKR \xB7 ", tikrNews.length), tikrNews.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-muted)',
      fontSize: 12,
      padding: '8px 0'
    }
  }, "Sin noticias de TIKR en el per\xEDodo") : tikrNews.map((n, i) => /*#__PURE__*/React.createElement(NewsCard, {
    key: n.id,
    noticia: n,
    style: {
      animationDelay: `${i * 30}ms`
    }
  }))), (filtroFuente === 'all' || filtroFuente === 'SeekingAlpha') && /*#__PURE__*/React.createElement("div", {
    className: "news-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "source-label sa"
  }, "Seeking Alpha \xB7 ", saNews.length), saNews.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-muted)',
      fontSize: 12,
      padding: '8px 0'
    }
  }, "Sin noticias de Seeking Alpha en el per\xEDodo") : saNews.map((n, i) => /*#__PURE__*/React.createElement(NewsCard, {
    key: n.id,
    noticia: n,
    style: {
      animationDelay: `${i * 30}ms`
    }
  })))));
}

// ─────────────────────────────────────────────
// TAB: PATRONES
// ─────────────────────────────────────────────
const COLORS_CHART = ['#c9a84c', '#5b9cf6', '#3ddc84', '#ff5c5c', '#9b72f5', '#ff9f43'];
function CustomTooltip({
  active,
  payload,
  label
}) {
  if (!active || !payload?.length) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      padding: '8px 12px',
      borderRadius: 6,
      fontFamily: 'var(--font-mono)',
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-muted)',
      marginBottom: 4
    }
  }, label), payload.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      color: p.color
    }
  }, p.name, ": ", typeof p.value === 'number' ? p.value.toFixed(2) : p.value)));
}
function TabPatrones({
  patrones,
  resumen,
  historial,
  meta
}) {
  const [ordenConf, setOrdenConf] = useState(true);
  const confOrder = {
    alta: 3,
    media: 2,
    baja: 1
  };
  const sorted = [...patrones].sort((a, b) => ordenConf ? (confOrder[b.confianza] || 0) - (confOrder[a.confianza] || 0) : 0);

  // Datos para gráficos
  const historialData = (historial || []).slice(-14).map(h => ({
    fecha: h.fecha.slice(5),
    // MM-DD
    TIKR: h.fuentes?.TIKR || 0,
    SA: h.fuentes?.SeekingAlpha || 0,
    total: h.noticias || 0
  }));
  const distribSectorial = Object.entries(patrones.reduce((acc, p) => {
    const s = p.sector || 'Otros';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {})).map(([name, value]) => ({
    name,
    value
  }));
  const tendencias = {
    alcista: patrones.filter(p => p.tendencia === 'alcista').length,
    bajista: patrones.filter(p => p.tendencia === 'bajista').length,
    neutral: patrones.filter(p => p.tendencia === 'neutral').length
  };
  if (patrones.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      className: "content"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-state"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-icon"
    }, "\uD83D\uDCCA"), /*#__PURE__*/React.createElement("div", {
      className: "empty-title"
    }, "Sin patrones detectados"), /*#__PURE__*/React.createElement("div", {
      className: "empty-sub"
    }, "Los patrones se acumulan a medida que llegan noticias durante varios d\xEDas"), meta && /*#__PURE__*/React.createElement("div", {
      className: "empty-note"
    }, /*#__PURE__*/React.createElement("strong", null, "Estado:"), " ", meta.estado, /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Cobertura:"), " ", meta.cobertura, /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Archivos:"), " ", meta.archivosAnalizados, "/", meta.archivosPeriodoEsperado, /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), meta.nota)), historialData.length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "chart-container",
      style: {
        marginTop: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "chart-title"
    }, "Frecuencia de noticias \xB7 ", historialData.length, "d"), /*#__PURE__*/React.createElement(ResponsiveContainer, {
      width: "100%",
      height: 140
    }, /*#__PURE__*/React.createElement(BarChart, {
      data: historialData,
      margin: {
        top: 4,
        right: 4,
        bottom: 0,
        left: -20
      }
    }, /*#__PURE__*/React.createElement(XAxis, {
      dataKey: "fecha",
      tick: {
        fill: 'var(--text-muted)',
        fontSize: 9
      }
    }), /*#__PURE__*/React.createElement(YAxis, {
      tick: {
        fill: 'var(--text-muted)',
        fontSize: 9
      },
      allowDecimals: false
    }), /*#__PURE__*/React.createElement(Tooltip, {
      content: /*#__PURE__*/React.createElement(CustomTooltip, null)
    }), /*#__PURE__*/React.createElement(Bar, {
      dataKey: "TIKR",
      stackId: "a",
      fill: "#5b9cf6",
      radius: [0, 0, 0, 0]
    }), /*#__PURE__*/React.createElement(Bar, {
      dataKey: "SA",
      stackId: "a",
      fill: "#9b72f5",
      radius: [2, 2, 0, 0]
    })))));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stats-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--accent-gold)'
    }
  }, patrones.length), /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Patrones")), /*#__PURE__*/React.createElement("div", {
    className: "stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--accent-green)'
    }
  }, resumen?.porConfianza?.alta || 0), /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Alta conf.")), /*#__PURE__*/React.createElement("div", {
    className: "stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--accent-red)'
    }
  }, tendencias.bajista), /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Bajistas"))), /*#__PURE__*/React.createElement("div", {
    className: "chart-container"
  }, /*#__PURE__*/React.createElement("div", {
    className: "chart-title"
  }, "Distribuci\xF3n de tendencias"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '8px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "tendencia-badge tend-alcista"
  }, "\u25B2 ", tendencias.alcista, " alcista", tendencias.alcista !== 1 ? 's' : ''), /*#__PURE__*/React.createElement("div", {
    className: "tendencia-badge tend-neutral"
  }, "\u25CF ", tendencias.neutral, " neutral", tendencias.neutral !== 1 ? 'es' : ''), /*#__PURE__*/React.createElement("div", {
    className: "tendencia-badge tend-bajista"
  }, "\u25BC ", tendencias.bajista, " bajista", tendencias.bajista !== 1 ? 's' : '')), distribSectorial.length > 0 && /*#__PURE__*/React.createElement(ResponsiveContainer, {
    width: "100%",
    height: 130
  }, /*#__PURE__*/React.createElement(PieChart, null, /*#__PURE__*/React.createElement(Pie, {
    data: distribSectorial,
    dataKey: "value",
    nameKey: "name",
    cx: "50%",
    cy: "50%",
    outerRadius: 50,
    innerRadius: 25,
    paddingAngle: 2
  }, distribSectorial.map((_, i) => /*#__PURE__*/React.createElement(Cell, {
    key: i,
    fill: COLORS_CHART[i % COLORS_CHART.length],
    stroke: "none"
  }))), /*#__PURE__*/React.createElement(Tooltip, {
    content: /*#__PURE__*/React.createElement(CustomTooltip, null)
  }), /*#__PURE__*/React.createElement(Legend, {
    iconSize: 8,
    formatter: v => v
  })))), historialData.length > 1 && /*#__PURE__*/React.createElement("div", {
    className: "chart-container"
  }, /*#__PURE__*/React.createElement("div", {
    className: "chart-title"
  }, "Frecuencia de noticias \xB7 rolling"), /*#__PURE__*/React.createElement(ResponsiveContainer, {
    width: "100%",
    height: 120
  }, /*#__PURE__*/React.createElement(BarChart, {
    data: historialData,
    margin: {
      top: 4,
      right: 4,
      bottom: 0,
      left: -20
    }
  }, /*#__PURE__*/React.createElement(XAxis, {
    dataKey: "fecha",
    tick: {
      fill: 'var(--text-muted)',
      fontSize: 9
    }
  }), /*#__PURE__*/React.createElement(YAxis, {
    tick: {
      fill: 'var(--text-muted)',
      fontSize: 9
    },
    allowDecimals: false
  }), /*#__PURE__*/React.createElement(Tooltip, {
    content: /*#__PURE__*/React.createElement(CustomTooltip, null)
  }), /*#__PURE__*/React.createElement(Bar, {
    dataKey: "TIKR",
    stackId: "a",
    fill: "#5b9cf6"
  }), /*#__PURE__*/React.createElement(Bar, {
    dataKey: "SA",
    stackId: "a",
    fill: "#9b72f5",
    radius: [2, 2, 0, 0]
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-title"
  }, "Patrones detectados"), /*#__PURE__*/React.createElement("button", {
    className: "filter-chip active",
    onClick: () => setOrdenConf(o => !o)
  }, ordenConf ? '▼ Confianza' : '↕ Orden')), sorted.map((p, i) => /*#__PURE__*/React.createElement("div", {
    className: "pattern-card",
    key: p.id || i,
    style: {
      animationDelay: `${i * 25}ms`
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "pattern-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: `pattern-tipo tipo-${p.tipo?.toLowerCase() || 'tendencia'}`
  }, p.tipo || 'Tendencia'), /*#__PURE__*/React.createElement("span", {
    className: `pattern-confianza conf-${p.confianza}`
  }, p.confianza === 'alta' ? '●●●' : p.confianza === 'media' ? '●●○' : '●○○', " ", p.confianza)), /*#__PURE__*/React.createElement("div", {
    className: "pattern-empresa"
  }, p.empresa), p.ticker && /*#__PURE__*/React.createElement("div", {
    className: "pattern-ticker-badge"
  }, p.ticker), /*#__PURE__*/React.createElement("div", {
    className: "pattern-desc"
  }, p.descripcion), p.tags?.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "pattern-tags"
  }, p.tags.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    className: "tag"
  }, t))), /*#__PURE__*/React.createElement("div", {
    className: "pattern-footer"
  }, /*#__PURE__*/React.createElement("span", {
    className: `tendencia-badge tend-${p.tendencia || 'neutral'}`
  }, p.tendencia === 'alcista' ? '▲' : p.tendencia === 'bajista' ? '▼' : '●', " ", p.tendencia || 'neutral'), /*#__PURE__*/React.createElement("span", {
    className: "pattern-freq"
  }, "\xD7", p.frecuencia || 1, " apariciones")))));
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
  const handleMdSync = useCallback(e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setSyncingMd(true);
    Promise.all(files.map(f => new Promise(res => {
      const r = new FileReader();
      r.onload = ev => res({
        name: f.name,
        text: ev.target.result
      });
      r.readAsText(f);
    }))).then(results => {
      let todasNoticias = limpiarNoticias(loadLocal(KEYS.noticias, []));
      results.forEach(({
        name,
        text
      }) => {
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
  const handleJsonSync = useCallback(e => {
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
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const syncTime = lastSync ? new Date(lastSync).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  }) : null;
  return /*#__PURE__*/React.createElement("div", {
    className: "shell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "header-top"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "masthead"
  }, "Mi Peri\xF3dico", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", null, "de Inversiones"))), /*#__PURE__*/React.createElement("div", {
    className: "date-stamp"
  }, today, /*#__PURE__*/React.createElement("br", null), syncTime ? `Sync ${syncTime}` : 'Sin sincronizar')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: `sync-btn ${syncingMd ? 'syncing' : ''} ${syncedMd ? 'synced' : ''}`,
    style: {
      flex: 1
    },
    onClick: () => document.getElementById('md-input').click()
  }, syncedMd ? '✓ Noticias' : syncingMd ? '⟳ Leyendo…' : '↑ Noticias .md'), /*#__PURE__*/React.createElement("button", {
    className: `sync-btn ${syncingJson ? 'syncing' : ''} ${syncedJson ? 'synced' : ''}`,
    style: {
      flex: 1
    },
    onClick: () => document.getElementById('json-input').click()
  }, syncedJson ? '✓ Patrones' : syncingJson ? '⟳ Leyendo…' : '↑ Patrones .json'))), /*#__PURE__*/React.createElement("div", {
    className: "tabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: `tab-btn ${tab === 'periodico' ? 'active' : ''}`,
    onClick: () => setTab('periodico')
  }, "Peri\xF3dico", /*#__PURE__*/React.createElement("span", {
    className: "tab-count"
  }, noticias.length)), /*#__PURE__*/React.createElement("button", {
    className: `tab-btn ${tab === 'patrones' ? 'active' : ''}`,
    onClick: () => setTab('patrones')
  }, "Patrones", /*#__PURE__*/React.createElement("span", {
    className: "tab-count"
  }, patrones.length))), tab === 'periodico' ? /*#__PURE__*/React.createElement(TabPeriodico, {
    noticias: noticias,
    onSyncMd: () => document.getElementById('md-input').click(),
    syncing: syncingMd,
    syncedMd: syncedMd,
    patronesMeta: patronesMeta
  }) : /*#__PURE__*/React.createElement(TabPatrones, {
    patrones: patrones,
    resumen: resumenStats,
    historial: historial,
    meta: patronesMeta
  }), /*#__PURE__*/React.createElement("div", {
    className: "status-bar"
  }, noticias.length > 0 ? `${noticias.length} noticias · rolling 7d · ${patrones.length} patrones 30d` : 'Sube los archivos .md y .json para comenzar'), /*#__PURE__*/React.createElement("input", {
    id: "md-input",
    type: "file",
    accept: ".md",
    multiple: true,
    onChange: handleMdSync
  }), /*#__PURE__*/React.createElement("input", {
    id: "json-input",
    type: "file",
    accept: ".json",
    onChange: handleJsonSync
  }));
}

// ─────────────────────────────────────────────
// Mount + Service Worker
// ─────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  });
}
