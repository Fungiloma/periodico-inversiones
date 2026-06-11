const {
  useState,
  useEffect,
  useCallback
} = React;

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
  const relevanciaMap = {
    alta: 5,
    media: 3,
    baja: 1
  };

  // Grupos: 1=label bold, 2=ticker plain, 3=descripción, 4=relevancia
  // Soporta: **INTC** — texto | Relevancia: **alta**
  //      y:  INTC — texto | Relevancia: alta
  //      y:  **General** — texto | Relevancia: media  (ticker=—, empresa=label)
  const BULLET = new RegExp('^-\\s+(?:\\*\\*(.+?)\\*\\*|([A-Z0-9.\\/]+))\\s*—\\s*(.+?)\\s*\\|\\s*Relevancia:\\s*(?:\\*\\*)?(alta|media|baja)(?:\\*\\*)?', 'i');
  const parseSect = (bloque, fuente) => {
    if (!bloque) return;
    let current = null;
    bloque.split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      if (current) {
        if (/^Detalle:\s*/i.test(line)) {
          current.detalle = line.replace(/^Detalle:\s*/i, '').trim();
          return;
        }
        if (line.startsWith('📄')) {
          current.cuerpo = line.replace(/^📄\s*Resumen:\s*/i, '').trim() || current.cuerpo;
          return;
        }
        if (line.startsWith('🔗')) {
          current.link = line.replace(/^🔗\s*Link:\s*/i, '').trim();
          return;
        }
      }
      const m = line.match(BULLET);
      if (m) {
        if (current) noticias.push(current);
        const rawLabel = (m[1] || m[2] || '').trim();
        const isTicker = /^[A-Z0-9.\/]+$/.test(rawLabel);
        const ticker = isTicker ? rawLabel : '—';
        const empresa = isTicker ? m[3].trim() : rawLabel;
        const titulo = m[3].trim();
        const idKey = rawLabel.replace(/\W+/g, '_').slice(0, 24);
        current = {
          id: `${fuente}-${idKey}-${fecha}`,
          fuente,
          ticker,
          empresa,
          fecha,
          resumen: titulo,
          cuerpo: titulo,
          detalle: null,
          link: null,
          relevancia: relevanciaMap[m[4].toLowerCase()] || 3
        };
      }
    });
    if (current) noticias.push(current);
  };
  const tikrBloque = mdText.match(/\*\*TIKR\*\*[^\n]*\n([\s\S]*?)(?=\*\*Seeking Alpha\*\*|\*\*TIKR\*\*|$)/i);
  const saBloque = mdText.match(/\*\*Seeking Alpha\*\*[^\n]*\n([\s\S]*?)(?=\*\*TIKR\*\*|\*\*Seeking Alpha\*\*|$)/i);
  parseSect(tikrBloque?.[1], 'TIKR');
  parseSect(saBloque?.[1], 'SeekingAlpha');
  console.log('noticias generadas:', noticias.length, noticias.map(n => n.ticker + '/' + n.empresa.slice(0, 20)));
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
  limite.setDate(limite.getDate() - 5);
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
// SVG CHARTS — sin librerías externas
// ─────────────────────────────────────────────
const COLORS_CHART = ['#c9a84c', '#5b9cf6', '#3ddc84', '#ff5c5c', '#9b72f5', '#ff9f43'];
function SVGBarChart({
  data,
  height = 140
}) {
  const [hovered, setHovered] = useState(null);
  if (!data || data.length === 0) return null;
  const W = 400,
    H = height;
  const mt = 8,
    mr = 8,
    mb = 28,
    ml = 26;
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
    tipEl = /*#__PURE__*/React.createElement("g", {
      style: {
        pointerEvents: 'none'
      }
    }, /*#__PURE__*/React.createElement("rect", {
      x: tx - 34,
      y: ty - 40,
      width: 68,
      height: 38,
      fill: "var(--bg-card)",
      stroke: "var(--border)",
      rx: "4"
    }), /*#__PURE__*/React.createElement("text", {
      x: tx,
      y: ty - 27,
      textAnchor: "middle",
      fill: "var(--text-muted)",
      fontSize: "8"
    }, hovered.d.fecha), /*#__PURE__*/React.createElement("text", {
      x: tx,
      y: ty - 15,
      textAnchor: "middle",
      fill: "#5b9cf6",
      fontSize: "9"
    }, "TIKR ", hovered.d.TIKR), /*#__PURE__*/React.createElement("text", {
      x: tx,
      y: ty - 4,
      textAnchor: "middle",
      fill: "#9b72f5",
      fontSize: "9"
    }, "SA ", hovered.d.SA));
  }
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    width: "100%",
    height: height,
    style: {
      overflow: 'visible',
      display: 'block'
    }
  }, yTicks.map(v => {
    const y = baseY - v / maxVal * cH;
    return /*#__PURE__*/React.createElement("g", {
      key: v
    }, /*#__PURE__*/React.createElement("line", {
      x1: ml,
      x2: ml + cW,
      y1: y,
      y2: y,
      stroke: "var(--border)",
      strokeWidth: "0.5"
    }), /*#__PURE__*/React.createElement("text", {
      x: ml - 3,
      y: y + 3,
      textAnchor: "end",
      fill: "var(--text-muted)",
      fontSize: "8"
    }, v));
  }), data.map((d, i) => {
    const tikr = d.TIKR || 0;
    const sa = d.SA || 0;
    const tikrH = tikr / maxVal * cH;
    const saH = sa / maxVal * cH;
    const x = ml + i * barSlot + (barSlot - barW) / 2;
    return /*#__PURE__*/React.createElement("g", {
      key: i,
      onMouseEnter: () => setHovered({
        d,
        px: x + barW / 2,
        py: baseY - tikrH - saH
      }),
      onMouseLeave: () => setHovered(null)
    }, tikrH > 0 && /*#__PURE__*/React.createElement("rect", {
      x: x,
      y: baseY - tikrH,
      width: barW,
      height: tikrH,
      fill: "#5b9cf6",
      rx: "1"
    }), saH > 0 && /*#__PURE__*/React.createElement("rect", {
      x: x,
      y: baseY - tikrH - saH,
      width: barW,
      height: saH,
      fill: "#9b72f5",
      rx: "2"
    }), /*#__PURE__*/React.createElement("rect", {
      x: x,
      y: mt,
      width: barW,
      height: cH,
      fill: "transparent"
    }), /*#__PURE__*/React.createElement("text", {
      x: x + barW / 2,
      y: H - 4,
      textAnchor: "middle",
      fill: "var(--text-muted)",
      fontSize: "8"
    }, d.fecha));
  }), tipEl);
}
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  };
}
function donutPath(cx, cy, innerR, outerR, startAngle, endAngle) {
  const p1 = polarToCartesian(cx, cy, outerR, startAngle);
  const p2 = polarToCartesian(cx, cy, outerR, endAngle);
  const p3 = polarToCartesian(cx, cy, innerR, endAngle);
  const p4 = polarToCartesian(cx, cy, innerR, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M${p1.x},${p1.y} A${outerR},${outerR} 0 ${large} 1 ${p2.x},${p2.y} L${p3.x},${p3.y} A${innerR},${innerR} 0 ${large} 0 ${p4.x},${p4.y}Z`;
}
function SVGPieChart({
  data,
  height = 160
}) {
  const [hovered, setHovered] = useState(null);
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  const W = 300,
    H = height;
  const cx = 72,
    cy = H / 2;
  const outerR = 54,
    innerR = 26,
    padAngle = 2;
  let angle = 0;
  const sectors = data.map((d, i) => {
    const sweep = Math.max(0, d.value / total * 360 - padAngle);
    const s = {
      ...d,
      start: angle,
      end: angle + sweep,
      color: d.color || COLORS_CHART[i % COLORS_CHART.length]
    };
    angle += sweep + padAngle;
    return s;
  });
  const legendX = cx + outerR + 16;
  const legendStartY = H / 2 - sectors.length * 15 / 2 + 6;
  let tipEl = null;
  if (hovered) {
    const mid = (hovered.start + hovered.end) / 2;
    const tp = polarToCartesian(cx, cy, outerR + 18, mid);
    const tx = Math.min(Math.max(tp.x, 38), W - 38);
    const ty = Math.min(Math.max(tp.y, 18), H - 10);
    tipEl = /*#__PURE__*/React.createElement("g", {
      style: {
        pointerEvents: 'none'
      }
    }, /*#__PURE__*/React.createElement("rect", {
      x: tx - 38,
      y: ty - 22,
      width: 76,
      height: 20,
      fill: "var(--bg-card)",
      stroke: "var(--border)",
      rx: "4"
    }), /*#__PURE__*/React.createElement("text", {
      x: tx,
      y: ty - 8,
      textAnchor: "middle",
      fill: hovered.color,
      fontSize: "10"
    }, hovered.name, ": ", hovered.value));
  }
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    width: "100%",
    height: height,
    style: {
      overflow: 'visible',
      display: 'block'
    }
  }, sectors.map((s, i) => /*#__PURE__*/React.createElement("path", {
    key: i,
    d: donutPath(cx, cy, innerR, outerR, s.start, s.end),
    fill: s.color,
    stroke: "var(--bg-card)",
    strokeWidth: "1.5",
    style: {
      cursor: 'default'
    },
    onMouseEnter: () => setHovered(s),
    onMouseLeave: () => setHovered(null)
  })), sectors.map((s, i) => /*#__PURE__*/React.createElement("g", {
    key: i,
    transform: `translate(${legendX}, ${legendStartY + i * 15})`
  }, /*#__PURE__*/React.createElement("rect", {
    x: 0,
    y: -6,
    width: 8,
    height: 8,
    fill: s.color,
    rx: "1"
  }), /*#__PURE__*/React.createElement("text", {
    x: 12,
    y: 2,
    fill: "var(--text-secondary)",
    fontSize: "10"
  }, s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name))), tipEl);
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

  // Collapsed preview: Detalle > primeras 2 líneas del cuerpo > título
  const preview = noticia.detalle || noticia.cuerpo.split('\n').filter(Boolean).slice(0, 2).join(' ') || noticia.empresa;
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
  }, expanded ? noticia.cuerpo : preview), expanded && noticia.link && /*#__PURE__*/React.createElement("a", {
    href: noticia.link,
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: e => e.stopPropagation(),
    style: {
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
    }
  }, "Leer art\xEDculo \u2192"), /*#__PURE__*/React.createElement(RelevanceDots, {
    nivel: noticia.relevancia
  }));
}
function EmptyState({
  fetchStatus
}) {
  if (fetchStatus === 'error') {
    return /*#__PURE__*/React.createElement("div", {
      className: "empty-state"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-icon"
    }, "\uD83D\uDCE1"), /*#__PURE__*/React.createElement("div", {
      className: "empty-title"
    }, "Sin datos"), /*#__PURE__*/React.createElement("div", {
      className: "empty-sub"
    }, "Conecta a internet para cargar el peri\xF3dico"));
  }
  if (fetchStatus === 'loading') {
    return /*#__PURE__*/React.createElement("div", {
      className: "empty-state"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-icon"
    }, "\u27F3"), /*#__PURE__*/React.createElement("div", {
      className: "empty-title"
    }, "Cargando..."));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("div", {
    className: "empty-icon"
  }, "\uD83D\uDCF0"), /*#__PURE__*/React.createElement("div", {
    className: "empty-title"
  }, "Sin noticias disponibles"), /*#__PURE__*/React.createElement("div", {
    className: "empty-sub"
  }, "Pulsa \u21BB Actualizar para intentarlo de nuevo"));
}

// ─────────────────────────────────────────────
// TAB: PERIÓDICO
// ─────────────────────────────────────────────
function TabPeriodico({
  noticias,
  patronesMeta,
  fetchStatus
}) {
  const [filtroFuente, setFiltroFuente] = useState('all');
  const [filtroOrden, setFiltroOrden] = useState('fecha');
  const [filtroTicker, setFiltroTicker] = useState('');
  const tickers = [...new Set(noticias.map(n => n.ticker))].filter(t => t !== '—');
  let filtradas = [...noticias];
  if (filtroFuente !== 'all') filtradas = filtradas.filter(n => n.fuente === filtroFuente);
  if (filtroTicker) filtradas = filtradas.filter(n => n.ticker === filtroTicker);
  filtradas.sort((a, b) => filtroOrden === 'relevancia' ? b.relevancia - a.relevancia : b.fecha.localeCompare(a.fecha));
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
  }, t))), noticias.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    fetchStatus: fetchStatus
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
// HISTORIAL CHART — barras simples con tooltip nota
// ─────────────────────────────────────────────
function HistorialChart({
  data,
  height = 100
}) {
  const [hov, setHov] = useState(null);
  if (!data || data.length === 0) return null;
  const W = 400,
    H = height;
  const mt = 26,
    mr = 4,
    mb = 18,
    ml = 4;
  const cW = W - ml - mr;
  const cH = H - mt - mb;
  const baseY = mt + cH;
  const vals = data.map(d => Number(d.noticias) || 0);
  const maxVal = Math.max(1, ...vals);
  const slot = cW / data.length;
  const barW = Math.min(slot * 0.72, 26);
  let tip = null;
  if (hov !== null && data[hov]) {
    const d = data[hov];
    const raw = d.nota || `${d.noticias || 0} noticias`;
    const txt = raw.length > 40 ? raw.slice(0, 38) + '…' : raw;
    const bx = ml + hov * slot + slot / 2;
    const tx = Math.min(Math.max(bx, 60), W - 60);
    tip = /*#__PURE__*/React.createElement("g", {
      style: {
        pointerEvents: 'none'
      }
    }, /*#__PURE__*/React.createElement("rect", {
      x: tx - 60,
      y: 1,
      width: 120,
      height: 20,
      fill: "var(--bg-card)",
      stroke: "var(--border)",
      rx: "4"
    }), /*#__PURE__*/React.createElement("text", {
      x: tx,
      y: 14,
      textAnchor: "middle",
      fill: "var(--text-secondary)",
      fontSize: "8"
    }, txt));
  }
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    width: "100%",
    height: height,
    style: {
      overflow: 'visible',
      display: 'block'
    }
  }, data.map((d, i) => {
    const n = Number(d.noticias) || 0;
    const barH = Math.max(n / maxVal * cH, 1);
    const x = ml + i * slot + (slot - barW) / 2;
    const isH = hov === i;
    return /*#__PURE__*/React.createElement("g", {
      key: i,
      onMouseEnter: () => setHov(i),
      onMouseLeave: () => setHov(null)
    }, /*#__PURE__*/React.createElement("rect", {
      x: x,
      y: baseY - barH,
      width: barW,
      height: barH,
      fill: isH ? 'var(--accent-gold)' : 'var(--accent-blue)',
      opacity: isH ? 1 : 0.5,
      rx: "2"
    }), /*#__PURE__*/React.createElement("rect", {
      x: x,
      y: mt,
      width: barW,
      height: cH,
      fill: "transparent"
    }), /*#__PURE__*/React.createElement("text", {
      x: x + barW / 2,
      y: H - 2,
      textAnchor: "middle",
      fill: "var(--text-muted)",
      fontSize: "7"
    }, (d.fecha || '').slice(5)));
  }), tip);
}

// ─────────────────────────────────────────────
// MINI CHART — inline en cada PatronCard
// Sin ejes, sin labels, solo forma visual
// ─────────────────────────────────────────────
function MiniChart({
  data,
  tipo,
  ejeY,
  height = 60
}) {
  if (!data || data.length === 0) return null;
  const W = 200,
    H = height;
  const pad = 3;
  const cW = W - pad * 2;
  const cH = H - pad * 2;

  // Normaliza valores a números (data puede tener strings)
  const nums = data.map(d => Number(d.value) || 0);

  // Un solo punto → dot grande centrado
  if (data.length === 1) {
    const v = nums[0];
    const color = ejeY === 'sentimiento' ? v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' : 'var(--accent-gold)';
    return /*#__PURE__*/React.createElement("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: "100%",
      height: height,
      style: {
        display: 'block'
      }
    }, /*#__PURE__*/React.createElement("circle", {
      cx: W / 2,
      cy: H / 2,
      r: 6,
      fill: color,
      opacity: "0.9"
    }));
  }

  // Sentimiento → línea con baseline en y=0 (centro), verde arriba / rojo abajo
  if (ejeY === 'sentimiento') {
    const maxAbs = Math.max(1, ...nums.map(Math.abs));
    const midY = pad + cH / 2;
    const pts = nums.map((v, i) => ({
      x: pad + i / (nums.length - 1) * cW,
      y: midY - v / maxAbs * (cH / 2 - 1)
    }));
    const lastV = nums[nums.length - 1];
    const color = lastV >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    const ptStr = pts.map(p => `${p.x},${p.y}`).join(' ');
    return /*#__PURE__*/React.createElement("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: "100%",
      height: height,
      style: {
        display: 'block'
      }
    }, /*#__PURE__*/React.createElement("line", {
      x1: pad,
      x2: pad + cW,
      y1: midY,
      y2: midY,
      stroke: "var(--border)",
      strokeWidth: "0.5",
      strokeDasharray: "3,2"
    }), /*#__PURE__*/React.createElement("polyline", {
      points: ptStr,
      fill: "none",
      stroke: color,
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: pts[pts.length - 1].x,
      cy: pts[pts.length - 1].y,
      r: "2.5",
      fill: color
    }));
  }

  // Barras (tipo=bar o ejeY=frecuencia)
  if (tipo === 'bar' || ejeY === 'frecuencia') {
    const maxV = Math.max(1, ...nums);
    const sl = cW / nums.length;
    const bW = Math.max(1, sl * 0.75);
    return /*#__PURE__*/React.createElement("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: "100%",
      height: height,
      style: {
        display: 'block'
      }
    }, nums.map((v, i) => {
      const bH = v / maxV * cH;
      const x = pad + i * sl + (sl - bW) / 2;
      return /*#__PURE__*/React.createElement("rect", {
        key: i,
        x: x,
        y: pad + cH - bH,
        width: bW,
        height: Math.max(bH, 1),
        fill: "var(--accent-gold)",
        rx: "1",
        opacity: "0.85"
      });
    }));
  }

  // Línea por defecto
  const maxV = Math.max(1, ...nums);
  const pts = nums.map((v, i) => {
    const x = pad + i / (nums.length - 1) * cW;
    const y = pad + cH - v / maxV * cH;
    return `${x},${y}`;
  }).join(' ');
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    width: "100%",
    height: height,
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("polyline", {
    points: pts,
    fill: "none",
    stroke: "var(--accent-gold)",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}

// ─────────────────────────────────────────────
// TAGS CLOUD
// ─────────────────────────────────────────────
function TagsCloud({
  tags,
  activeTag,
  onTagClick
}) {
  if (!tags || tags.length === 0) return null;
  const maxC = Math.max(...tags.map(t => t.count));
  const minC = Math.min(...tags.map(t => t.count));
  const range = maxC - minC || 1;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      paddingBottom: 4
    }
  }, tags.map((t, i) => {
    const size = 10 + Math.round((t.count - minC) / range * 6);
    const isTop3 = i < 3;
    const isActive = activeTag === t.tag;
    return /*#__PURE__*/React.createElement("button", {
      key: t.tag,
      onClick: () => onTagClick(t.tag),
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: size,
        padding: '3px 9px',
        borderRadius: 20,
        border: `1px solid ${isActive ? 'var(--accent-gold)' : 'var(--border)'}`,
        background: isActive ? 'var(--accent-gold-dim)' : 'none',
        color: isTop3 || isActive ? 'var(--accent-gold)' : 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        lineHeight: 1.4
      }
    }, t.tag);
  }));
}

// ─────────────────────────────────────────────
// PATRON CARD — colapsable, diseño esencial
// ─────────────────────────────────────────────
function PatronCard({
  patron,
  cambiado,
  style
}) {
  const [expanded, setExpanded] = useState(false);
  const confDots = patron.confianza === 'alta' ? '●●●' : patron.confianza === 'media' ? '●●○' : '●○○';
  const tendIcon = patron.tendencia === 'alcista' ? '▲' : patron.tendencia === 'bajista' ? '▼' : '●';
  // Fechas: YYYY-MM-DD → DD/MM
  const fechaFmt = f => {
    const p = (f || '').split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}` : f;
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "pattern-card",
    style: style,
    onClick: () => setExpanded(e => !e)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", null, cambiado && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 9,
      fontWeight: 'bold',
      background: 'rgba(201,168,76,0.15)',
      border: '1px solid var(--accent-gold)',
      color: 'var(--accent-gold)',
      padding: '2px 7px',
      borderRadius: 4
    }
  }, "\u26A1 cambio")), /*#__PURE__*/React.createElement("span", {
    className: `pattern-confianza conf-${patron.confianza}`
  }, confDots, " ", patron.confianza)), /*#__PURE__*/React.createElement("div", {
    className: "pattern-empresa"
  }, patron.empresa), /*#__PURE__*/React.createElement("div", {
    className: "pattern-desc",
    style: !expanded ? {
      display: '-webkit-box',
      WebkitLineClamp: 1,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
      marginBottom: 8
    } : {
      marginBottom: 8
    }
  }, patron.descripcion), !expanded && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--text-muted)'
    }
  }, "\xD7", patron.frecuencia || 1, " apariciones"), /*#__PURE__*/React.createElement("span", {
    className: `tendencia-badge tend-${patron.tendencia || 'neutral'}`
  }, tendIcon, " ", patron.tendencia || 'neutral')), expanded && /*#__PURE__*/React.createElement(React.Fragment, null, patron.fechas?.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 8
    }
  }, patron.fechas.map(f => /*#__PURE__*/React.createElement("span", {
    key: f,
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 9,
      padding: '2px 6px',
      borderRadius: 3,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      color: 'var(--text-muted)'
    }
  }, fechaFmt(f)))), patron.tipo && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 9,
      color: 'var(--text-muted)',
      marginBottom: 6
    }
  }, patron.tipo), /*#__PURE__*/React.createElement("div", {
    className: "pattern-footer"
  }, /*#__PURE__*/React.createElement("span", {
    className: `tendencia-badge tend-${patron.tendencia || 'neutral'}`
  }, tendIcon, " ", patron.tendencia || 'neutral'), /*#__PURE__*/React.createElement("span", {
    className: "pattern-freq"
  }, "\xD7", patron.frecuencia || 1, " apariciones"))));
}

// ─────────────────────────────────────────────
// TAB: PATRONES
// ─────────────────────────────────────────────
function TabPatrones({
  patrones,
  resumen,
  historial,
  meta
}) {
  const [filtroTendencia, setFiltroTendencia] = useState('all');
  const [filtroConfianza, setFiltroConfianza] = useState('all');
  const [changedIds, setChangedIds] = useState(new Set());

  // Detector de cambios bruscos de confianza
  useEffect(() => {
    if (!patrones.length) return;
    const SNAP_KEY = 'pdi_patrones_snap';
    try {
      const prev = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
      if (prev) {
        const changed = new Set();
        patrones.forEach(p => {
          if (prev[p.id] && prev[p.id].confianza !== p.confianza) changed.add(p.id);
        });
        setChangedIds(changed);
      }
      const snap = {};
      patrones.forEach(p => {
        snap[p.id] = {
          confianza: p.confianza,
          frecuencia: p.frecuencia
        };
      });
      localStorage.setItem(SNAP_KEY, JSON.stringify(snap));
    } catch {}
  }, [patrones]);
  const histSlice = (historial || []).slice(-14);
  const diasCubiertos = histSlice.length;
  const altoConf = resumen?.porConfianza?.alta ?? patrones.filter(p => p.confianza === 'alta').length;
  const nCambios = changedIds.size;
  const confOrder = {
    alta: 3,
    media: 2,
    baja: 1
  };

  // Orden fijo: confianza desc, luego frecuencia desc
  const sorted = [...patrones].sort((a, b) => {
    const confDiff = (confOrder[b.confianza] || 0) - (confOrder[a.confianza] || 0);
    if (confDiff !== 0) return confDiff;
    return (b.frecuencia || 0) - (a.frecuencia || 0);
  });

  // Filtros sobre el array ya ordenado
  let filtered = sorted;
  if (filtroTendencia !== 'all') filtered = filtered.filter(p => p.tendencia === filtroTendencia);
  if (filtroConfianza !== 'all') filtered = filtered.filter(p => p.confianza === filtroConfianza);
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
    }, /*#__PURE__*/React.createElement("strong", null, "Estado:"), " ", meta.estado, /*#__PURE__*/React.createElement("br", null), meta.nota)), histSlice.length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "chart-container",
      style: {
        marginTop: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "chart-title"
    }, "Actividad diaria \xB7 ", diasCubiertos, "d"), /*#__PURE__*/React.createElement(HistorialChart, {
      data: histSlice,
      height: 100
    })));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stats-row",
    style: nCambios > 0 ? {
      gridTemplateColumns: 'repeat(4, 1fr)'
    } : {}
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--accent-gold)'
    }
  }, resumen?.totalPatrones ?? patrones.length), /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Patrones")), /*#__PURE__*/React.createElement("div", {
    className: "stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--accent-green)'
    }
  }, altoConf), /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Alta conf.")), /*#__PURE__*/React.createElement("div", {
    className: "stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--accent-blue)'
    }
  }, diasCubiertos), /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "D\xEDas")), nCambios > 0 && /*#__PURE__*/React.createElement("div", {
    className: "stat-card",
    style: {
      border: '1px solid var(--accent-gold-dim)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--accent-gold)',
      fontSize: 18
    }
  }, "\u26A1 ", nCambios), /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "cambios"))), histSlice.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "chart-container"
  }, /*#__PURE__*/React.createElement("div", {
    className: "chart-title"
  }, "Actividad diaria \xB7 ", diasCubiertos, "d"), /*#__PURE__*/React.createElement(HistorialChart, {
    data: histSlice,
    height: 100
  })), /*#__PURE__*/React.createElement("div", {
    className: "filter-bar"
  }, [['all', 'Tend.'], ['alcista', '▲ Alcista'], ['bajista', '▼ Bajista'], ['neutral', '● Neutral']].map(([v, l]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    className: `filter-chip ${filtroTendencia === v ? 'active' : ''}`,
    onClick: () => setFiltroTendencia(v)
  }, l))), /*#__PURE__*/React.createElement("div", {
    className: "filter-bar",
    style: {
      marginTop: -4
    }
  }, [['all', 'Conf.'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']].map(([v, l]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    className: `filter-chip ${filtroConfianza === v ? 'active' : ''}`,
    onClick: () => setFiltroConfianza(v)
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 6,
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--text-muted)'
    }
  }, filtered.length, " de ", patrones.length, " patrones"), filtered.map((p, i) => /*#__PURE__*/React.createElement(PatronCard, {
    key: p.id || i,
    patron: p,
    cambiado: changedIds.has(p.id),
    style: {
      animationDelay: `${i * 20}ms`
    }
  })));
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
  const [lastFetch, setLastFetch] = useState(null);
  // 'idle' | 'loading' | 'done' | 'error'
  const [fetchStatus, setFetchStatus] = useState('idle');
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
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const lastFetchTime = lastFetch ? new Date(lastFetch).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  }) : null;
  const statusText = fetchStatus === 'loading' ? 'Actualizando...' : fetchStatus === 'error' ? 'Sin conexión (caché)' : lastFetchTime ? `Actualizado ${lastFetchTime}` : '—';
  const statusColor = fetchStatus === 'loading' ? 'var(--text-muted)' : fetchStatus === 'error' ? 'var(--accent-gold)' : 'var(--accent-green)';
  const statusBarText = noticias.length > 0 ? `${noticias.length} noticias · rolling 7d · ${patrones.length} patrones 30d` : fetchStatus === 'error' ? 'Sin datos — conecta a internet para cargar' : fetchStatus === 'loading' ? 'Cargando datos...' : 'Sin datos disponibles';
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
  }, today, /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: statusColor
    }
  }, statusText))), /*#__PURE__*/React.createElement("button", {
    className: `sync-btn${fetchStatus === 'loading' ? ' syncing' : fetchStatus === 'done' ? ' synced' : ''}`,
    onClick: fetchData,
    disabled: fetchStatus === 'loading'
  }, fetchStatus === 'loading' ? '⟳ Actualizando...' : '↻ Actualizar')), /*#__PURE__*/React.createElement("div", {
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
    patronesMeta: patronesMeta,
    fetchStatus: fetchStatus
  }) : /*#__PURE__*/React.createElement(TabPatrones, {
    patrones: patrones,
    resumen: resumenStats,
    historial: historial,
    meta: patronesMeta
  }), /*#__PURE__*/React.createElement("div", {
    className: "status-bar"
  }, statusBarText));
}

// ─────────────────────────────────────────────
// Mount + Service Worker
// ─────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {
      scope: './'
    }).catch(console.error);
  });
}
