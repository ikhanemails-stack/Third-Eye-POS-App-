// Third Eye Computer Solutions - POS System
// Minimal SVG chart helpers - bar and line charts with zero external
// dependencies, styled to match the app's design tokens.

const Charts = {
  // Renders a simple bar chart. data: [{ label, value }]
  barChart(data, opts = {}) {
    const width = opts.width || 600;
    const height = opts.height || 220;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    if (!data || data.length === 0) {
      return `<div class="empty-state" style="padding:40px"><p>No data for this period.</p></div>`;
    }

    const maxVal = Math.max(...data.map(d => d.value), 1);
    const barWidth = chartW / data.length * 0.65;
    const gap = chartW / data.length;

    const bars = data.map((d, i) => {
      const barH = (d.value / maxVal) * chartH;
      const x = padding.left + i * gap + (gap - barWidth) / 2;
      const y = padding.top + chartH - barH;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barH, 1)}" rx="4" fill="url(#barGradient)">
          <title>${escapeHtml(d.label)}: ${d.value}</title>
        </rect>
        <text x="${x + barWidth / 2}" y="${padding.top + chartH + 16}" text-anchor="middle" font-size="10" fill="#8993A1" font-family="Inter, sans-serif">${escapeHtml(d.label)}</text>
        <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="10" fill="#1C2530" font-family="JetBrains Mono, monospace" font-weight="600">${opts.formatValue ? opts.formatValue(d.value) : d.value}</text>
      `;
    }).join('');

    return `
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px">
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#DAB94A"/>
            <stop offset="100%" stop-color="#C9A227"/>
          </linearGradient>
        </defs>
        <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="#E2E5EA" stroke-width="1"/>
        ${bars}
      </svg>
    `;
  },

  // Renders a simple line chart with filled area. data: [{ label, value }]
  lineChart(data, opts = {}) {
    const width = opts.width || 600;
    const height = opts.height || 220;
    const padding = { top: 20, right: 20, bottom: 36, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    if (!data || data.length === 0) {
      return `<div class="empty-state" style="padding:40px"><p>No data for this period.</p></div>`;
    }

    const maxVal = Math.max(...data.map(d => d.value), 1);
    const step = data.length > 1 ? chartW / (data.length - 1) : 0;

    const points = data.map((d, i) => {
      const x = padding.left + i * step;
      const y = padding.top + chartH - (d.value / maxVal) * chartH;
      return { x, y, d };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

    const labelStep = Math.max(1, Math.ceil(data.length / 8));
    const labels = points.filter((_, i) => i % labelStep === 0).map(p => `
      <text x="${p.x}" y="${padding.top + chartH + 18}" text-anchor="middle" font-size="9" fill="#8993A1" font-family="Inter, sans-serif">${escapeHtml(p.d.label)}</text>
    `).join('');

    const dots = points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#C9A227" stroke="#fff" stroke-width="1.5"><title>${escapeHtml(p.d.label)}: ${p.d.value}</title></circle>`).join('');

    return `
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#C9A227" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#C9A227" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="#E2E5EA" stroke-width="1"/>
        <path d="${areaPath}" fill="url(#areaGradient)"/>
        <path d="${linePath}" fill="none" stroke="#C9A227" stroke-width="2.5"/>
        ${dots}
        ${labels}
      </svg>
    `;
  },

  // Renders a simple donut/pie chart. data: [{ label, value, color }]
  donutChart(data, opts = {}) {
    const size = opts.size || 200;
    const radius = size / 2 - 10;
    const cx = size / 2, cy = size / 2;
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (!total) return `<div class="empty-state" style="padding:30px"><p>No data.</p></div>`;

    let cumulative = 0;
    const palette = ['#C9A227', '#1D5FA8', '#5B3FBF', '#1F8A4C', '#D14545', '#C97A1B'];
    const arcs = data.map((d, i) => {
      const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
      cumulative += d.value;
      const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
      const x1 = cx + radius * Math.cos(startAngle);
      const y1 = cy + radius * Math.sin(startAngle);
      const x2 = cx + radius * Math.cos(endAngle);
      const y2 = cy + radius * Math.sin(endAngle);
      const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
      const color = d.color || palette[i % palette.length];
      return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color}"><title>${escapeHtml(d.label)}: ${d.value}</title></path>`;
    }).join('');

    const legend = data.map((d, i) => `
      <div style="display:flex;align-items:center;gap:6px;font-size:0.78rem;margin-bottom:4px">
        <span style="width:10px;height:10px;border-radius:50%;background:${d.color || palette[i % palette.length]};flex-shrink:0"></span>
        <span>${escapeHtml(d.label)}</span>
        <span style="color:var(--text-muted);margin-left:auto">${d.value}</span>
      </div>
    `).join('');

    return `
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;flex-shrink:0">
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="#F5F6F8"/>
          ${arcs}
          <circle cx="${cx}" cy="${cy}" r="${radius * 0.55}" fill="#fff"/>
        </svg>
        <div style="flex:1;min-width:140px">${legend}</div>
      </div>
    `;
  }
};
