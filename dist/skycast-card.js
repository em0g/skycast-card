/*!
 * Skycast Card — Home Assistant
 * Animated sky (clouds, rain, snow, fog, lightning, stars, sun, moon) with an
 * hourly / daily forecast chart and precipitation bars on top.
 * Everything can be configured from the visual editor.
 * No dependencies: copy this single file to /config/www/ and add it as a resource.
 */
(() => {
  const VERSION = '1.0.0';
  const TAG = 'skycast-card';
  const EDITOR_TAG = 'skycast-card-editor';

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const f1 = (n) => Math.round(n * 10) / 10;
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const hex2rgb = (h) => {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const toRgb = (v) => {
    if (Array.isArray(v) && v.length >= 3 && v.every((x) => Number.isFinite(Number(x)))) return v.slice(0, 3).map(Number);
    if (typeof v === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v.trim())) return hex2rgb(v.trim());
    return null;
  };
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const pad2 = (n) => String(n).padStart(2, '0');
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 864e5);
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const toMs = (v, unit) => {
    switch (String(unit || 'km/h').toLowerCase()) {
      case 'm/s': return v;
      case 'mph': return v * 0.44704;
      case 'kn': case 'kt': case 'knots': return v * 0.514444;
      case 'ft/s': return v * 0.3048;
      default: return v / 3.6;
    }
  };
  const fromMs = (v, unit) => {
    switch (String(unit || 'km/h').toLowerCase()) {
      case 'm/s': return v;
      case 'mph': return v / 0.44704;
      case 'kn': case 'kt': case 'knots': return v / 0.514444;
      case 'ft/s': return v / 0.3048;
      default: return v * 3.6;
    }
  };
  const COMPASS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const bearingDeg = (b) => {
    if (b === null || b === undefined || b === '') return NaN;
    const n = Number(b);
    if (Number.isFinite(n)) return n;
    const i = COMPASS16.indexOf(String(b).toUpperCase());
    return i >= 0 ? i * 22.5 : NaN;
  };

  function moonPhase(date = new Date()) {
    const syn = 29.530588853;
    const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5;
    return (((days % syn) + syn) % syn) / syn; // 0 new, .5 full
  }

  // Smooth curve that never overshoots (monotone cubic, Fritsch–Carlson)
  function monotone(pts) {
    const n = pts.length;
    if (!n) return '';
    if (n === 1) return `M${f1(pts[0][0])},${f1(pts[0][1])}`;
    const dx = [], s = [], m = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1][0] - pts[i][0];
      s[i] = dx[i] === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx[i];
    }
    m[0] = s[0];
    m[n - 1] = s[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (s[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / s[i], b = m[i + 1] / s[i], h = a * a + b * b;
      if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * s[i]; m[i + 1] = t * b * s[i]; }
    }
    let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += `C${f1(pts[i][0] + h)},${f1(pts[i][1] + m[i] * h)},${f1(pts[i + 1][0] - h)},${f1(pts[i + 1][1] - m[i + 1] * h)},${f1(pts[i + 1][0])},${f1(pts[i + 1][1])}`;
    }
    return d;
  }

  function barPath(x0, x1, base, top, r) {
    r = Math.max(0, Math.min(r, (x1 - x0) / 2, base - top));
    return `M${f1(x0)},${f1(base)}V${f1(top + r)}Q${f1(x0)},${f1(top)} ${f1(x0 + r)},${f1(top)}H${f1(x1 - r)}Q${f1(x1)},${f1(top)} ${f1(x1)},${f1(top + r)}V${f1(base)}Z`;
  }

  // Temperature (°C) → colour
  const TEMP_STOPS = [
    [-20, '#b49bff'], [-10, '#7aa6ff'], [-3, '#7fd3ff'], [3, '#9cefe6'],
    [9, '#d6f58e'], [15, '#ffe27a'], [21, '#ffb45e'], [28, '#ff7a5c'], [35, '#ff4f6a'],
  ].map(([t, c]) => [t, hex2rgb(c)]);
  function tempColor(t) {
    if (!Number.isFinite(t)) return [255, 255, 255];
    if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
    for (let i = 1; i < TEMP_STOPS.length; i++) {
      const [t1, c1] = TEMP_STOPS[i];
      if (t <= t1) {
        const [t0, c0] = TEMP_STOPS[i - 1];
        return mix(c0, c1, (t - t0) / (t1 - t0));
      }
    }
    return TEMP_STOPS[TEMP_STOPS.length - 1][1];
  }

  // ---------------------------------------------------------------- texts
  const I18N = {
    sv: {
      cond: {
        'clear-night': 'Klart', cloudy: 'Mulet', exceptional: 'Extremt väder', fog: 'Dimma', hail: 'Hagel',
        lightning: 'Åska', 'lightning-rainy': 'Åska och regn', partlycloudy: 'Halvklart', pouring: 'Skyfall',
        rainy: 'Regn', snowy: 'Snö', 'snowy-rainy': 'Snöblandat regn', sunny: 'Soligt', windy: 'Blåsigt',
        'windy-variant': 'Blåsigt och molnigt',
      },
      hourly: 'Timmar', daily: 'Dagar', now: 'Nu', today: 'Idag', tomorrow: 'i morgon',
      m: {
        humidity: 'Fuktighet', wind: 'Vind', pressure: 'Lufttryck', sunrise: 'Soluppgång', sunset: 'Solnedgång',
        feels_like: 'Känns som', uv_index: 'UV-index', visibility: 'Sikt', dew_point: 'Daggpunkt',
        cloud_coverage: 'Molnighet', precipitation: 'Nederbörd/h', indoor_temperature: 'Inne', indoor_humidity: 'Fukt inne',
      },
      feels: 'Känns som', kinds: { rain: 'Regn', snow: 'Snö', sleet: 'Snöblandat', hail: 'Hagel' },
      at: (h) => `kl ${h}`,
      starts: (k, w) => `${k} väntas ${w}`,
      stops: (k, w) => `${k} upphör ${w}`,
      all: (k) => `${k} hela prognosperioden`,
      dry: (h) => `Uppehåll närmaste ${h} timmarna`,
      dryUntil: (d) => `Uppehåll till ${d}`,
      dryAll: 'Uppehåll hela perioden',
      noPrecip: 'Ingen nederbörd',
      waiting: 'Väntar på prognos…',
      missing: (e) => `Hittar inte entiteten ${e}`,
      compass: ['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV'],
      hourOnly: true,
    },
    en: {
      cond: {
        'clear-night': 'Clear', cloudy: 'Cloudy', exceptional: 'Exceptional', fog: 'Fog', hail: 'Hail',
        lightning: 'Lightning', 'lightning-rainy': 'Thunderstorm', partlycloudy: 'Partly cloudy', pouring: 'Pouring',
        rainy: 'Rain', snowy: 'Snow', 'snowy-rainy': 'Sleet', sunny: 'Sunny', windy: 'Windy',
        'windy-variant': 'Windy and cloudy',
      },
      hourly: 'Hourly', daily: 'Daily', now: 'Now', today: 'Today', tomorrow: 'tomorrow',
      m: {
        humidity: 'Humidity', wind: 'Wind', pressure: 'Pressure', sunrise: 'Sunrise', sunset: 'Sunset',
        feels_like: 'Feels like', uv_index: 'UV index', visibility: 'Visibility', dew_point: 'Dew point',
        cloud_coverage: 'Clouds', precipitation: 'Precip/h', indoor_temperature: 'Indoor', indoor_humidity: 'Indoor hum.',
      },
      feels: 'Feels like', kinds: { rain: 'Rain', snow: 'Snow', sleet: 'Sleet', hail: 'Hail' },
      at: (h) => `at ${h}`,
      starts: (k, w) => `${k} expected ${w}`,
      stops: (k, w) => `${k} stops ${w}`,
      all: (k) => `${k} throughout the forecast`,
      dry: (h) => `Dry for the next ${h} hours`,
      dryUntil: (d) => `Dry until ${d}`,
      dryAll: 'Dry throughout the forecast',
      noPrecip: 'No precipitation',
      waiting: 'Waiting for forecast…',
      missing: (e) => `Entity not found: ${e}`,
      compass: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
      hourOnly: false,
    },
  };

  // ---------------------------------------------------------------- config
  const METRICS = ['humidity', 'wind', 'pressure', 'sun', 'feels_like', 'uv_index', 'visibility', 'dew_point',
    'cloud_coverage', 'precipitation', 'indoor_temperature', 'indoor_humidity'];

  const DEFAULTS = {
    // data
    locale: 'auto',
    sun_entity: 'sun.sun',
    // size
    scale: 1,
    card_height: 0,
    padding: 14,
    temp_size: 0,
    border_radius: null,
    chart_height: 56,
    precip_height: 30,
    column_width: 0,
    icon_size: 0,
    // current weather
    show_current: true,
    header_style: 'large',
    show_name: true,
    show_condition: true,
    show_hilo: true,
    show_feels_like: true,
    temperature_decimals: null,
    show_metrics: true,
    metrics: ['humidity', 'wind', 'pressure', 'sun'],
    show_metric_icons: true,
    show_metric_labels: true,
    metrics_columns: 0,
    // forecast
    show_chart: true,
    forecast_mode: 'tabs',
    forecast_type: 'hourly',
    split: 50,
    stack_below: 560,
    hours_to_show: 0,
    days_to_show: 0,
    hourly_step: 1,
    show_time_labels: true,
    show_icons: true,
    show_temperature: true,
    show_temp_labels: true,
    show_low_temp: true,
    round_temp: false,
    show_now_highlight: true,
    show_day_separators: true,
    show_precipitation: true,
    precipitation_type: 'amount',
    show_precip_labels: true,
    show_probability: true,
    show_wind: true,
    wind_unit: 'auto',
    // nowcast
    show_nowcast: true,
    nowcast_threshold: 0.1,
    nowcast_hours: 48,
    // look
    sky_opacity: 1,
    panel_opacity: 1,
    temp_color_mode: 'gradient',
    temp_color: [255, 214, 102],
    custom_colors: false,
    precip_color: [140, 200, 255],
    text_color: [255, 255, 255],
    // animation
    animate: true,
    max_fps: 30,
    cloud_amount: 1,
    precip_amount: 1,
    wind_effect: 1,
    day_night: true,
    show_stars: true,
    shooting_stars: true,
    sun_rays: true,
    rain_splash: true,
    lightning_flash: true,
    animated_icons: true,
    chart_animation: true,
    // actions
    tap_action: { action: 'more-info' },
    hold_action: { action: 'none' },
  };

  // Accept older keys and fill defaults.
  function normalize(config) {
    const c = { ...DEFAULTS, ...config };
    if (!('forecast_mode' in config) && config.show_tabs === false) c.forecast_mode = config.forecast_type === 'daily' ? 'daily' : 'hourly';
    if (Number(config.number_of_forecasts) > 0) {
      if (!('hours_to_show' in config)) c.hours_to_show = Number(config.number_of_forecasts);
      if (!('days_to_show' in config)) c.days_to_show = Number(config.number_of_forecasts);
    }
    if (!Array.isArray(c.metrics)) c.metrics = typeof c.metrics === 'string' ? c.metrics.split(/[\s,]+/).filter(Boolean) : DEFAULTS.metrics;
    if (!c.sun_entity) c.sun_entity = DEFAULTS.sun_entity;
    return c;
  }

  // ---------------------------------------------------------------- scenes
  const COND_SCENE = {
    'clear-night': 'clear', sunny: 'clear', partlycloudy: 'partly', cloudy: 'cloudy', fog: 'fog',
    rainy: 'rain', pouring: 'pour', lightning: 'thunder', 'lightning-rainy': 'storm', snowy: 'snow',
    'snowy-rainy': 'sleet', hail: 'hail', windy: 'windy', 'windy-variant': 'windyc', exceptional: 'storm',
  };
  const SCENES = {
    clear:   { pal: 'clear',  clouds: 0, tint: 'light', sun: 1,    stars: 1,   moon: 1 },
    partly:  { pal: 'partly', clouds: 4, tint: 'light', sun: 0.9,  stars: 0.7, moon: 0.85 },
    cloudy:  { pal: 'cloudy', clouds: 8, tint: 'grey',  sun: 0.12, stars: 0.05, moon: 0.15 },
    fog:     { pal: 'fog',    clouds: 3, tint: 'grey',  sun: 0.25, stars: 0,   moon: 0.15, fog: true },
    rain:    { pal: 'rain',   clouds: 7, tint: 'grey',  sun: 0,    stars: 0,   moon: 0, precip: 'rain', intensity: 0.8 },
    pour:    { pal: 'rain',   clouds: 8, tint: 'dark',  sun: 0,    stars: 0,   moon: 0, precip: 'rain', intensity: 6 },
    thunder: { pal: 'storm',  clouds: 8, tint: 'dark',  sun: 0,    stars: 0,   moon: 0, lightning: true },
    storm:   { pal: 'storm',  clouds: 8, tint: 'dark',  sun: 0,    stars: 0,   moon: 0, precip: 'rain', intensity: 3, lightning: true },
    snow:    { pal: 'snow',   clouds: 6, tint: 'grey',  sun: 0.1,  stars: 0,   moon: 0.1, precip: 'snow', intensity: 1 },
    sleet:   { pal: 'rain',   clouds: 7, tint: 'grey',  sun: 0,    stars: 0,   moon: 0, precip: 'sleet', intensity: 1 },
    hail:    { pal: 'storm',  clouds: 7, tint: 'dark',  sun: 0,    stars: 0,   moon: 0, precip: 'hail', intensity: 2 },
    windy:   { pal: 'windy',  clouds: 4, tint: 'light', sun: 0.85, stars: 0.6, moon: 0.8, wind: true },
    windyc:  { pal: 'cloudy', clouds: 7, tint: 'grey',  sun: 0.12, stars: 0.05, moon: 0.1, wind: true },
  };
  // [top, middle, bottom] for day / twilight / night
  const PALETTES = {
    clear:  { day: ['#1b5fc4', '#3d8de0', '#86c5f4'], twi: ['#27397a', '#9a5f8f', '#f3a56c'], night: ['#060c22', '#0e1b42', '#1f3466'] },
    partly: { day: ['#2766b8', '#4b8fd3', '#95c3ea'], twi: ['#2f3c76', '#90688c', '#e3a07c'], night: ['#0a132e', '#152347', '#283b63'] },
    cloudy: { day: ['#4f6178', '#6e8198', '#9cacbf'], twi: ['#434866', '#73667f', '#a78a8c'], night: ['#121926', '#1d2738', '#2f3b51'] },
    fog:    { day: ['#6b7683', '#8c97a3', '#b3bcc6'], twi: ['#5a5d72', '#827a8b', '#ae9b9b'], night: ['#1a1f26', '#272d35', '#3b424b'] },
    rain:   { day: ['#38475c', '#506179', '#77889f'], twi: ['#333953', '#57526e', '#837083'], night: ['#0e131c', '#18202d', '#273142'] },
    storm:  { day: ['#22273a', '#353c53', '#565d75'], twi: ['#1f1c33', '#3a304d', '#5f4a6a'], night: ['#06070e', '#0f111c', '#1c2032'] },
    snow:   { day: ['#5a6f8d', '#7b90ab', '#a9b9cc'], twi: ['#50577a', '#857a97', '#bca2b1'], night: ['#141c2d', '#202d45', '#364662'] },
    windy:  { day: ['#2a70c0', '#5196d6', '#9acaeb'], twi: ['#2f3c76', '#90688c', '#e3a07c'], night: ['#0a132e', '#152347', '#283b63'] },
  };
  const PAL_RGB = {};
  for (const [k, v] of Object.entries(PALETTES)) {
    PAL_RGB[k] = { day: v.day.map(hex2rgb), twi: v.twi.map(hex2rgb), night: v.night.map(hex2rgb) };
  }

  function phaseWeights(elev) {
    const day = smooth(-1, 10, elev);
    const night = 1 - smooth(-12, -3, elev);
    const twi = Math.max(0, 1 - day - night);
    return { day, twi, night };
  }

  // ---------------------------------------------------------------- sprites
  function cloudTint(kind, nightW, twiW) {
    const base = { light: ['#f3f6fb', '#bfcadb'], grey: ['#d9dfe8', '#8691a4'], dark: ['#959eb2', '#3f4659'] }[kind] ||
      ['#f3f6fb', '#bfcadb'];
    let hi = hex2rgb(base[0]), lo = hex2rgb(base[1]);
    if (twiW > 0) {
      hi = mix(hi, [255, 196, 168], 0.5 * twiW * (kind === 'light' ? 1 : 0.45));
      lo = mix(lo, [140, 100, 135], 0.4 * twiW);
    }
    if (nightW > 0) {
      hi = mix(hi, [68, 80, 108], 0.72 * nightW);
      lo = mix(lo, [22, 27, 42], 0.72 * nightW);
    }
    return { hi, lo };
  }

  function makeCloud(tint, seed) {
    const W = 300, H = 150;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const r = rng(seed * 7919 + 13);
    const n = 9 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const bump = Math.sin(Math.PI * t);
      const x = 48 + t * 204 + (r() - 0.5) * 22;
      const y = 102 - bump * (30 + r() * 16) + (r() - 0.5) * 10;
      const rad = 24 + bump * 28 + r() * 12;
      const gr = g.createRadialGradient(x, y - rad * 0.3, rad * 0.05, x, y, rad);
      gr.addColorStop(0, rgba(tint.hi, 0.95));
      gr.addColorStop(0.55, rgba(tint.hi, 0.7));
      gr.addColorStop(1, rgba(tint.hi, 0));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-atop';
    const lg = g.createLinearGradient(0, 45, 0, 135);
    lg.addColorStop(0, rgba(tint.hi, 0));
    lg.addColorStop(1, rgba(tint.lo, 0.9));
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
    return cv;
  }

  function makeSoftDot(size = 32) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return cv;
  }

  function makeFog() {
    const W = 520, H = 130;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(1, H / W);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, W / 2);
    gr.addColorStop(0, 'rgba(226,231,238,.9)');
    gr.addColorStop(0.5, 'rgba(226,231,238,.45)');
    gr.addColorStop(1, 'rgba(226,231,238,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, W / 2, 0, Math.PI * 2);
    g.fill();
    g.restore();
    return cv;
  }

  function makeBolt(w, h) {
    const R = Math.random;
    const main = [];
    let x = w * (0.15 + R() * 0.7), y = -4;
    const end = h * (0.5 + R() * 0.35);
    main.push([x, y]);
    while (y < end) {
      y += 10 + R() * 18;
      x += (R() - 0.5) * 28;
      main.push([x, y]);
    }
    const branches = [];
    const nb = 1 + Math.floor(R() * 2);
    for (let b = 0; b < nb; b++) {
      const start = main[2 + Math.floor(R() * Math.max(1, main.length - 4))] || main[1];
      let [bx, by] = start;
      const dir = R() < 0.5 ? -1 : 1;
      const br = [[bx, by]];
      for (let i = 0; i < 4 + R() * 4; i++) {
        by += 8 + R() * 12;
        bx += dir * (6 + R() * 14);
        br.push([bx, by]);
      }
      branches.push(br);
    }
    return { main, branches };
  }

  // ---------------------------------------------------------------- sky engine
  class SkyFX {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.w = 0; this.h = 0; this.dpr = 1;
      this.s = null; this.key = '';
      this.raf = 0; this.last = 0; this.t = 0; this.fps = 30;
      this.stars = []; this.clouds = []; this.drops = []; this.flakes = []; this.hail = [];
      this.splash = []; this.fogs = []; this.streaks = [];
      this.flashT = -1; this.bolt = null; this.nextStrike = 2.5;
      this.shoot = null; this.nextShoot = 6;
      this.dot = null; this.fogImg = null;
      this._tick = this._tick.bind(this);
    }

    resize(w, h) {
      w = Math.round(w); h = Math.round(h);
      if (w < 4 || h < 4) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (w === this.w && h === this.h && dpr === this.dpr) return;
      this.w = w; this.h = h; this.dpr = dpr;
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this._populate();
      if (!this.raf) this.draw(0);
    }

    setScene(s) {
      this.s = s;
      const key = [s.kind, s.tint, s.precip, s.clouds, Math.round(s.intensity * 4), Math.round(s.nightW * 5),
        Math.round(s.twiW * 5), s.fog, s.wind, s.precipMul].join('|');
      if (key !== this.key) { this.key = key; this._populate(); }
      if (!this.raf) this.draw(0);
    }

    start() {
      if (this.raf || !this.s) return;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this._tick);
    }

    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    _tick(now) {
      this.raf = requestAnimationFrame(this._tick);
      const el = now - this.last;
      if (el < 1000 / this.fps - 4) return;
      this.last = now;
      this.draw(Math.min(el, 70) / 1000);
    }

    _populate() {
      const s = this.s;
      if (!s || !this.w) return;
      const { w, h } = this;
      const R = Math.random;
      const area = clamp((w * h) / (420 * 320), 0.35, 3.2);
      const pm = s.precipMul;

      this.stars = [];
      for (let i = 0, n = Math.round(85 * area); i < n; i++) {
        this.stars.push({ x: R() * w, y: R() * h * 0.8, r: 0.35 + R() * R() * 1.3, b: 0.3 + R() * 0.7, sp: 0.5 + R() * 2.4, ph: R() * 6.283 });
      }

      const tint = cloudTint(s.tint, s.nightW, s.twiW);
      const sprites = [1, 2, 3, 4].map((i) => makeCloud(tint, i));
      this.clouds = [];
      const base = clamp(w / 460, 0.6, 1.9);
      for (let i = 0; i < s.clouds; i++) {
        const front = i % 3 === 2;
        const sc = base * (0.55 + R() * 0.65) * (front ? 1.15 : 1);
        this.clouds.push({
          img: sprites[i % 4], sc, front,
          x: R() * (w + 300 * sc) - 300 * sc,
          y: -45 * sc + R() * h * (s.clouds > 5 ? 0.3 : 0.36),
          v: 0.7 + R() * 0.6,
          a: (front ? 0.88 : 0.72) * (0.82 + R() * 0.18) * (s.tint === 'light' ? 0.88 : 1),
        });
      }

      const iF = clamp(0.35 + Math.log2(1 + s.intensity) * 0.55, 0.3, 2.8);
      this.drops = []; this.flakes = []; this.hail = []; this.splash = [];
      if (s.precip === 'rain' || s.precip === 'sleet' || s.precip === 'hail') {
        const n = Math.round(110 * area * iF * pm * (s.precip === 'rain' ? 1 : 0.45));
        for (let i = 0; i < n; i++) this.drops.push({ x: R() * w * 1.3 - w * 0.25, y: R() * h, z: 0.45 + R() * 0.55 });
      }
      if (s.precip === 'snow' || s.precip === 'sleet') {
        const n = Math.round(85 * area * pm * clamp(0.5 + Math.log2(1 + s.intensity) * 0.5, 0.4, 2.2) * (s.precip === 'snow' ? 1 : 0.5));
        for (let i = 0; i < n; i++) {
          this.flakes.push({ x: R() * w, y: R() * h, r: 0.8 + R() * R() * 2.6, ph: R() * 6.283, f: 0.4 + R() * 1.1, amp: 8 + R() * 22 });
        }
      }
      if (s.precip === 'hail') {
        for (let i = 0, n = Math.round(45 * area * pm); i < n; i++) {
          this.hail.push({ x: R() * w, y: R() * h, r: 1.2 + R() * 1.6, vy: 520 + R() * 220, b: false });
        }
      }

      this.fogs = s.fog
        ? [0, 1, 2, 3, 4].map((i) => ({ y: h * (0.18 + i * 0.18), x: R() * w, v: 6 + R() * 12, a: 0.22 + R() * 0.28, sc: clamp(w / 380, 0.8, 2.2) * (0.8 + R() * 0.5) }))
        : [];
      this.streaks = s.wind ? Array.from({ length: Math.round(5 * clamp(area, 0.6, 2)) }, () => this._streak(true)) : [];
    }

    _streak(init) {
      const { w, h } = this;
      const R = Math.random;
      return { x: init ? R() * w : -R() * w * 0.6, y: h * (0.08 + R() * 0.8), len: 60 + R() * 150, v: 260 + R() * 260, amp: 3 + R() * 9, a: 0.14 + R() * 0.22 };
    }

    draw(dt) {
      const s = this.s;
      if (!s || !this.w) return;
      const { ctx, w, h } = this;
      this.t += dt;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (s.starA > 0.01) this._stars(dt);
      if (s.moonA > 0.01) this._moon();
      if (s.sunA > 0.01) this._sun();
      this._clouds(dt, false);
      if (this.fogs.length) this._fog(dt);
      if (this.drops.length) this._rain(dt);
      if (this.flakes.length) this._snow(dt);
      if (this.hail.length) this._hail(dt);
      if (this.splash.length) this._splash(dt);
      this._clouds(dt, true);
      if (this.streaks.length) this._wind(dt);
      if (s.lightning) this._lightning(dt);
    }

    _stars(dt) {
      const { ctx, s } = this;
      const t = this.t;
      ctx.fillStyle = '#ffffff';
      for (const st of this.stars) {
        const a = s.starA * st.b * (0.55 + 0.45 * Math.sin(t * st.sp + st.ph));
        if (a < 0.03) continue;
        ctx.globalAlpha = a;
        if (st.r > 1) {
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.r, 0, 6.283);
          ctx.fill();
        } else {
          ctx.fillRect(st.x - st.r, st.y - st.r, st.r * 2, st.r * 2);
        }
      }
      ctx.globalAlpha = 1;
      if (s.shoot && s.starA > 0.5 && this.raf) {
        this.nextShoot -= dt;
        if (!this.shoot && this.nextShoot <= 0) {
          this.shoot = { x: Math.random() * this.w * 0.6, y: Math.random() * this.h * 0.25, vx: 380 + Math.random() * 220, vy: 120 + Math.random() * 90, t: 0, life: 0.9 };
          this.nextShoot = 9 + Math.random() * 18;
        }
        const p = this.shoot;
        if (p) {
          p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
          const a = Math.sin(Math.PI * clamp(p.t / p.life, 0, 1)) * s.starA;
          const tx = p.x - p.vx * 0.2, ty = p.y - p.vy * 0.2;
          const g = ctx.createLinearGradient(tx, ty, p.x, p.y);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(1, `rgba(255,255,255,${0.85 * a})`);
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
          if (p.t > p.life) this.shoot = null;
        }
      }
    }

    _sun() {
      const { ctx, w, h, s } = this;
      const sx = s.sunX * w, sy = s.sunY * h, a = s.sunA;
      const warm = s.sunWarm;
      const R = Math.max(w, h) * 0.55;
      const glow = mix([255, 228, 165], [255, 150, 92], warm);
      const core = mix([255, 250, 228], [255, 196, 130], warm);
      let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      g.addColorStop(0, rgba(glow, 0.55 * a));
      g.addColorStop(0.12, rgba(glow, 0.28 * a));
      g.addColorStop(0.4, rgba(glow, 0.08 * a));
      g.addColorStop(1, rgba(glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (s.rays) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.t * 0.04);
        const rg = ctx.createRadialGradient(0, 0, R * 0.04, 0, 0, R * 0.62);
        rg.addColorStop(0, rgba(glow, 0.13 * a));
        rg.addColorStop(0.5, rgba(glow, 0.05 * a));
        rg.addColorStop(1, rgba(glow, 0));
        ctx.fillStyle = rg;
        for (let i = 0; i < 10; i++) {
          ctx.rotate(Math.PI / 5);
          const L = R * (i % 2 ? 0.4 : 0.62);
          const half = L * (i % 2 ? 0.035 : 0.05);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(L, -half);
          ctx.lineTo(L, half);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      const r = clamp(Math.min(w, h) * 0.05, 12, 26);
      g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 1.6);
      g.addColorStop(0, rgba(core, a));
      g.addColorStop(0.6, rgba(core, 0.95 * a));
      g.addColorStop(1, rgba(core, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 1.6, 0, 6.283);
      ctx.fill();
      if (s.rays) {
        const fx = w * 0.5 - sx, fy = h * 0.55 - sy;
        ctx.fillStyle = rgba(glow, 0.07 * a);
        for (const [k, rr] of [[0.45, 10], [0.7, 18], [0.85, 6]]) {
          ctx.beginPath();
          ctx.arc(sx + fx * k, sy + fy * k, rr, 0, 6.283);
          ctx.fill();
        }
      }
    }

    _moon() {
      const { ctx, w, h, s } = this;
      const mx = s.moonX * w, my = s.moonY * h, a = s.moonA;
      const r = clamp(Math.min(w, h) * 0.045, 10, 20);
      const p = s.moonPhase;
      const lit = 1 - Math.abs(p - 0.5) * 2;
      const g = ctx.createRadialGradient(mx, my, r * 0.5, mx, my, r * 6);
      g.addColorStop(0, `rgba(215,225,255,${0.28 * a * (0.35 + 0.65 * lit)})`);
      g.addColorStop(1, 'rgba(215,225,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(mx - r * 6, my - r * 6, r * 12, r * 12);
      ctx.fillStyle = `rgba(200,210,235,${0.1 * a})`;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, 6.283);
      ctx.fill();
      ctx.save();
      ctx.translate(mx, my);
      if (p > 0.5) ctx.scale(-1, 1);
      const k = Math.cos(2 * Math.PI * p);
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
      ctx.ellipse(0, 0, Math.max(0.01, r * Math.abs(k)), r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
      ctx.closePath();
      ctx.fillStyle = `rgba(246,243,228,${a})`;
      ctx.shadowColor = 'rgba(235,240,255,.8)';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    }

    _clouds(dt, front) {
      const { ctx, w, s } = this;
      const v0 = 5 + s.windMs * 3.2;
      for (const c of this.clouds) {
        if (c.front !== front) continue;
        c.x += v0 * c.v * (front ? 1.25 : 1) * dt;
        const cw = 300 * c.sc, ch = 150 * c.sc;
        if (c.x > w + 10) c.x = -cw - Math.random() * 80;
        ctx.globalAlpha = c.a;
        ctx.drawImage(c.img, c.x, c.y, cw, ch);
      }
      ctx.globalAlpha = 1;
    }

    _fog(dt) {
      const { ctx, w } = this;
      const img = this.fogImg || (this.fogImg = makeFog());
      for (const f of this.fogs) {
        const fw = 520 * f.sc, fh = 130 * f.sc, step = fw * 0.7;
        f.x = (f.x + f.v * dt) % step;
        ctx.globalAlpha = f.a;
        for (let x = f.x - step; x < w; x += step) ctx.drawImage(img, x, f.y - fh / 2, fw, fh);
      }
      ctx.globalAlpha = 1;
    }

    _rain(dt) {
      const { ctx, w, h, s } = this;
      const vx0 = clamp(s.windMs * 16, 0, 260);
      const col = s.nightW > 0.5 ? '175,195,235' : '220,233,255';
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        ctx.lineWidth = pass ? 1.4 : 0.9;
        ctx.strokeStyle = `rgba(${col},${pass ? 0.55 : 0.3})`;
        for (const d of this.drops) {
          if ((d.z > 0.75) !== (pass === 1)) continue;
          const vy = 650 + 550 * d.z, vx = vx0 * d.z;
          d.y += vy * dt;
          d.x += vx * dt;
          const len = 9 + 16 * d.z;
          if (d.y - len > h) {
            if (s.splash && pass && dt > 0 && this.splash.length < 150 && Math.random() < 0.6) this._addSplash(d.x, h - 1 - Math.random() * 3);
            d.y = -Math.random() * 60;
            d.x = Math.random() * w * 1.3 - w * 0.25 - vx0 * 0.3;
          }
          const k = len / vy;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - vx * k, d.y - len);
        }
        ctx.stroke();
      }
    }

    _addSplash(x, y) {
      const n = 2 + ((Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) {
        this.splash.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: -60 - Math.random() * 110, life: 0.3 + Math.random() * 0.2, t: 0 });
      }
    }

    _splash(dt) {
      const { ctx, s } = this;
      ctx.fillStyle = s.nightW > 0.5 ? 'rgb(180,198,236)' : 'rgb(228,238,255)';
      const arr = this.splash;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.t += dt;
        if (p.t > p.life) { arr[i] = arr[arr.length - 1]; arr.pop(); continue; }
        p.vy += 900 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = 0.6 * (1 - p.t / p.life);
        ctx.fillRect(p.x, p.y, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    }

    _snow(dt) {
      const { ctx, w, h, s } = this;
      const t = this.t;
      const drift = s.windMs * 7;
      const img = this.dot || (this.dot = makeSoftDot());
      for (const f of this.flakes) {
        f.y += (14 + f.r * 16) * dt;
        f.x += (drift * (0.4 + f.r / 3.4) + Math.cos(t * f.f + f.ph) * f.amp * 0.5) * dt;
        if (f.y > h + 6) { f.y = -6; f.x = Math.random() * (w + 40) - 20 - drift * 0.5; }
        if (f.x > w + 8) f.x = -8; else if (f.x < -8) f.x = w + 8;
        const d = f.r * 3.4;
        ctx.globalAlpha = clamp(0.5 + f.r * 0.16, 0, 1);
        ctx.drawImage(img, f.x - d / 2, f.y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
    }

    _hail(dt) {
      const { ctx, w, h, s } = this;
      ctx.fillStyle = 'rgba(236,244,255,.9)';
      ctx.beginPath();
      for (const p of this.hail) {
        p.y += p.vy * dt;
        p.x += s.windMs * 8 * dt;
        if (!p.b && p.y > h - p.r) { p.b = true; p.vy = -p.vy * 0.28; p.y = h - p.r; }
        else if (p.b) {
          p.vy += 1400 * dt;
          if (p.y > h + 4) { p.y = -Math.random() * 80; p.x = Math.random() * w; p.b = false; p.vy = 520 + Math.random() * 220; }
        }
        ctx.moveTo(p.x + p.r, p.y);
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
      }
      ctx.fill();
    }

    _wind(dt) {
      const { ctx, w, s } = this;
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      for (let i = 0; i < this.streaks.length; i++) {
        const k = this.streaks[i];
        k.x += (k.v + s.windMs * 12) * dt;
        if (k.x - k.len > w) { this.streaks[i] = this._streak(false); continue; }
        const g = ctx.createLinearGradient(k.x - k.len, 0, k.x, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.7, `rgba(255,255,255,${k.a})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(k.x - k.len, k.y);
        ctx.quadraticCurveTo(k.x - k.len * 0.5, k.y - k.amp, k.x, k.y + k.amp * 0.3);
        ctx.stroke();
      }
    }

    _lightning(dt) {
      if (!this.raf) return;
      const { ctx, w, h, s } = this;
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.flashT = 0;
        this.bolt = makeBolt(w, h);
        this.nextStrike = 3 + Math.random() * 7;
      }
      if (this.flashT < 0) return;
      this.flashT += dt;
      const t = this.flashT;
      let a = 0;
      if (t < 0.05) a = (t / 0.05) * 0.55;
      else if (t < 0.11) a = lerp(0.55, 0.08, (t - 0.05) / 0.06);
      else if (t < 0.16) a = lerp(0.08, 0.38, (t - 0.11) / 0.05);
      else if (t < 0.6) a = lerp(0.38, 0, (t - 0.16) / 0.44);
      else { this.flashT = -1; this.bolt = null; return; }
      if (this.bolt && t < 0.4) {
        const ba = 1 - t / 0.4;
        ctx.save();
        ctx.shadowColor = 'rgba(175,195,255,1)';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = `rgba(255,255,255,${ba})`;
        ctx.lineJoin = 'round';
        const line = (pts, lw) => {
          ctx.lineWidth = lw;
          ctx.beginPath();
          pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        };
        line(this.bolt.main, 2.2);
        this.bolt.branches.forEach((b) => line(b, 1));
        ctx.restore();
      }
      if (s.flash) {
        ctx.fillStyle = `rgba(225,232,255,${a})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  // ---------------------------------------------------------------- forecast icons (32×32)
  function icon(cond, night) {
    const sun = (cx, cy, s) =>
      `<g transform="translate(${cx},${cy}) scale(${s})"><g class="rays"><path d="M0,-14V-10.6M0,14V10.6M-14,0H-10.6M14,0H10.6M-9.9,-9.9L-7.5,-7.5M9.9,9.9L7.5,7.5M-9.9,9.9L-7.5,7.5M9.9,-9.9L7.5,-7.5" stroke="#ffd25e" stroke-width="2.2" stroke-linecap="round" fill="none"/></g><circle r="7" fill="url(#lcSun)"/></g>`;
    const moon = (cx, cy, s) =>
      `<g transform="translate(${cx},${cy}) scale(${s})"><path d="M2.5,-9.5A9.5,9.5 0 1 0 9.6,4.6A9,9 0 0 1 2.5,-9.5Z" fill="url(#lcMoon)"/></g>`;
    const cloud = (fill, tx, ty, s) =>
      `<g transform="translate(${tx},${ty}) scale(${s})"><g class="bob"><g fill="url(#${fill})"><circle cx="10.5" cy="19.5" r="5.5"/><circle cx="16.5" cy="15" r="7.5"/><circle cx="23" cy="19.5" r="5.5"/><rect x="10.5" y="17" width="12.5" height="8" /></g></g></g>`;
    const drops = (n, heavy) => {
      const xs = n === 2 ? [13, 21] : n === 3 ? [11.5, 17, 22.5] : [9, 13.5, 18, 22.5, 27];
      return xs.map((x, i) => `<line class="drop" style="animation-delay:${(i * 0.27).toFixed(2)}s" x1="${x}" y1="25" x2="${x - 1.4}" y2="29" stroke="#86c8ff" stroke-width="${heavy ? 2.2 : 1.8}" stroke-linecap="round"/>`).join('');
    };
    const flakes = (xs) => xs.map((x, i) => `<circle class="flake" style="animation-delay:${(i * 0.6).toFixed(2)}s" cx="${x}" cy="27.5" r="1.5" fill="#ffffff"/>`).join('');
    const hail = () => [11.5, 17, 22.5].map((x, i) => `<circle class="drop" style="animation-delay:${(i * 0.3).toFixed(2)}s" cx="${x}" cy="27.5" r="1.7" fill="#eaf4ff" stroke="#9fc6ee" stroke-width=".6"/>`).join('');
    const bolt = '<path class="bolt" d="M17.5,20.5 13,27.5H16.4L14.6,32.5 21,24.6H17.6L19.5,20.5Z" fill="#ffd84a" stroke="#ffb020" stroke-width=".5" stroke-linejoin="round"/>';
    const fogl = '<g class="fogl"><path d="M6,25H26M9,29H23" stroke="#e8edf3" stroke-width="2" stroke-linecap="round"/></g>';
    const windl = (y0) => `<g class="fogl"><path d="M4,${y0}H18.5A3,3 0 1 0 15.5,${y0 - 3} M4,${y0 + 5}H23A3,3 0 1 1 20,${y0 + 8} M4,${y0 + 10}H13" stroke="#ffffff" stroke-width="2" stroke-linecap="round" fill="none"/></g>`;
    switch (cond) {
      case 'sunny': return sun(16, 16, 1);
      case 'clear-night':
        return moon(15, 16, 1.05) + '<circle class="twk" cx="25" cy="7" r="1" fill="#fff"/><circle class="twk" style="animation-delay:1.1s" cx="27" cy="14" r=".7" fill="#fff"/>';
      case 'partlycloudy':
        return (night ? moon(12, 11, 0.72) : sun(11.5, 11, 0.74)) + cloud('lcCL', 2.5, 3, 0.92);
      case 'cloudy': return cloud('lcCG', -3.5, -3.5, 0.78) + cloud('lcCL', 1, 1.5, 0.95);
      case 'fog': return cloud('lcCG', 0, -4, 1) + fogl;
      case 'rainy': return cloud('lcCG', 0, -4, 1) + drops(3);
      case 'pouring': return cloud('lcCD', 0, -4, 1) + drops(5, true);
      case 'lightning': return cloud('lcCD', 0, -4, 1) + bolt;
      case 'lightning-rainy':
        return cloud('lcCD', 0, -4, 1) + `<line class="drop" x1="10" y1="25" x2="8.6" y2="29" stroke="#86c8ff" stroke-width="1.8" stroke-linecap="round"/><line class="drop" style="animation-delay:.4s" x1="25" y1="25" x2="23.6" y2="29" stroke="#86c8ff" stroke-width="1.8" stroke-linecap="round"/>` + bolt;
      case 'snowy': return cloud('lcCG', 0, -4, 1) + flakes([11.5, 17, 22.5]);
      case 'snowy-rainy':
        return cloud('lcCG', 0, -4, 1) + flakes([11.5, 22.5]) + `<line class="drop" style="animation-delay:.3s" x1="17.5" y1="25" x2="16.1" y2="29" stroke="#86c8ff" stroke-width="1.8" stroke-linecap="round"/>`;
      case 'hail': return cloud('lcCD', 0, -4, 1) + hail();
      case 'windy': return windl(11);
      case 'windy-variant': return cloud('lcCL', 3, -6, 0.85) + windl(19);
      case 'exceptional':
        return '<path d="M16,5 29,27H3Z" fill="#ffb020" stroke="#ff8a00" stroke-width="1.2" stroke-linejoin="round"/><path d="M16,12V19.5M16,23v.4" stroke="#3a2a00" stroke-width="2.4" stroke-linecap="round"/>';
      default: return cloud('lcCL', 0, 0, 1);
    }
  }

  const SVG_ICONS = {
    humidity: '<path d="M8 2.2C8 2.2 3.6 7 3.6 10a4.4 4.4 0 0 0 8.8 0C12.4 7 8 2.2 8 2.2z"/>',
    wind: '<path d="M1.8 6.2h8.4a2.2 2.2 0 1 0-2.2-2.2M1.8 9.6h11a2.2 2.2 0 1 1-2.2 2.2M1.8 13h5"/>',
    pressure: '<path d="M2.6 12.4a6.2 6.2 0 1 1 10.8 0M8 9.4l2.7-3.3"/><circle cx="8" cy="9.6" r=".9"/>',
    sunset: '<path d="M1.5 13.5h13M4.4 13.5a3.6 3.6 0 0 1 7.2 0M8 2.3v4.6M5.9 5 8 7l2.1-2"/>',
    sunrise: '<path d="M1.5 13.5h13M4.4 13.5a3.6 3.6 0 0 1 7.2 0M8 7V2.4M5.9 4.4 8 2.3l2.1 2.1"/>',
    umbrella: '<path d="M8 1.8a6.4 6.4 0 0 1 6.4 6.4H1.6A6.4 6.4 0 0 1 8 1.8zM8 8.2v4.6a1.6 1.6 0 0 1-3.2 0"/>',
    dry: '<path d="M8 2.2C8 2.2 3.6 7 3.6 10a4.4 4.4 0 0 0 8.8 0C12.4 7 8 2.2 8 2.2zM2.5 2.5l11 11.5"/>',
    thermo: '<path d="M6.5 9.6V3a1.5 1.5 0 0 1 3 0v6.6a3 3 0 1 1-3 0z"/>',
    uv: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
    eye: '<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    cloud: '<path d="M4.5 12.5h7a2.8 2.8 0 0 0 .3-5.6 4 4 0 0 0-7.6.9 2.4 2.4 0 0 0 .3 4.7z"/>',
    rain: '<path d="M5 2.5 3.6 6.5M9 2.5 7.6 6.5M13 2.5l-1.4 4M5 9 3.6 13M9 9l-1.4 4"/>',
    home: '<path d="M2.5 7.5 8 3l5.5 4.5V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5z"/>',
  };
  const svgI = (k) => `<svg viewBox="0 0 16 16" aria-hidden="true">${SVG_ICONS[k]}</svg>`;

  // ---------------------------------------------------------------- styles
  const S = (px) => `calc(${px}px * var(--lc-s, 1))`;
  const CSS = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; display: block; height: 100%; box-sizing: border-box; overflow: hidden; isolation: isolate;
  border-radius: var(--lc-radius, var(--ha-card-border-radius, 16px)); border: none;
  background: #22324f; color: var(--lc-text, #fff);
  box-shadow: var(--ha-card-box-shadow, 0 6px 24px rgba(20,30,60,.18));
  font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, Roboto, "Segoe UI", system-ui, sans-serif));
  -webkit-font-smoothing: antialiased;
}
.skywrap { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.sky { position: absolute; inset: 0; opacity: 0; transition: opacity 2.4s ease; }
canvas.fx { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }
.content { position: relative; z-index: 2; padding: var(--lc-pad, 14px) var(--lc-pad, 14px) calc(var(--lc-pad, 14px) * .75); display: flex; flex-direction: column; gap: ${S(10)}; text-shadow: 0 1px 3px rgba(0,10,30,.38), 0 0 1px rgba(0,10,30,.2); -webkit-tap-highlight-color: transparent; }
.content.tappable { cursor: pointer; }
.content.only-current { height: 100%; box-sizing: border-box; justify-content: center; }
.header { display: flex; align-items: flex-start; justify-content: space-between; gap: ${S(14)}; }
.header:empty { display: none; }
.main { min-width: 0; }
.place { font-size: ${S(11.5)}; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; opacity: .82; margin-bottom: ${S(3)}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.temp { display: flex; align-items: flex-start; line-height: .9; font-weight: 200; letter-spacing: -.02em; }
.temp .i { font-size: var(--lc-temp, 66px); }
.temp .d { font-size: calc(var(--lc-temp, 66px) * .42); font-weight: 300; margin-top: calc(var(--lc-temp, 66px) * .075); letter-spacing: 0; }
.temp .u { font-size: calc(var(--lc-temp, 66px) * .45); font-weight: 200; margin-top: calc(var(--lc-temp, 66px) * .045); margin-left: 1px; }
.cond { font-size: ${S(16)}; font-weight: 500; margin-top: ${S(7)}; }
.sub { font-size: ${S(12.5)}; opacity: .86; margin-top: ${S(3)}; display: flex; flex-wrap: wrap; gap: ${S(2)} ${S(10)}; }
.metrics { display: grid; grid-template-columns: var(--lc-mcols, repeat(2, auto)); gap: ${S(11)} ${S(18)}; padding: ${S(10)} ${S(13)}; border-radius: ${S(14)}; background: var(--lc-box-bg, rgba(6,18,44,.2)); box-shadow: inset 0 0 0 1px var(--lc-box-line, rgba(255,255,255,.1)); }
.metric { display: flex; align-items: flex-start; gap: ${S(7)}; min-width: 0; }
.metric svg, .nowcast svg { width: ${S(16)}; height: ${S(16)}; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 1px 1px rgba(0,10,30,.3)); }
.metric svg { margin-top: 1px; opacity: .92; }
.metric .v { font-size: ${S(14.5)}; font-weight: 500; white-space: nowrap; }
.metric .v small { font-size: ${S(11)}; opacity: .8; font-weight: 400; }
.metric .l { font-size: ${S(10)}; letter-spacing: .07em; text-transform: uppercase; opacity: .72; margin-top: ${S(2)}; white-space: nowrap; }
.no-micons .metric svg { display: none; }
.no-mlabels .metric .l { display: none; }
.narrow .header { flex-direction: column; gap: ${S(12)}; }
.narrow .metrics { grid-template-columns: var(--lc-mcols, repeat(4, auto)); gap: ${S(8)} ${S(10)}; justify-content: space-between; width: 100%; box-sizing: border-box; padding: ${S(8)} ${S(11)}; }
.narrow .metric svg { display: none; }
.compact .header { align-items: center; }
.compact .main { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: ${S(12)}; align-items: center; }
.compact .temp { grid-column: 1; grid-row: 1 / span 3; }
.compact .place, .compact .cond, .compact .sub { grid-column: 2; margin-top: 0; }
.compact .metrics { grid-template-columns: var(--lc-mcols, repeat(var(--lc-mcount, 4), auto)); gap: ${S(6)} ${S(16)}; padding: ${S(7)} ${S(12)}; }
.compact.narrow .header { flex-direction: column; align-items: stretch; }
.bar { display: flex; align-items: center; gap: ${S(10)}; min-height: ${S(28)}; }
.bar:empty { display: none; }
.nowcast { display: flex; align-items: center; gap: ${S(7)}; min-width: 0; font-size: ${S(13)}; font-weight: 500; padding: ${S(5)} ${S(12)} ${S(5)} ${S(9)}; border-radius: 999px; background: var(--lc-pill-bg, rgba(255,255,255,.14)); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
.nowcast span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nowcast.wet { background: rgba(105,175,255,.26); box-shadow: inset 0 0 0 1px rgba(160,210,255,.38); }
.tabs { display: flex; flex: none; margin-left: auto; padding: 2px; border-radius: 999px; background: rgba(0,10,30,.22); box-shadow: inset 0 0 0 1px rgba(255,255,255,.1); }
.tabs button { all: unset; cursor: pointer; font-size: ${S(12)}; font-weight: 600; padding: ${S(5)} ${S(13)}; border-radius: 999px; opacity: .72; transition: background .25s, opacity .25s; color: inherit; }
.tabs button.on { opacity: 1; background: rgba(255,255,255,.24); box-shadow: 0 1px 4px rgba(0,10,30,.2); }
.charts { display: grid; grid-template-columns: minmax(0, 1fr); gap: ${S(10)}; }
.charts.side { grid-template-columns: var(--lc-split, minmax(0,1fr) minmax(0,1fr)); align-items: stretch; }
.charts.off { display: none; }
.chart { position: relative; min-width: 0; border-radius: ${S(14)}; background: var(--lc-chart-bg, linear-gradient(180deg, rgba(4,16,40,.10), rgba(4,16,40,.26))); box-shadow: inset 0 0 0 1px var(--lc-chart-line, rgba(255,255,255,.09)); min-height: 40px; }
.chart svg.c { display: block; width: 100%; overflow: visible; }
.empty { padding: ${S(34)} 0; text-align: center; font-size: ${S(13)}; opacity: .78; }
svg.c text { fill: var(--lc-text, #fff); font-family: inherit; }
.tl { font-size: ${S(11.5)}; font-weight: 500; opacity: .88; }
.tl.now { font-weight: 700; opacity: 1; }
.td { font-size: ${S(9.5)}; opacity: .62; }
.tday { font-size: ${S(9.5)}; font-weight: 700; letter-spacing: .05em; fill: #ffe7a0 !important; }
.tt { font-size: ${S(12.5)}; font-weight: 600; paint-order: stroke; stroke: rgba(0,12,32,.38); stroke-width: 3px; stroke-linejoin: round; }
.tlow { font-size: ${S(11)}; font-weight: 500; opacity: .8; paint-order: stroke; stroke: rgba(0,12,32,.3); stroke-width: 3px; stroke-linejoin: round; }
.tp { font-size: ${S(10.5)}; font-weight: 700; fill: var(--lc-precip-text, #d3eaff) !important; paint-order: stroke; stroke: rgba(0,12,32,.35); stroke-width: 2.5px; stroke-linejoin: round; }
.tp.snow { fill: #ffffff !important; }
.tp .u, .tw .u { font-size: ${S(8.5)}; opacity: .78; }
.tpr { font-size: ${S(9.5)}; fill: #b4dbff !important; opacity: .92; }
.tw { font-size: ${S(10.5)}; opacity: .88; }
.tnone { font-size: ${S(11)}; opacity: .55; font-style: italic; }
.warr { fill: var(--lc-text, #fff); fill-opacity: .88; }
.anim .ln { stroke-dasharray: 1; stroke-dashoffset: 1; animation: lcDraw 1.3s cubic-bezier(.55,.1,.25,1) forwards; }
.anim .fade { opacity: 0; animation: lcFade .6s ease forwards; }
.anim .grow { transform: scaleY(0); transform-box: fill-box; transform-origin: 50% 100%; animation: lcGrow .8s cubic-bezier(.3,1.35,.5,1) forwards; }
.anim .pop { opacity: 0; transform-box: fill-box; transform-origin: center; animation: lcPop .55s cubic-bezier(.3,1.5,.5,1) forwards; }
@keyframes lcDraw { to { stroke-dashoffset: 0; } }
@keyframes lcFade { to { opacity: 1; } }
@keyframes lcGrow { to { transform: scaleY(1); } }
@keyframes lcPop { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: scale(1); } }
.ia .rays { animation: lcSpin 22s linear infinite; transform-box: fill-box; transform-origin: center; }
.ia .bob { animation: lcBob 4.5s ease-in-out infinite alternate; }
.ia .drop { animation: lcDrop 1.15s linear infinite; }
.ia .flake { animation: lcFlake 2.6s linear infinite; }
.ia .bolt { animation: lcBolt 3.2s steps(1) infinite; }
.ia .fogl { animation: lcBob 3.2s ease-in-out infinite alternate; }
.ia .twk { animation: lcTwk 2.2s ease-in-out infinite alternate; }
@keyframes lcSpin { to { transform: rotate(360deg); } }
@keyframes lcBob { from { transform: translateX(-1px); } to { transform: translateX(1.2px); } }
@keyframes lcDrop { 0% { transform: translate(.6px,-3px); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(-1px,4px); opacity: 0; } }
@keyframes lcFlake { 0% { transform: translate(0,-3px); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(1.2px,4px); opacity: 0; } }
@keyframes lcBolt { 0%, 72%, 80%, 100% { opacity: 1; } 76%, 84% { opacity: .2; } }
@keyframes lcTwk { from { opacity: .3; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .ia .rays, .ia .bob, .ia .drop, .ia .flake, .ia .bolt, .ia .fogl, .ia .twk { animation: none; }
  .anim .ln, .anim .fade, .anim .grow, .anim .pop { animation: none; opacity: 1; transform: none; stroke-dashoffset: 0; }
}
`;

  const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- the card
  class SkycastCard extends HTMLElement {
    static getStubConfig(hass) {
      const ent = Object.keys(hass?.states || {}).find((e) => e.startsWith('weather.'));
      return { entity: ent || 'weather.home' };
    }

    static async getConfigElement() {
      await loadEditorDeps();
      return document.createElement(EDITOR_TAG);
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._forecast = {};
      this._types = [];
      this._unsubs = [];
      this._subGen = 0;
      this._subKey = null;
      this._tab = null;
      this._animIn = true;
      this._visible = true;
      this._connected = false;
      this._skyFront = null;
      this._skyCss = '';
      this._fmtCache = new Map();
      this._fitDelta = 0;
      this._onVis = () => this._updateRunning();
    }

    setConfig(config) {
      if (!config || !config.entity || !String(config.entity).startsWith('weather.')) {
        throw new Error('Please choose a weather entity (weather.*)');
      }
      const prev = this._config;
      this._config = config;
      this._c = normalize(config);
      if (prev && prev.entity !== config.entity) {
        this._unsubscribe();
        this._forecast = {};
      }
      if (!prev || prev.forecast_mode !== config.forecast_mode || prev.forecast_type !== config.forecast_type) this._tab = null;
      this._animIn = true;
      this._fitDelta = 0;
      this._squeeze = 0;
      if (!this.$) this._build();
      this._fx.fps = clamp(Number(this._c.max_fps) || 30, 5, 60);
      if (this._hass) this._subscribe();
      this._updateRunning();
      this._scheduleRender();
    }

    set hass(hass) {
      const old = this._hass;
      this._hass = hass;
      if (!this._c) return;
      this._subscribe();
      const c = this._c;
      const ids = [c.entity, c.sun_entity, c.temperature_entity, c.feels_like_entity, c.humidity_entity, c.pressure_entity,
        c.wind_speed_entity, c.wind_gust_entity, c.wind_bearing_entity, c.uv_entity, c.indoor_temperature_entity,
        c.indoor_humidity_entity].filter(Boolean);
      if (!old || ids.some((id) => old.states[id] !== hass.states[id]) || old.locale !== hass.locale) this._scheduleRender();
    }

    get hass() { return this._hass; }

    connectedCallback() {
      this._connected = true;
      if (!this.$) this._build();
      this._attach();
      if (this._hass && this._c) this._subscribe();
      this._scheduleRender();
    }

    disconnectedCallback() {
      this._connected = false;
      this._unsubscribe();
      this._detach();
      this._fx?.stop();
    }

    getCardSize() {
      if (!this._c) return 6;
      let n = 1;
      if (this._c.show_current !== false) n += 3;
      if (this._c.show_chart !== false) n += this._mode() === 'stacked' ? 8 : 4;
      return n;
    }

    getGridOptions() {
      return { columns: 12, min_columns: 3, min_rows: 2 };
    }

    // ------------------------------------------------ dom
    _build() {
      this.shadowRoot.innerHTML = `<style>${CSS}</style>
        <ha-card>
          <div class="skywrap"><div class="sky"></div><div class="sky"></div></div>
          <canvas class="fx"></canvas>
          <div class="content">
            <div class="header"></div>
            <div class="bar"></div>
            <div class="charts"></div>
          </div>
        </ha-card>`;
      const q = (s) => this.shadowRoot.querySelector(s);
      const skies = this.shadowRoot.querySelectorAll('.sky');
      this.$ = {
        card: q('ha-card'), skywrap: q('.skywrap'), skyA: skies[0], skyB: skies[1], canvas: q('canvas.fx'),
        content: q('.content'), header: q('.header'), bar: q('.bar'), charts: q('.charts'),
      };
      this._fx = new SkyFX(this.$.canvas);

      const ct = this.$.content;
      let holdTimer = 0;
      let held = false;
      const cancel = () => { clearTimeout(holdTimer); holdTimer = 0; };
      ct.addEventListener('pointerdown', (e) => {
        if ((e.button && e.button !== 0) || e.target.closest('[data-tab]')) return;
        held = false;
        cancel();
        if (this._actionOf('hold').action !== 'none') {
          holdTimer = setTimeout(() => { held = true; this._action('hold'); }, 550);
        }
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => ct.addEventListener(t, cancel));
      ct.addEventListener('contextmenu', (e) => { if (held) e.preventDefault(); });
      ct.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-tab]');
        if (tab) {
          e.stopPropagation();
          if (tab.dataset.tab !== this._currentTab()) {
            this._tab = tab.dataset.tab;
            this._animIn = true;
            this._render();
          }
          return;
        }
        if (held) { held = false; return; }
        this._action('tap');
      });
      if (this._connected) this._attach();
    }

    _attach() {
      if (!this.$ || this._attached) return;
      this._attached = true;
      this._ro = new ResizeObserver(() => this._onResize());
      this._ro.observe(this.$.card);
      if ('IntersectionObserver' in window) {
        this._io = new IntersectionObserver((entries) => {
          this._visible = entries.some((e) => e.isIntersecting);
          this._updateRunning();
        });
        this._io.observe(this.$.card);
      }
      document.addEventListener('visibilitychange', this._onVis);
      this._lastHour = new Date().getHours();
      this._ticker = setInterval(() => {
        const h = new Date().getHours();
        if (h !== this._lastHour) { this._lastHour = h; this._scheduleRender(); }
      }, 30000);
      this._updateRunning();
    }

    _detach() {
      this._attached = false;
      this._ro?.disconnect();
      this._io?.disconnect();
      clearInterval(this._ticker);
      document.removeEventListener('visibilitychange', this._onVis);
    }

    _updateRunning() {
      if (!this._fx) return;
      const run = this._c && this._c.animate !== false && !REDUCED && this._visible && this._connected && !document.hidden;
      if (run) this._fx.start();
      else this._fx.stop();
    }

    _onResize() {
      if (!this._c) return;
      const r = this.$.card.getBoundingClientRect();
      this._fx.resize(r.width, r.height);
      const narrow = r.width > 0 && r.width < 430;
      const layout = this._layoutFor(r.width);
      if (narrow !== this.$.content.classList.contains('narrow') || layout !== this._layout ||
        this._panelWidths().join() !== (this._chartWs || []).join()) {
        this._scheduleRender();
        return;
      }
      this._fitGuard = 0;
      this._imposed = undefined;
      this._fit();
    }

    _actionOf(kind) {
      const a = this._c?.[`${kind}_action`];
      return a && a.action ? a : { action: kind === 'tap' ? 'more-info' : 'none' };
    }

    _action(kind) {
      const a = this._actionOf(kind);
      if (!a || a.action === 'none') return;
      if (a.action === 'more-info') {
        const ev = new Event('hass-more-info', { bubbles: true, composed: true });
        ev.detail = { entityId: a.entity || this._c.entity };
        this.dispatchEvent(ev);
        return;
      }
      const ev = new Event('hass-action', { bubbles: true, composed: true });
      ev.detail = { config: { entity: this._c.entity, tap_action: this._actionOf('tap'), hold_action: this._actionOf('hold') }, action: kind };
      this.dispatchEvent(ev);
    }

    // ------------------------------------------------ forecast subscription
    async _subscribe() {
      if (!this._hass || !this._c || !this._connected) return;
      if (this._subKey === this._c.entity) return;
      const st = this._hass.states[this._c.entity];
      if (!st) return;
      this._subKey = this._c.entity;
      const gen = ++this._subGen;
      const feats = Number(st.attributes.supported_features) || 0;
      const types = [];
      if (feats & 2) types.push('hourly');
      if (feats & 1) types.push('daily');
      if (!types.length && feats & 4) types.push('twice_daily');
      this._types = types;
      if (!types.length || !this._hass.connection?.subscribeMessage) return;
      for (const t of types) {
        try {
          const unsub = await this._hass.connection.subscribeMessage(
            (ev) => {
              if (gen !== this._subGen) return;
              this._forecast[t] = Array.isArray(ev?.forecast) ? ev.forecast : [];
              this._scheduleRender();
            },
            { type: 'weather/subscribe_forecast', forecast_type: t, entity_id: this._c.entity },
          );
          if (gen !== this._subGen) { try { unsub(); } catch (e) { /* ignore */ } } else this._unsubs.push(unsub);
        } catch (e) {
          console.warn(`${TAG}: could not subscribe to the ${t} forecast`, e);
        }
      }
    }

    _unsubscribe() {
      this._subGen++;
      this._subKey = null;
      for (const u of this._unsubs) {
        try { const r = u(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ }
      }
      this._unsubs = [];
    }

    _available() {
      const out = [];
      const legacy = this._hass?.states[this._c.entity]?.attributes?.forecast;
      if (this._types.includes('hourly')) out.push('hourly');
      if (this._types.includes('daily') || this._types.includes('twice_daily')) out.push('daily');
      if (!out.length && Array.isArray(legacy) && legacy.length) out.push(this._c.forecast_type === 'daily' ? 'daily' : 'hourly');
      return out;
    }

    _mode() {
      const m = this._c.forecast_mode;
      return ['tabs', 'hourly', 'daily', 'side_by_side', 'stacked'].includes(m) ? m : 'tabs';
    }

    _currentTab() {
      const av = this._available();
      const mode = this._mode();
      if (mode === 'hourly' || mode === 'daily') return av.includes(mode) || !av.length ? mode : av[0];
      if (this._tab && av.includes(this._tab)) return this._tab;
      const pref = this._c.forecast_type === 'daily' ? 'daily' : 'hourly';
      return av.includes(pref) ? pref : av[0] || pref;
    }

    _raw(type) {
      if (type === 'daily' && !this._forecast.daily && this._forecast.twice_daily) return this._forecast.twice_daily;
      if (this._forecast[type]) return this._forecast[type];
      if (!this._types.length) return this._hass?.states[this._c.entity]?.attributes?.forecast || [];
      return [];
    }

    _future(type) {
      const now = Date.now();
      const list = this._raw(type).filter((f) => f && f.datetime);
      if (type === 'hourly') return list.filter((f) => new Date(f.datetime).getTime() + 3600e3 > now);
      const today = startOfDay(new Date());
      return list.filter((f) => startOfDay(new Date(f.datetime)) >= today);
    }

    // ------------------------------------------------ formatting
    _lang() {
      const l = this._c.locale && this._c.locale !== 'auto' ? this._c.locale : this._hass?.locale?.language || this._hass?.language || 'en';
      return String(l);
    }

    _numLocale() {
      switch (this._hass?.locale?.number_format) {
        case 'comma_decimal': return 'en-US';
        case 'decimal_comma': return 'de-DE';
        case 'space_comma': return 'fr-FR';
        case 'none': return 'en-US';
        case 'system': return undefined;
        default: return this._lang();
      }
    }

    _nf(dec) {
      const key = `n${dec}|${this._numLocale()}`;
      if (!this._fmtCache.has(key)) {
        let f;
        try { f = new Intl.NumberFormat(this._numLocale(), { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false }); }
        catch (e) { f = new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false }); }
        this._fmtCache.set(key, f);
      }
      return this._fmtCache.get(key);
    }

    _num(v, dec = 0) {
      if (!Number.isFinite(v)) return '–';
      const p = 10 ** dec;
      const r = Math.round(v * p) / p;
      return this._nf(dec).format(r === 0 ? 0 : r);
    }

    _dtf(opts) {
      const tf = this._hass?.locale?.time_format;
      const h12 = tf === '12' ? true : tf === '24' ? false : undefined;
      const key = `d${JSON.stringify(opts)}|${this._lang()}|${h12}`;
      if (!this._fmtCache.has(key)) {
        const o = { ...opts };
        if (o.hour && h12 !== undefined) o.hour12 = h12;
        if (o.hour && h12 === false) o.hourCycle = 'h23';
        try { this._fmtCache.set(key, new Intl.DateTimeFormat(this._lang(), o)); }
        catch (e) { this._fmtCache.set(key, new Intl.DateTimeFormat('en', o)); }
      }
      return this._fmtCache.get(key);
    }

    _time(d) { return this._dtf({ hour: '2-digit', minute: '2-digit' }).format(d); }
    _wd(d) { return cap(this._dtf({ weekday: 'short' }).format(d).replace('.', '')); }
    _wdLong(d) { return this._dtf({ weekday: 'long' }).format(d); }
    _dm(d) { return this._dtf({ day: 'numeric', month: 'numeric' }).format(d); }

    _when(d) {
      const T = this._T;
      const hh = T.hourOnly ? pad2(d.getHours()) : this._time(d);
      const dd = dayDiff(new Date(), d);
      if (dd <= 0) return T.at(hh);
      if (dd === 1) return `${T.tomorrow} ${T.at(hh)}`;
      return `${this._wd(d).toLowerCase()} ${T.at(hh)}`;
    }

    _condText(c) {
      const t = this._T.cond[c];
      if (t) return t;
      const l = this._hass?.localize?.(`component.weather.entity_component._.state.${c}`);
      return l || c || '';
    }

    _tempC(t) { return this._unitF ? ((t - 32) * 5) / 9 : t; }

    _precipKind(f) {
      const c = f.condition;
      if (c === 'snowy') return 'snow';
      if (c === 'snowy-rainy') return 'sleet';
      if (c === 'hail') return 'hail';
      if (c === 'rainy' || c === 'pouring' || c === 'lightning-rainy') return 'rain';
      const t = this._tempC(num(f.temperature));
      if (Number.isFinite(t) && t <= 0) return 'snow';
      if (Number.isFinite(t) && t <= 1.5) return 'sleet';
      return 'rain';
    }

    _isNight(f) {
      if (typeof f.is_daytime === 'boolean') return !f.is_daytime;
      const d = new Date(f.datetime);
      const m = d.getHours() * 60 + d.getMinutes() + 30;
      const { rise, set } = this._sunMins || { rise: 7 * 60, set: 17 * 60 };
      return rise < set ? m < rise || m > set : m > set && m < rise;
    }

    // value from an optional sensor, falling back to a weather attribute
    _src(entityId, attr, attrUnit) {
      if (entityId) {
        const s = this._hass.states[entityId];
        const v = num(s?.state);
        if (Number.isFinite(v)) return { v, unit: s.attributes?.unit_of_measurement ?? attrUnit, raw: s.state };
        if (s && s.state && !['unknown', 'unavailable'].includes(s.state)) return { v: NaN, unit: attrUnit, raw: s.state };
      }
      return { v: num(attr), unit: attrUnit, raw: attr };
    }

    // ------------------------------------------------ render
    _scheduleRender() {
      // Microtask (not rAF) so the card also updates while the tab is in the background.
      if (this._rq) return;
      this._rq = true;
      queueMicrotask(() => {
        this._rq = false;
        this._render();
      });
    }

    _applyStyle(cardW) {
      const c = this._c, card = this.$.card;
      const s = clamp(num(c.scale) || 1, 0.4, 3);
      this._s = s;
      const compact = c.header_style === 'compact';
      const tSize = num(c.temp_size) > 0 ? num(c.temp_size) : (compact ? 46 : 66) * s;
      const panel = clamp(Number.isFinite(num(c.panel_opacity)) ? num(c.panel_opacity) : 1, 0, 3);
      const pad = Number.isFinite(num(c.padding)) ? clamp(num(c.padding), 0, 80) : 14;
      const set = (k, v) => (v === null || v === undefined ? card.style.removeProperty(k) : card.style.setProperty(k, v));
      set('--lc-s', String(s));
      set('--lc-temp', `${tSize}px`);
      set('--lc-pad', `${pad}px`);
      set('--lc-radius', Number.isFinite(num(c.border_radius)) ? `${num(c.border_radius)}px` : null);
      set('--lc-chart-bg', `linear-gradient(180deg, rgba(4,16,40,${f1(0.1 * panel * 100) / 100}), rgba(4,16,40,${f1(0.26 * panel * 100) / 100}))`);
      set('--lc-chart-line', `rgba(255,255,255,${f1(0.09 * Math.min(panel, 1.5) * 100) / 100})`);
      set('--lc-box-bg', `rgba(6,18,44,${f1(0.2 * panel * 100) / 100})`);
      set('--lc-box-line', `rgba(255,255,255,${f1(0.1 * Math.min(panel, 1.5) * 100) / 100})`);
      const text = c.custom_colors ? toRgb(c.text_color) : null;
      set('--lc-text', text ? rgba(text) : null);
      const pc = c.custom_colors ? toRgb(c.precip_color) : null;
      set('--lc-precip-text', pc ? rgba(mix(pc, [255, 255, 255], 0.55)) : null);
      const mc = Math.round(num(c.metrics_columns));
      set('--lc-mcols', mc > 0 ? `repeat(${mc}, auto)` : null);
      const metricsCount = (Array.isArray(c.metrics) ? c.metrics.length : 4) || 1;
      set('--lc-mcount', String(Math.min(metricsCount, 6)));
      const h = num(c.card_height);
      card.style.height = h > 0 ? `${h}px` : '';
      const op = clamp(Number.isFinite(num(c.sky_opacity)) ? num(c.sky_opacity) : 1, 0, 1);
      this.$.skywrap.style.opacity = String(op);
      card.style.background = op < 1 ? 'transparent' : '';
      const ct = this.$.content;
      ct.classList.toggle('narrow', cardW > 0 && cardW < 430);
      ct.classList.toggle('compact', compact);
      ct.classList.toggle('no-micons', c.show_metric_icons === false);
      ct.classList.toggle('no-mlabels', c.show_metric_labels === false);
      ct.classList.toggle('tappable', this._actionOf('tap').action !== 'none');
      ct.classList.toggle('only-current', c.show_chart === false);
    }

    _render() {
      if (!this._hass || !this._c || !this.$) return;
      const c = this._c;
      this._fitGuard = 0;
      const lang = this._lang().toLowerCase();
      this._T = I18N[lang.slice(0, 2)] || I18N.en;
      const T = this._T;
      const st = this._hass.states[c.entity];
      const cardW = this.$.card.getBoundingClientRect().width;
      this._applyStyle(cardW);
      if (!st) {
        this.$.header.innerHTML = `<div class="main"><div class="cond">${esc(T.missing(c.entity))}</div></div>`;
        this.$.bar.innerHTML = '';
        this.$.charts.innerHTML = '';
        return;
      }
      const a = st.attributes;
      this._unitF = /F/.test(a.temperature_unit || this._hass.config?.unit_system?.temperature || '°C');
      this._srcWind = a.wind_speed_unit || 'km/h';
      this._windUnit = c.wind_unit && c.wind_unit !== 'auto' ? c.wind_unit : this._srcWind;

      const sun = this._hass.states[c.sun_entity];
      let elev, azi;
      if (sun) {
        elev = num(sun.attributes.elevation);
        azi = num(sun.attributes.azimuth);
        const toMin = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
        if (sun.attributes.next_rising && sun.attributes.next_setting) {
          this._sunMins = { rise: toMin(sun.attributes.next_rising), set: toMin(sun.attributes.next_setting) };
        }
      }
      if (!Number.isFinite(elev)) {
        const h = new Date().getHours() + new Date().getMinutes() / 60;
        elev = st.state === 'clear-night' ? -15 : 35 * Math.sin((Math.PI * (h - 6)) / 12);
      }
      if (c.day_night === false) elev = st.state === 'clear-night' ? -15 : 30;

      const hourly = this._future('hourly');
      const daily = this._future('daily');

      this._renderSky(st, elev, azi, hourly);
      this._renderHeader(st, sun, daily, hourly);
      this._renderBar(hourly, daily);
      // Start from the natural size each time; _fit() then grows or shrinks to the space the card was given.
      this._fitDelta = 0;
      this._squeeze = 0;
      this._imposed = undefined;
      this._renderCharts(cardW);
      this._fit();
      if (this._chartWs && this._chartWs.every((w) => w > 0)) this._animIn = false;
      const r = this.$.card.getBoundingClientRect();
      this._fx.resize(r.width, r.height);
    }

    _renderSky(st, elev, azi, hourly) {
      const c = this._c;
      const cond = st.state;
      const key = COND_SCENE[cond] || 'cloudy';
      const sc = SCENES[key];
      const w = phaseWeights(elev);
      const pal = PAL_RGB[sc.pal];
      const stops = [0, 1, 2].map((i) => {
        let col = [0, 1, 2].map((k) => pal.day[i][k] * w.day + pal.twi[i][k] * w.twi + pal.night[i][k] * w.night);
        if (cond === 'exceptional') col = mix(col, [130, 30, 45], 0.28);
        return col;
      });
      this._setSky(`linear-gradient(180deg, ${rgba(stops[0])} 0%, ${rgba(stops[1])} 52%, ${rgba(stops[2])} 100%)`);

      const a = st.attributes;
      const ws = this._src(c.wind_speed_entity, a.wind_speed, this._srcWind);
      const windMs = toMs(Number.isFinite(ws.v) ? ws.v : 0, ws.unit || this._srcWind);
      const pNow = num(hourly[0]?.precipitation);
      const intensity = Number.isFinite(pNow) && pNow > 0.05 ? Math.max(0.2, pNow) : sc.intensity || 0;
      const sunX = Number.isFinite(azi) ? clamp(0.12 + ((azi - 100) / 160) * 0.76, 0.08, 0.92) : 0.5;
      const sunY = 0.44 - 0.36 * clamp(elev / 30, 0, 1) + (elev < 0 ? clamp(-elev / 20, 0, 0.3) : 0);
      const mul = (v, d = 1) => clamp(Number.isFinite(num(v)) ? num(v) : d, 0, 5);
      this._fx.setScene({
        kind: key,
        tint: sc.tint,
        clouds: Math.round(sc.clouds * mul(c.cloud_amount)),
        precip: sc.precip || null,
        precipMul: mul(c.precip_amount),
        intensity,
        fog: !!sc.fog,
        wind: !!sc.wind || windMs >= 11,
        windMs: windMs * mul(c.wind_effect),
        lightning: !!sc.lightning,
        flash: c.lightning_flash !== false,
        splash: c.rain_splash !== false,
        rays: c.sun_rays !== false,
        shoot: c.shooting_stars !== false,
        nightW: w.night,
        twiW: w.twi,
        starA: c.show_stars === false ? 0 : sc.stars * w.night,
        moonA: (sc.moon || 0) * smooth(0.25, 0.85, w.night),
        moonX: 0.53,
        moonY: 0.15,
        moonPhase: moonPhase(),
        sunA: sc.sun * smooth(-4, 2, elev),
        sunX,
        sunY,
        sunWarm: 1 - smooth(2, 20, elev),
      });
    }

    _setSky(css) {
      if (css === this._skyCss) return;
      const { skyA, skyB } = this.$;
      if (!this._skyFront) {
        // first sky: show it at once (no fade-in from the dark fallback colour)
        skyA.style.transition = 'none';
        skyA.style.background = css;
        skyA.style.opacity = '1';
        skyA.style.zIndex = '1';
        void skyA.offsetWidth;
        skyA.style.transition = '';
        this._skyFront = skyA;
        this._skyCss = css;
        return;
      }
      this._skyCss = css;
      const front = this._skyFront;
      const back = front === skyA ? skyB : skyA;
      back.style.transition = 'none';
      back.style.opacity = '0';
      back.style.background = css;
      back.style.zIndex = '2';
      front.style.zIndex = '1';
      void back.offsetWidth;
      back.style.transition = '';
      back.style.opacity = '1';
      this._skyFront = back;
      clearTimeout(this._skyT);
      this._skyT = setTimeout(() => { front.style.transition = 'none'; front.style.opacity = '0'; }, 2600);
    }

    _metric(key, st, sun, hourly) {
      const c = this._c, T = this._T, a = st.attributes;
      const u = (s) => (s ? `<small> ${esc(s)}</small>` : '');
      switch (key) {
        case 'humidity': {
          const x = this._src(c.humidity_entity, a.humidity, '%');
          return Number.isFinite(x.v) ? ['humidity', `${this._num(x.v, 0)}${u('%')}`, T.m.humidity] : null;
        }
        case 'wind': {
          const ws = this._src(c.wind_speed_entity, a.wind_speed, this._srcWind);
          if (!Number.isFinite(ws.v)) return null;
          const out = (v, unit) => fromMs(toMs(v, unit || this._srcWind), this._windUnit);
          const gs = this._src(c.wind_gust_entity, a.wind_gust_speed, this._srcWind);
          const bs = this._src(c.wind_bearing_entity, a.wind_bearing, '°');
          const b = Number.isFinite(bs.v) ? bs.v : bearingDeg(bs.raw);
          const dir = Number.isFinite(b) ? ` ${T.compass[Math.round((((b % 360) + 360) % 360) / 45) % 8]}` : '';
          const speed = out(ws.v, ws.unit);
          const gust = Number.isFinite(gs.v) ? out(gs.v, gs.unit) : NaN;
          const g = Number.isFinite(gust) && gust > speed ? ` <small>(${this._num(gust, 0)})</small>` : '';
          return ['wind', `${this._num(speed, 0)}${g}${u(this._windUnit)}`, `${T.m.wind}${dir}`];
        }
        case 'pressure': {
          const x = this._src(c.pressure_entity, a.pressure, a.pressure_unit || 'hPa');
          return Number.isFinite(x.v) ? ['pressure', `${this._num(x.v, 0)}${u(x.unit)}`, T.m.pressure] : null;
        }
        case 'sun': {
          if (!sun) return null;
          const up = sun.state === 'above_horizon';
          const iso = up ? sun.attributes.next_setting : sun.attributes.next_rising;
          return iso ? [up ? 'sunset' : 'sunrise', this._time(new Date(iso)), up ? T.m.sunset : T.m.sunrise] : null;
        }
        case 'feels_like': {
          const x = this._src(c.feels_like_entity, a.apparent_temperature, '°');
          return Number.isFinite(x.v) ? ['thermo', `${this._num(x.v, 0)}°`, T.m.feels_like] : null;
        }
        case 'uv_index': {
          const x = this._src(c.uv_entity, a.uv_index, '');
          return Number.isFinite(x.v) ? ['uv', this._num(x.v, Number.isInteger(x.v) ? 0 : 1), T.m.uv_index] : null;
        }
        case 'visibility': {
          const v = num(a.visibility);
          return Number.isFinite(v) ? ['eye', `${this._num(v, v < 10 ? 1 : 0)}${u(a.visibility_unit || 'km')}`, T.m.visibility] : null;
        }
        case 'dew_point': {
          const v = num(a.dew_point);
          return Number.isFinite(v) ? ['thermo', `${this._num(v, 0)}°`, T.m.dew_point] : null;
        }
        case 'cloud_coverage': {
          const v = num(a.cloud_coverage);
          return Number.isFinite(v) ? ['cloud', `${this._num(v, 0)}${u('%')}`, T.m.cloud_coverage] : null;
        }
        case 'precipitation': {
          const v = num(hourly[0]?.precipitation);
          return Number.isFinite(v) ? ['rain', `${this._num(v, 1)}${u(a.precipitation_unit || 'mm')}`, T.m.precipitation] : null;
        }
        case 'indoor_temperature': {
          if (!c.indoor_temperature_entity) return null;
          const x = this._src(c.indoor_temperature_entity, null, '°');
          return Number.isFinite(x.v) ? ['home', `${this._num(x.v, 1)}°`, T.m.indoor_temperature] : null;
        }
        case 'indoor_humidity': {
          if (!c.indoor_humidity_entity) return null;
          const x = this._src(c.indoor_humidity_entity, null, '%');
          return Number.isFinite(x.v) ? ['home', `${this._num(x.v, 0)}${u('%')}`, T.m.indoor_humidity] : null;
        }
        default: return null;
      }
    }

    _renderHeader(st, sun, daily, hourly) {
      const c = this._c, T = this._T, a = st.attributes;
      const el = this.$.header;
      if (c.show_current === false) { el.innerHTML = ''; return; }

      const tSrc = this._src(c.temperature_entity, a.temperature, '°');
      const temp = tSrc.v;
      const decCfg = num(c.temperature_decimals);
      const dec = Number.isFinite(decCfg)
        ? clamp(Math.round(decCfg), 0, 2)
        : Number.isFinite(temp) && !Number.isInteger(Math.round(temp * 10) / 10) ? 1 : 0;
      const ts = this._num(temp, dec);
      const sep = this._nf(1).format(1.5).replace(/[0-9]/g, '');
      const [ip, dp] = dec > 0 ? ts.split(sep) : [ts, ''];
      const name = c.show_name === false ? '' : c.name === undefined || c.name === null || c.name === '' ? a.friendly_name : c.name;

      const subs = [];
      if (c.show_hilo !== false) {
        const today = daily[0] && dayDiff(new Date(), new Date(daily[0].datetime)) === 0 ? daily[0] : null;
        if (today) {
          const hi = num(today.temperature), lo = num(today.templow);
          if (Number.isFinite(hi)) subs.push(`↑ ${this._num(hi, 0)}°${Number.isFinite(lo) ? `&nbsp;&nbsp;↓ ${this._num(lo, 0)}°` : ''}`);
        }
      }
      if (c.show_feels_like !== false) {
        const fl = this._src(c.feels_like_entity, a.apparent_temperature, '°');
        if (Number.isFinite(fl.v)) subs.push(`${T.feels} ${this._num(fl.v, 0)}°`);
      }

      let metrics = '';
      if (c.show_metrics !== false) {
        const list = (c.metrics || []).filter((k) => METRICS.includes(k)).map((k) => this._metric(k, st, sun, hourly)).filter(Boolean);
        if (list.length) {
          metrics = `<div class="metrics">${list.map(([i, v, l]) => `<div class="metric">${svgI(i)}<div><div class="v">${v}</div><div class="l">${esc(l)}</div></div></div>`).join('')}</div>`;
        }
      }

      el.innerHTML = `
        <div class="main">
          ${name ? `<div class="place">${esc(name)}</div>` : ''}
          <div class="temp"><span class="i">${esc(ip)}</span>${dp ? `<span class="d">${esc(sep + dp)}</span>` : ''}<span class="u">°</span></div>
          ${c.show_condition !== false ? `<div class="cond">${esc(this._condText(st.state))}</div>` : ''}
          ${subs.length ? `<div class="sub">${subs.map((s) => `<span>${s}</span>`).join('')}</div>` : ''}
        </div>
        ${metrics}`;
    }

    _nowcast(hourly, daily) {
      const c = this._c, T = this._T;
      const thr = Math.max(0.001, Number.isFinite(num(c.nowcast_threshold)) ? num(c.nowcast_threshold) : 0.1);
      const hours = clamp(Math.round(num(c.nowcast_hours) || 48), 1, 400);
      const P = (f) => Math.max(0, num(f.precipitation) || 0);
      const wet = (f) => P(f) >= thr;
      const dominant = (seg) => {
        const tally = {};
        seg.forEach((f) => { const k = this._precipKind(f); tally[k] = (tally[k] || 0) + P(f); });
        return Object.entries(tally).sort((x, y) => y[1] - x[1])[0]?.[0] || 'rain';
      };
      const mm = (v) => `${this._num(v, v >= 10 ? 0 : 1)} mm`;
      if (hourly.length) {
        const list = hourly.slice(0, hours);
        if (wet(list[0])) {
          const j = list.findIndex((f) => !wet(f));
          const seg = j < 0 ? list : list.slice(0, j);
          const k = T.kinds[dominant(seg)];
          const total = seg.reduce((s, f) => s + P(f), 0);
          return { wet: true, text: `${j < 0 ? T.all(k) : T.stops(k, this._when(new Date(list[j].datetime)))} · ${mm(total)}` };
        }
        const i = list.findIndex(wet);
        if (i >= 0) {
          const rest = list.slice(i);
          const j = rest.findIndex((f) => !wet(f));
          const seg = j < 0 ? rest : rest.slice(0, j);
          const k = T.kinds[dominant(seg)];
          const total = seg.reduce((s, f) => s + P(f), 0);
          const prob = Math.max(...seg.map((f) => num(f.precipitation_probability)).filter(Number.isFinite), -1);
          return { wet: true, text: `${T.starts(k, this._when(new Date(list[i].datetime)))} · ${mm(total)}${prob > 0 ? ` · ${Math.round(prob)} %` : ''}` };
        }
        const last = new Date(list[list.length - 1].datetime);
        const next = daily.find((d) => startOfDay(new Date(d.datetime)) > startOfDay(last) && P(d) >= Math.max(0.5, thr));
        if (next) return { wet: false, text: `${T.dryUntil(this._wdLong(new Date(next.datetime)))} · ${mm(P(next))}` };
        const hrs = Math.max(1, Math.round((last.getTime() + 3600e3 - Date.now()) / 3600e3));
        return { wet: false, text: T.dry(hrs) };
      }
      if (daily.length) {
        const i = daily.findIndex((d) => P(d) >= Math.max(0.5, thr));
        if (i < 0) return { wet: false, text: T.dryAll };
        const d = new Date(daily[i].datetime);
        const k = T.kinds[this._precipKind(daily[i])];
        const when = dayDiff(new Date(), d) === 0 ? T.today.toLowerCase() : this._wdLong(d);
        return { wet: i === 0, text: `${T.starts(k, when)} · ${mm(P(daily[i]))}` };
      }
      return null;
    }

    _renderBar(hourly, daily) {
      const c = this._c, T = this._T;
      let html = '';
      if (c.show_nowcast !== false) {
        const nc = this._nowcast(hourly, daily);
        if (nc) html += `<div class="nowcast${nc.wet ? ' wet' : ''}">${svgI(nc.wet ? 'umbrella' : 'dry')}<span>${esc(nc.text)}</span></div>`;
      }
      const av = this._available();
      if (c.show_chart !== false && this._mode() === 'tabs' && av.length > 1) {
        const cur = this._currentTab();
        html += `<div class="tabs" role="tablist">${av.map((t) => `<button role="tab" data-tab="${t}" class="${t === cur ? 'on' : ''}">${esc(T[t])}</button>`).join('')}</div>`;
      }
      this.$.bar.innerHTML = html;
    }

    _stepHourly(list, step) {
      if (step <= 1) return list;
      const out = [];
      for (let i = 0; i < list.length; i += step) {
        const seg = list.slice(i, i + step);
        const P = seg.map((f) => Math.max(0, num(f.precipitation) || 0));
        const maxI = P.indexOf(Math.max(...P));
        const probs = seg.map((f) => num(f.precipitation_probability)).filter(Number.isFinite);
        const winds = seg.map((f) => num(f.wind_speed)).filter(Number.isFinite);
        out.push({
          ...seg[0],
          condition: P[maxI] > 0 ? seg[maxI].condition : seg[0].condition,
          precipitation: P.reduce((s, v) => s + v, 0),
          precipitation_probability: probs.length ? Math.max(...probs) : undefined,
          wind_speed: winds.length ? Math.max(...winds) : seg[0].wind_speed,
        });
      }
      return out;
    }

    // which chart layout fits this card width
    _layoutFor(cardW) {
      const mode = this._mode();
      if (mode === 'stacked') return 'stack';
      if (mode === 'side_by_side') {
        const lim = num(this._c.stack_below);
        return cardW > 0 && Number.isFinite(lim) && lim > 0 && cardW < lim ? 'stack' : 'side';
      }
      return 'single';
    }

    _panelWidths() {
      return Array.from(this.$.charts.children).map((p) => Math.round(p.clientWidth));
    }

    _renderCharts(cardW) {
      const c = this._c;
      const box = this.$.charts;
      if (c.show_chart === false) {
        box.className = 'charts off';
        box.innerHTML = '';
        this._chartWs = [];
        this._geo = null;
        return;
      }
      const av = this._available();
      const layout = this._layoutFor(cardW);
      this._layout = layout;
      let types = layout === 'single' ? [this._currentTab()] : ['hourly', 'daily'].filter((t) => av.includes(t) || !av.length);
      if (!types.length) types = [this._currentTab()];
      box.className = `charts ${types.length > 1 ? layout : 'single'}`;
      const split = clamp(Number.isFinite(num(c.split)) ? num(c.split) : 50, 10, 90);
      box.style.setProperty('--lc-split', `minmax(0, ${split}fr) minmax(0, ${100 - split}fr)`);
      while (box.children.length < types.length) {
        const d = document.createElement('div');
        d.className = 'chart';
        box.appendChild(d);
      }
      while (box.children.length > types.length) box.lastChild.remove();
      this._types4 = types;
      this._drawCharts();
    }

    _drawCharts() {
      const c = this._c, T = this._T;
      const box = this.$.charts;
      const types = this._types4 || [];
      const panels = Array.from(box.children);
      const widths = this._panelWidths();
      this._chartWs = widths;
      if (!widths.length || widths.some((w) => !w)) return;
      const lists = types.map((t, i) => {
        let list = this._future(t);
        if (t === 'hourly') list = this._stepHourly(list, clamp(Math.round(num(c.hourly_step) || 1), 1, 12));
        const s = this._s;
        const minCol = num(c.column_width) > 0 ? num(c.column_width) : (t === 'daily' ? 60 : 50) * s;
        const auto = clamp(Math.floor(widths[i] / minCol), t === 'daily' ? 2 : 3, 48);
        const want = t === 'daily' ? num(c.days_to_show) : num(c.hours_to_show);
        return list.slice(0, Math.min(list.length, want > 0 ? want : auto));
      });
      const geo = this._geometry(types, lists, widths);
      this._geo = geo;
      panels.forEach((p, i) => {
        p.innerHTML = lists[i].length ? this._chartSVG(types[i], lists[i], widths[i], geo) : `<div class="empty">${esc(T.waiting)}</div>`;
      });
    }

    // Shared row layout so side-by-side panels line up.
    _geometry(types, lists, widths) {
      const c = this._c, s = this._s;
      const sq = this._squeeze || 0; // rows dropped when the card is too small: 1 = %, 2 = wind, 3 = icons
      const showTime = c.show_time_labels !== false;
      const showIcons = c.show_icons !== false && sq < 3;
      const showTemp = c.show_temperature !== false;
      const showTL = showTemp && c.show_temp_labels !== false;
      const hasLow = showTemp && c.show_low_temp !== false &&
        types.some((t, i) => t === 'daily' && lists[i].some((f) => Number.isFinite(num(f.templow))));
      const showP = c.show_precipitation !== false;
      const probMode = c.precipitation_type === 'probability';
      const showProbRow = showP && !probMode && c.show_probability !== false && sq < 1 &&
        lists.some((l) => l.some((f) => num(f.precipitation_probability) > 0));
      const showPL = showP && c.show_precip_labels !== false;
      const showWind = c.show_wind !== false && sq < 2 && lists.some((l) => l.some((f) => Number.isFinite(num(f.wind_speed))));
      const colWs = lists.map((l, i) => (l.length ? widths[i] / l.length : widths[i]));
      const minColW = Math.min(...colWs);
      const iconS = num(c.icon_size) > 0 ? num(c.icon_size) : clamp(minColW * 0.58, 22 * s, 34 * s);

      const share = types.length > 1 && this._layout === 'stack' ? 0.5 : 1;
      const delta = (this._fitDelta || 0) * share;
      const flexTemp = showTemp;

      const labelH = showTime ? 28 * s : 0;
      const iconTop = labelH + (showTime ? 1 : 6) * s;
      let y = iconTop + (showIcons ? iconS : 0);
      const tTop = y + (showTL ? 20 : 10) * s;
      const baseT = num(c.chart_height) > 0 ? num(c.chart_height) : 56 * s;
      const minT = 18 * s;
      const tempH = showTemp ? Math.max(minT, baseT + (flexTemp ? delta : 0)) : 0;
      const tBot = tTop + tempH;
      y = showTemp ? tBot + (hasLow && showTL ? 18 : 10) * s : y + 4 * s;
      const pLbl = showPL ? 13 * s : 3 * s;
      const baseP = num(c.precip_height) > 0 ? num(c.precip_height) : 30 * s;
      const minP = 8;
      const pBarH = showP ? Math.max(minP, baseP + (!flexTemp ? delta : 0)) : 0;
      const pBase = showP ? y + pLbl + pBarH : y;
      const probY = pBase + 11 * s;
      const afterP = showProbRow ? probY + 3 * s : pBase;
      const windY = afterP + 15 * s;
      const H = Math.ceil(showWind ? windY + 6 * s : afterP + 6 * s);

      // used by _fit()
      if (showTemp) { this._flexBase = baseT; this._flexMin = minT; this._flexShare = share; }
      else if (showP) { this._flexBase = baseP; this._flexMin = minP; this._flexShare = share; }
      else this._flexBase = null;

      return { s, showTime, showIcons, showTemp, showTL, hasLow, showP, probMode, showProbRow, showPL, showWind,
        iconS, labelH, iconTop, tTop, tempH, tBot, pBarH, pBase, probY, windY, H };
    }

    // Grow / shrink the chart so the card fills the height it was given.
    // If it still does not fit, drop the least important rows one by one.
    _fit() {
      if (!this._geo || this._c.show_chart === false) return;
      if ((this._fitGuard = (this._fitGuard || 0) + 1) > 8) return;
      const cardH = this.$.card.clientHeight;
      const contentH = this.$.content.offsetHeight;
      if (!cardH || !contentH) return;
      const extra = cardH - contentH;
      if (Math.abs(extra) < 2) return;
      // Only fill a height that is given from outside (sections layout, stacks, card_height).
      // Probe: if the card grows when the content grows, its height follows the content – leave it alone.
      if (this._imposed === undefined) {
        const probe = document.createElement('div');
        probe.style.cssText = 'height:24px;flex:none';
        this.$.content.appendChild(probe);
        const grown = this.$.card.clientHeight - cardH;
        probe.remove();
        this._imposed = Math.abs(grown) < 2;
      }
      if (!this._imposed) {
        if (this._fitDelta || this._squeeze) { this._fitDelta = 0; this._squeeze = 0; this._drawCharts(); }
        // stretched by a parent whose height depends on us: just hug the content
        if (extra > 2 && !(num(this._c.card_height) > 0)) this.$.card.style.height = 'auto';
        return;
      }
      this._squeeze = this._squeeze || 0;
      this._squeezeCost = this._squeezeCost || [];
      // room again for a dropped row?
      if (extra > 0 && this._squeeze > 0 && extra >= (this._squeezeCost[this._squeeze] || 0) + 4) {
        this._squeeze--;
        this._drawCharts();
        this._fit();
        return;
      }
      const share = this._flexShare || 1;
      const cur = this._fitDelta || 0;
      const minDelta = this._flexBase == null ? 0 : (this._flexMin - this._flexBase) / share;
      const next = this._flexBase == null ? cur : clamp(cur + extra / share, minDelta, 4000);
      if (Math.abs(next - cur) >= 1) {
        this._fitDelta = next;
        this._drawCharts();
        this._fit();
        return;
      }
      if (extra < -2 && this._squeeze < 3) {
        const before = this.$.content.offsetHeight;
        this._squeeze++;
        this._drawCharts();
        this._squeezeCost[this._squeeze] = Math.max(0, before - this.$.content.offsetHeight);
        this._fit();
      }
    }

    _chartSVG(type, list, W, g) {
      const c = this._c, T = this._T, s = g.s;
      const daily = type === 'daily';
      const n = list.length;
      const colW = W / n;
      const X = (i) => colW * (i + 0.5);
      const anim = this._animIn && c.animate !== false && c.chart_animation !== false;
      const dl = (i, base = 0) => (anim ? ` style="animation-delay:${(base + i * 0.04).toFixed(2)}s"` : '');
      const narrowCol = colW < 46 * s;
      const H = g.H;

      const pc = c.custom_colors ? toRgb(c.precip_color) : null;
      const pTop = pc || [166, 214, 255];
      const pBot = pc ? mix(pc, [40, 90, 200], 0.35) : [76, 152, 255];
      let defs = `
        <linearGradient id="lcPR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rgba(pTop)}"/><stop offset="1" stop-color="${rgba(pBot)}" stop-opacity=".5"/></linearGradient>
        <linearGradient id="lcPS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfe0ff" stop-opacity=".5"/></linearGradient>
        <linearGradient id="lcPM" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2f1ff"/><stop offset="1" stop-color="#7fb4ff" stop-opacity=".5"/></linearGradient>
        <radialGradient id="lcSun" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff6c8"/><stop offset=".55" stop-color="#ffd24d"/><stop offset="1" stop-color="#ff9f2e"/></radialGradient>
        <linearGradient id="lcMoon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbe8"/><stop offset="1" stop-color="#e0d9bb"/></linearGradient>
        <linearGradient id="lcCL" gradientUnits="userSpaceOnUse" x1="0" y1="7" x2="0" y2="25"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3dcea"/></linearGradient>
        <linearGradient id="lcCG" gradientUnits="userSpaceOnUse" x1="0" y1="7" x2="0" y2="25"><stop offset="0" stop-color="#eef1f6"/><stop offset="1" stop-color="#9eaabb"/></linearGradient>
        <linearGradient id="lcCD" gradientUnits="userSpaceOnUse" x1="0" y1="7" x2="0" y2="25"><stop offset="0" stop-color="#b6bdcc"/><stop offset="1" stop-color="#5b6379"/></linearGradient>
        <filter id="lcGlow" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
      let b = '';
      const first = new Date(list[0].datetime);

      if (c.show_now_highlight !== false && (!daily || dayDiff(new Date(), first) === 0)) {
        b += `<rect x="2" y="1" width="${f1(colW - 4)}" height="${H - 2}" rx="${f1(11 * s)}" fill="rgba(255,255,255,.08)"/>`;
      }

      // day separators (hourly)
      if (!daily && c.show_day_separators !== false) {
        list.forEach((f, i) => {
          const d = new Date(f.datetime);
          if (i > 0 && new Date(list[i - 1].datetime).getDate() !== d.getDate()) {
            const sx = f1(colW * i);
            b += `<line x1="${sx}" y1="4" x2="${sx}" y2="${H - 4}" stroke="rgba(255,255,255,.2)" stroke-dasharray="2 3"/>`;
            if (g.showTime) b += `<text class="tday" x="${f1(X(i))}" y="${f1(9 * s)}" text-anchor="middle">${esc(this._wd(d).toUpperCase())}</text>`;
          }
        });
      }

      // time labels
      if (g.showTime) {
        list.forEach((f, i) => {
          const d = new Date(f.datetime);
          const cx = f1(X(i));
          if (daily) {
            const isToday = dayDiff(new Date(), d) === 0;
            b += `<text class="tl${isToday ? ' now' : ''}" x="${cx}" y="${f1(13 * s)}" text-anchor="middle">${esc(isToday ? T.today : this._wd(d))}</text>`;
            b += `<text class="td" x="${cx}" y="${f1(25 * s)}" text-anchor="middle">${esc(this._dm(d))}</text>`;
          } else {
            const lbl = i === 0 ? T.now : narrowCol ? pad2(d.getHours()) : this._time(d);
            b += `<text class="tl${i === 0 ? ' now' : ''}" x="${cx}" y="${f1(23 * s)}" text-anchor="middle">${esc(lbl)}</text>`;
          }
        });
      }

      // icons
      if (g.showIcons) {
        const sc = (g.iconS / 32).toFixed(3);
        list.forEach((f, i) => {
          const night = !daily && this._isNight(f);
          b += `<g class="pop"${dl(i, 0.1)}><g transform="translate(${f1(X(i) - g.iconS / 2)},${f1(g.iconTop)}) scale(${sc})">${icon(f.condition, night)}</g></g>`;
        });
      }

      // precipitation
      if (g.showP) {
        const P = list.map((f) => Math.max(0, num(f.precipitation) || 0));
        const PR = list.map((f) => clamp(num(f.precipitation_probability), 0, 100));
        const maxP = Math.max(...P);
        const step = daily ? 1 : Math.max(1, num(c.hourly_step) || 1);
        const scaleP = Math.max(maxP, daily ? 6 : 1.5 * step);
        const bw = clamp(colW * 0.46, 5, 22 * s);
        const pBase = g.pBase, pBarH = g.pBarH;
        b += `<line x1="6" y1="${f1(pBase + 0.5)}" x2="${f1(W - 6)}" y2="${f1(pBase + 0.5)}" stroke="rgba(255,255,255,.2)"/>`;
        const nothing = g.probMode ? !PR.some((v) => v > 0) : maxP <= 0 && !g.showProbRow;
        if (nothing && pBarH >= 14) {
          b += `<text class="tnone" x="${f1(W / 2)}" y="${f1(pBase - pBarH / 2 + 3)}" text-anchor="middle">${esc(T.noPrecip)}</text>`;
        }
        const showUnit = colW >= 54 * s;
        list.forEach((f, i) => {
          const cx = X(i), x0 = cx - bw / 2, x1 = cx + bw / 2;
          const prob = PR[i];
          const kind = this._precipKind(f);
          const fill = kind === 'snow' ? 'lcPS' : kind === 'sleet' ? 'lcPM' : 'lcPR';
          if (g.probMode) {
            if (prob > 0) {
              const bh = Math.max(2.5, (prob / 100) * pBarH);
              b += `<path class="grow" d="${barPath(x0, x1, pBase, pBase - bh, 4 * s)}" fill="url(#${fill})"${dl(i, 0.35)}/>`;
              if (g.showPL) b += `<text class="tp fade" x="${f1(cx)}" y="${f1(pBase - bh - 4 * s)}" text-anchor="middle"${dl(i, 0.7)}>${Math.round(prob)}%</text>`;
            }
            return;
          }
          if (g.showProbRow && prob > 0) {
            const gh = (prob / 100) * pBarH;
            b += `<path class="grow" d="${barPath(x0 - 2.5, x1 + 2.5, pBase, pBase - gh, 4 * s)}" fill="rgba(150,200,255,.16)"${dl(i, 0.3)}/>`;
          }
          if (P[i] > 0) {
            const bh = Math.max(2.5, (P[i] / scaleP) * pBarH);
            b += `<path class="grow" d="${barPath(x0, x1, pBase, pBase - bh, 4 * s)}" fill="url(#${fill})"${dl(i, 0.35)}/>`;
            if (g.showPL) {
              const v = this._num(P[i], P[i] >= 10 ? 0 : 1);
              b += `<text class="tp fade${kind === 'snow' ? ' snow' : ''}" x="${f1(cx)}" y="${f1(pBase - bh - 4 * s)}" text-anchor="middle"${dl(i, 0.7)}>${v}${showUnit ? '<tspan class="u" dx="1.5">mm</tspan>' : ''}</text>`;
            }
          }
          if (g.showProbRow && prob > 0) {
            b += `<text class="tpr fade" x="${f1(cx)}" y="${f1(g.probY)}" text-anchor="middle"${dl(i, 0.7)}>${Math.round(prob)}%</text>`;
          }
        });
      }

      // temperature
      if (g.showTemp) {
        const hi = list.map((f) => num(f.temperature));
        const lo = daily && g.hasLow ? list.map((f) => num(f.templow)) : [];
        const hasLow = lo.some(Number.isFinite);
        const all = [...hi, ...lo].filter(Number.isFinite);
        if (all.length) {
          let mn = Math.min(...all), mx = Math.max(...all);
          if (mx - mn < 4) { const m = (mx + mn) / 2; mn = m - 2; mx = m + 2; }
          const Y = (t) => g.tBot - ((t - mn) / (mx - mn)) * g.tempH;
          const fixed = c.temp_color_mode === 'fixed' ? toRgb(c.temp_color) || [255, 214, 102] : null;
          const tcol = (t) => fixed || tempColor(this._tempC(t));
          let stops = '';
          for (let k = 0; k <= 6; k++) {
            const t = mx - ((mx - mn) * k) / 6;
            stops += `<stop offset="${(k / 6).toFixed(3)}" stop-color="${rgba(tcol(t))}"/>`;
          }
          defs += `<linearGradient id="lcT" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(Y(mx))}" x2="0" y2="${f1(Y(mn))}">${stops}</linearGradient>`;
          const cTop = rgba(tcol(mx)), cBot = rgba(tcol(mn));
          const areaBottom = g.showP ? g.pBase : g.tBot + 10 * s;
          defs += `<linearGradient id="lcA" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(Y(mx))}" x2="0" y2="${f1(areaBottom)}"><stop offset="0" stop-color="${cTop}" stop-opacity=".34"/><stop offset="1" stop-color="${cBot}" stop-opacity="0"/></linearGradient>`;
          defs += `<linearGradient id="lcB" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(Y(mx))}" x2="0" y2="${f1(Y(mn))}"><stop offset="0" stop-color="${cTop}" stop-opacity=".32"/><stop offset="1" stop-color="${cBot}" stop-opacity=".1"/></linearGradient>`;

          const pts = (arr) => arr.map((t, i) => (Number.isFinite(t) ? [X(i), Y(t)] : null)).filter(Boolean);
          const ext = (p) => (p.length ? [[0, p[0][1]], ...p, [W, p[p.length - 1][1]]] : p);
          const dHi = monotone(ext(pts(hi)));
          const fadeA = anim ? ' style="animation-delay:.45s"' : '';
          if (hasLow) {
            const eLo = ext(pts(lo));
            const dLo = monotone(eLo);
            const dLoRev = monotone(eLo.slice().reverse());
            b += `<path class="fade" d="${dHi}L${dLoRev.slice(1)}Z" fill="url(#lcB)"${fadeA}/>`;
            b += `<path class="ln" pathLength="1" d="${dLo}" fill="none" stroke="url(#lcT)" stroke-width="${f1(1.8 * s)}" stroke-opacity=".7" stroke-linecap="round"/>`;
            lo.forEach((t, i) => {
              if (!Number.isFinite(t)) return;
              const y = Y(t);
              b += `<circle class="pop" cx="${f1(X(i))}" cy="${f1(y)}" r="${f1(2.4 * s)}" fill="#fff" fill-opacity=".85"${dl(i, 0.5)}/>`;
              if (g.showTL) b += `<text class="tlow fade" x="${f1(X(i))}" y="${f1(y + 16 * s)}" text-anchor="middle"${dl(i, 0.6)}>${this._fmtT(t)}°</text>`;
            });
          } else {
            b += `<path class="fade" d="${dHi}L${f1(W)},${f1(areaBottom)}L0,${f1(areaBottom)}Z" fill="url(#lcA)"${fadeA}/>`;
          }
          b += `<path class="ln" pathLength="1" d="${dHi}" fill="none" stroke="url(#lcT)" stroke-width="${f1(2.8 * s)}" stroke-linecap="round" filter="url(#lcGlow)"/>`;
          hi.forEach((t, i) => {
            if (!Number.isFinite(t)) return;
            const y = Y(t);
            b += `<circle class="pop" cx="${f1(X(i))}" cy="${f1(y)}" r="${f1(3.3 * s)}" fill="#fff" stroke="${rgba(tcol(t))}" stroke-width="2"${dl(i, 0.5)}/>`;
            if (g.showTL) b += `<text class="tt fade" x="${f1(X(i))}" y="${f1(y - 9 * s)}" text-anchor="middle"${dl(i, 0.6)}>${this._fmtT(t)}°</text>`;
          });
        }
      }

      // wind
      if (g.showWind) {
        list.forEach((f, i) => {
          const sp = num(f.wind_speed);
          if (!Number.isFinite(sp)) return;
          const v = this._num(fromMs(toMs(sp, this._srcWind), this._windUnit), 0);
          const bd = bearingDeg(f.wind_bearing);
          const unit = i === 0 || colW >= 60 * s ? this._windUnit : '';
          const tw = (v.length * 6 + (unit ? unit.length * 4.6 + 2 : 0)) * s;
          const cx = X(i) + 5 * s;
          const ax = cx - tw / 2 - 7 * s;
          const arrow = Number.isFinite(bd)
            ? `<g transform="translate(${f1(ax)},${f1(g.windY - 4 * s)}) rotate(${Math.round((bd + 180) % 360)}) scale(${s.toFixed(2)})"><path class="warr" d="M0,-5L3.4,4.2L0,2.3L-3.4,4.2Z"/></g>`
            : '';
          b += `<g class="fade"${dl(i, 0.8)}>${arrow}<text class="tw" x="${f1(cx)}" y="${f1(g.windY)}" text-anchor="middle">${v}${unit ? `<tspan class="u" dx="1.5">${esc(unit)}</tspan>` : ''}</text></g>`;
        });
      }

      const cls = `c${anim ? ' anim' : ''}${c.animated_icons !== false ? ' ia' : ''}`;
      return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${b}</svg>`;
    }

    _fmtT(t) {
      return this._num(t, this._c.round_temp === true || Number.isInteger(t) ? 0 : 1);
    }
  }

  // ---------------------------------------------------------------- visual editor
  const ED = {
    sv: {
      sections: {
        data: 'Väderdata', forecast: 'Prognos – vad och hur', current: 'Aktuellt väder', nowcast: 'Regnsammanfattning',
        size: 'Storlek', look: 'Utseende', animation: 'Animation', sensors: 'Egna sensorer', actions: 'Tryck och håll',
      },
      tip: 'Allt går att ändra här. Tips: i sektionsvyn kan du även ändra kortets storlek under fliken <b>Layout</b> – kortet fyller då ut höjden automatiskt.',
      loading: 'Laddar redigeraren…',
      opt: {
        locale: [['auto', 'Samma som Home Assistant'], ['sv', 'Svenska'], ['en', 'English']],
        mode: [['tabs', 'Flikar – Timmar / Dagar'], ['hourly', 'Bara timmar'], ['daily', 'Bara dagar'],
          ['side_by_side', 'Timmar och dagar bredvid varandra'], ['stacked', 'Timmar och dagar ovanför varandra']],
        firstTab: [['hourly', 'Timmar'], ['daily', 'Dagar']],
        precipType: [['amount', 'Mängd (mm)'], ['probability', 'Sannolikhet (%)']],
        windUnit: [['auto', 'Samma som väderentiteten'], ['m/s', 'm/s'], ['km/h', 'km/h'], ['mph', 'mph'], ['kn', 'knop']],
        header: [['large', 'Stor temperatur'], ['compact', 'Kompakt']],
        tempColor: [['gradient', 'Efter temperaturen (blå → orange)'], ['fixed', 'En egen färg']],
        metrics: [['humidity', 'Luftfuktighet'], ['wind', 'Vind (med byar och riktning)'], ['pressure', 'Lufttryck'],
          ['sun', 'Soluppgång / solnedgång'], ['feels_like', 'Känns som'], ['uv_index', 'UV-index'], ['visibility', 'Sikt'],
          ['dew_point', 'Daggpunkt'], ['cloud_coverage', 'Molnighet'], ['precipitation', 'Nederbörd denna timme'],
          ['indoor_temperature', 'Temperatur inne (välj sensor under Egna sensorer)'],
          ['indoor_humidity', 'Luftfuktighet inne (välj sensor under Egna sensorer)']],
      },
      labels: {
        entity: 'Väderentitet', name: 'Namn', locale: 'Språk', sun_entity: 'Solentitet',
        scale: 'Skala på text och ikoner', card_height: 'Fast höjd på kortet', padding: 'Inre marginal',
        temp_size: 'Storlek på stora temperaturen', border_radius: 'Hörnradie', chart_height: 'Höjd på temperaturkurvan',
        precip_height: 'Höjd på nederbördsstaplarna', column_width: 'Minsta kolumnbredd', icon_size: 'Storlek på väderikoner',
        show_current: 'Visa aktuellt väder', header_style: 'Stil', show_name: 'Namn', show_condition: 'Väderläge (text)',
        show_hilo: 'Max/min idag', show_feels_like: 'Känns som', temperature_decimals: 'Decimaler i temperaturen',
        show_metrics: 'Visa mätvärden', metrics: 'Mätvärden att visa', show_metric_icons: 'Ikoner',
        show_metric_labels: 'Etiketter', metrics_columns: 'Antal kolumner för mätvärden',
        show_chart: 'Visa prognos', forecast_mode: 'Visning', forecast_type: 'Flik som visas först', split: 'Andel av bredden för timmar',
        stack_below: 'Lägg dem under varandra om kortet är smalare än', hours_to_show: 'Antal timmar', days_to_show: 'Antal dagar',
        hourly_step: 'Timsteg', show_time_labels: 'Tider och dagar', show_icons: 'Väderikoner', show_temperature: 'Temperaturkurva',
        show_temp_labels: 'Temperaturvärden', show_low_temp: 'Lägsta temperatur (dagar)', round_temp: 'Avrunda till heltal',
        show_now_highlight: 'Markera nu / idag', show_day_separators: 'Dygnsavdelare', show_precipitation: 'Visa nederbörd',
        precipitation_type: 'Staplarna visar', show_precip_labels: 'Värden ovanför staplarna', show_probability: 'Sannolikhet i %',
        show_wind: 'Visa vind', wind_unit: 'Vindenhet',
        show_nowcast: 'Visa raden om regn', nowcast_threshold: 'Räkna som nederbörd från', nowcast_hours: 'Titta så långt framåt',
        temperature_entity: 'Temperatur', feels_like_entity: 'Känns som', humidity_entity: 'Luftfuktighet', pressure_entity: 'Lufttryck',
        wind_speed_entity: 'Vindhastighet', wind_gust_entity: 'Vindbyar', wind_bearing_entity: 'Vindriktning', uv_entity: 'UV-index',
        indoor_temperature_entity: 'Temperatur inne', indoor_humidity_entity: 'Luftfuktighet inne',
        sky_opacity: 'Himlens synlighet', panel_opacity: 'Styrka på bakgrundsrutorna', temp_color_mode: 'Färg på temperaturkurvan',
        temp_color: 'Kurvans färg', custom_colors: 'Egna färger', precip_color: 'Färg på nederbörd', text_color: 'Textfärg',
        animate: 'Animerad himmel', max_fps: 'Max bilder per sekund', cloud_amount: 'Mängd moln', precip_amount: 'Mängd regn och snö',
        wind_effect: 'Vindens påverkan', day_night: 'Dag och natt efter solen', show_stars: 'Stjärnor', shooting_stars: 'Stjärnfall',
        sun_rays: 'Solstrålar', rain_splash: 'Regnstänk', lightning_flash: 'Blixtsken', animated_icons: 'Animerade ikoner',
        chart_animation: 'Rita upp diagrammet', tap_action: 'Vid tryck', hold_action: 'Vid långt tryck',
      },
      helpers: {
        name: 'Tomt = väderentitetens namn',
        scale: '1 = normal. Gör allt större eller mindre på en gång.',
        card_height: '0 = automatisk. I sektionsvyn kan du också dra i storleken under fliken Layout – kortet fyller ut höjden.',
        temp_size: '0 = automatisk',
        border_radius: 'Tomt = temats standard',
        column_width: '0 = automatisk. Styr hur många timmar/dagar som får plats.',
        icon_size: '0 = automatisk',
        temperature_decimals: 'Tomt = automatiskt',
        metrics_columns: '0 = automatiskt',
        split: 'Procent. Resten går till dagarna.',
        hours_to_show: '0 = så många som får plats',
        days_to_show: '0 = så många som får plats',
        hourly_step: '1 = varje timme, 3 = var tredje timme (nederbörden summeras)',
        nowcast_threshold: 'Mindre mängd än så räknas som uppehåll',
        sky_opacity: '1 = helt synlig. Lägre låter bakgrunden på instrumentpanelen lysa igenom.',
        panel_opacity: '0 = inga rutor, 1 = standard, 2 = mörkare',
        max_fps: 'Lägre värde belastar plattan mindre',
        wind_effect: 'Hur mycket vinden driver moln och regn',
      },
    },
    en: {
      sections: {
        data: 'Weather data', forecast: 'Forecast – what and how', current: 'Current weather', nowcast: 'Rain summary',
        size: 'Size', look: 'Appearance', animation: 'Animation', sensors: 'Custom sensors', actions: 'Tap and hold',
      },
      tip: 'Everything can be changed here. Tip: in the sections view you can also resize the card on the <b>Layout</b> tab – the card then fills the height.',
      loading: 'Loading editor…',
      opt: {
        locale: [['auto', 'Same as Home Assistant'], ['sv', 'Svenska'], ['en', 'English']],
        mode: [['tabs', 'Tabs – Hourly / Daily'], ['hourly', 'Hourly only'], ['daily', 'Daily only'],
          ['side_by_side', 'Hourly and daily side by side'], ['stacked', 'Hourly above daily']],
        firstTab: [['hourly', 'Hourly'], ['daily', 'Daily']],
        precipType: [['amount', 'Amount (mm)'], ['probability', 'Probability (%)']],
        windUnit: [['auto', 'Same as the weather entity'], ['m/s', 'm/s'], ['km/h', 'km/h'], ['mph', 'mph'], ['kn', 'knots']],
        header: [['large', 'Large temperature'], ['compact', 'Compact']],
        tempColor: [['gradient', 'By temperature (blue → orange)'], ['fixed', 'Single colour']],
        metrics: [['humidity', 'Humidity'], ['wind', 'Wind (with gusts and direction)'], ['pressure', 'Pressure'],
          ['sun', 'Sunrise / sunset'], ['feels_like', 'Feels like'], ['uv_index', 'UV index'], ['visibility', 'Visibility'],
          ['dew_point', 'Dew point'], ['cloud_coverage', 'Cloud coverage'], ['precipitation', 'Precipitation this hour'],
          ['indoor_temperature', 'Indoor temperature (pick a sensor under Custom sensors)'],
          ['indoor_humidity', 'Indoor humidity (pick a sensor under Custom sensors)']],
      },
      labels: {
        entity: 'Weather entity', name: 'Name', locale: 'Language', sun_entity: 'Sun entity',
        scale: 'Scale (text and icons)', card_height: 'Fixed card height', padding: 'Padding',
        temp_size: 'Big temperature size', border_radius: 'Corner radius', chart_height: 'Temperature curve height',
        precip_height: 'Precipitation bar height', column_width: 'Minimum column width', icon_size: 'Weather icon size',
        show_current: 'Show current weather', header_style: 'Style', show_name: 'Name', show_condition: 'Condition text',
        show_hilo: 'High / low today', show_feels_like: 'Feels like', temperature_decimals: 'Temperature decimals',
        show_metrics: 'Show metrics', metrics: 'Metrics to show', show_metric_icons: 'Icons',
        show_metric_labels: 'Labels', metrics_columns: 'Metric columns',
        show_chart: 'Show forecast', forecast_mode: 'Layout', forecast_type: 'Tab shown first', split: 'Width share for hourly',
        stack_below: 'Stack them when the card is narrower than', hours_to_show: 'Hours', days_to_show: 'Days',
        hourly_step: 'Hour step', show_time_labels: 'Times and days', show_icons: 'Weather icons', show_temperature: 'Temperature curve',
        show_temp_labels: 'Temperature values', show_low_temp: 'Low temperature (daily)', round_temp: 'Round to whole degrees',
        show_now_highlight: 'Highlight now / today', show_day_separators: 'Day separators', show_precipitation: 'Show precipitation',
        precipitation_type: 'Bars show', show_precip_labels: 'Values above bars', show_probability: 'Probability in %',
        show_wind: 'Show wind', wind_unit: 'Wind unit',
        show_nowcast: 'Show rain summary', nowcast_threshold: 'Count as precipitation from', nowcast_hours: 'Look ahead',
        temperature_entity: 'Temperature', feels_like_entity: 'Feels like', humidity_entity: 'Humidity', pressure_entity: 'Pressure',
        wind_speed_entity: 'Wind speed', wind_gust_entity: 'Wind gust', wind_bearing_entity: 'Wind direction', uv_entity: 'UV index',
        indoor_temperature_entity: 'Indoor temperature', indoor_humidity_entity: 'Indoor humidity',
        sky_opacity: 'Sky visibility', panel_opacity: 'Panel strength', temp_color_mode: 'Temperature curve colour',
        temp_color: 'Curve colour', custom_colors: 'Custom colours', precip_color: 'Precipitation colour', text_color: 'Text colour',
        animate: 'Animated sky', max_fps: 'Max frames per second', cloud_amount: 'Cloud amount', precip_amount: 'Rain and snow amount',
        wind_effect: 'Wind effect', day_night: 'Day and night from the sun', show_stars: 'Stars', shooting_stars: 'Shooting stars',
        sun_rays: 'Sun rays', rain_splash: 'Rain splashes', lightning_flash: 'Lightning flash', animated_icons: 'Animated icons',
        chart_animation: 'Draw-in animation', tap_action: 'Tap action', hold_action: 'Hold action',
      },
      helpers: {
        name: 'Empty = the weather entity name',
        scale: '1 = normal. Makes everything bigger or smaller at once.',
        card_height: '0 = automatic. In the sections view you can also resize the card on the Layout tab – it fills the height.',
        temp_size: '0 = automatic',
        border_radius: 'Empty = theme default',
        column_width: '0 = automatic. Controls how many hours/days fit.',
        icon_size: '0 = automatic',
        temperature_decimals: 'Empty = automatic',
        metrics_columns: '0 = automatic',
        split: 'Percent. The rest goes to the daily forecast.',
        hours_to_show: '0 = as many as fit',
        days_to_show: '0 = as many as fit',
        hourly_step: '1 = every hour, 3 = every third hour (precipitation is summed)',
        nowcast_threshold: 'Less than this counts as dry',
        sky_opacity: '1 = fully visible. Lower lets the dashboard background shine through.',
        panel_opacity: '0 = no panels, 1 = default, 2 = darker',
        max_fps: 'Lower is lighter on the tablet',
        wind_effect: 'How much the wind moves clouds and rain',
      },
    },
  };
  const opts = (pairs) => pairs.map(([value, label]) => ({ value, label }));

  function editorSchema(d, L) {
    const bool = { boolean: {} };
    const sel = (pairs) => ({ select: { mode: 'dropdown', options: opts(pairs) } });
    const slider = (min, max, step = 1, unit) => ({ number: { min, max, step, mode: 'slider', ...(unit ? { unit_of_measurement: unit } : {}) } });
    const box = (min, max, step = 1, unit) => ({ number: { min, max, step, mode: 'box', ...(unit ? { unit_of_measurement: unit } : {}) } });
    const ent = (domain) => ({ entity: { domain } });
    const exp = (title, icon, schema, expanded = false) => ({ type: 'expandable', name: '', flatten: true, title, icon, expanded, schema });
    const grid = (...schema) => ({ type: 'grid', name: '', flatten: true, schema });
    const f = (name, selector, extra = {}) => ({ name, selector, ...extra });
    const on = (k) => d[k] !== false;
    const mode = d.forecast_mode || 'tabs';
    const S = L.sections, O = L.opt;

    return [
      exp(S.data, 'mdi:weather-partly-cloudy', [
        f('entity', ent('weather'), { required: true }),
        grid(f('name', { text: {} }), f('locale', sel(O.locale))),
        f('sun_entity', ent('sun')),
      ], true),

      exp(S.forecast, 'mdi:chart-bell-curve-cumulative', [
        f('show_chart', bool),
        ...(on('show_chart') ? [
          f('forecast_mode', sel(O.mode)),
          ...(mode === 'tabs' ? [f('forecast_type', sel(O.firstTab))] : []),
          ...(mode === 'side_by_side' ? [grid(f('split', slider(20, 80, 1, '%')), f('stack_below', box(0, 2000, 10, 'px')))] : []),
          grid(
            ...(mode !== 'daily' ? [f('hours_to_show', box(0, 48)), f('hourly_step', box(1, 12))] : []),
            ...(mode !== 'hourly' ? [f('days_to_show', box(0, 16))] : []),
          ),
          grid(
            f('show_time_labels', bool), f('show_icons', bool), f('show_temperature', bool), f('show_temp_labels', bool),
            ...(mode !== 'hourly' ? [f('show_low_temp', bool)] : []),
            f('round_temp', bool), f('show_now_highlight', bool),
            ...(mode !== 'daily' ? [f('show_day_separators', bool)] : []),
          ),
          f('show_precipitation', bool),
          ...(on('show_precipitation') ? [
            f('precipitation_type', sel(O.precipType)),
            grid(f('show_precip_labels', bool), ...(d.precipitation_type !== 'probability' ? [f('show_probability', bool)] : [])),
          ] : []),
          f('show_wind', bool),
          ...(on('show_wind') ? [f('wind_unit', sel(O.windUnit))] : []),
        ] : []),
      ], true),

      exp(S.current, 'mdi:thermometer', [
        f('show_current', bool),
        ...(on('show_current') ? [
          f('header_style', sel(O.header)),
          grid(f('show_name', bool), f('show_condition', bool), f('show_hilo', bool), f('show_feels_like', bool)),
          f('temperature_decimals', box(0, 2)),
          f('show_metrics', bool),
          ...(on('show_metrics') ? [
            f('metrics', { select: { multiple: true, reorder: true, options: opts(O.metrics) } }),
            grid(f('show_metric_icons', bool), f('show_metric_labels', bool)),
            f('metrics_columns', slider(0, 8)),
          ] : []),
        ] : []),
      ]),

      exp(S.nowcast, 'mdi:umbrella-outline', [
        f('show_nowcast', bool),
        ...(on('show_nowcast') ? [grid(f('nowcast_threshold', box(0.01, 5, 0.01, 'mm')), f('nowcast_hours', box(3, 240, 1, 'h')))] : []),
      ]),

      exp(S.size, 'mdi:resize', [
        f('scale', slider(0.5, 2, 0.05)),
        grid(f('card_height', box(0, 2000, 1, 'px')), f('padding', slider(0, 40, 1, 'px'))),
        grid(f('temp_size', slider(0, 160, 1, 'px')), f('border_radius', box(0, 60, 1, 'px'))),
        grid(f('chart_height', slider(16, 300, 1, 'px')), f('precip_height', slider(8, 160, 1, 'px'))),
        grid(f('column_width', slider(0, 160, 1, 'px')), f('icon_size', slider(0, 80, 1, 'px'))),
      ]),

      exp(S.look, 'mdi:palette-outline', [
        grid(f('sky_opacity', slider(0, 1, 0.05)), f('panel_opacity', slider(0, 2, 0.05))),
        f('temp_color_mode', sel(O.tempColor)),
        ...(d.temp_color_mode === 'fixed' ? [f('temp_color', { color_rgb: {} })] : []),
        f('custom_colors', bool),
        ...(d.custom_colors ? [grid(f('precip_color', { color_rgb: {} }), f('text_color', { color_rgb: {} }))] : []),
      ]),

      exp(S.animation, 'mdi:animation-play-outline', [
        f('animate', bool),
        ...(on('animate') ? [
          f('max_fps', slider(5, 60, 1)),
          grid(f('cloud_amount', slider(0, 3, 0.1)), f('precip_amount', slider(0, 3, 0.1))),
          f('wind_effect', slider(0, 3, 0.1)),
          grid(f('day_night', bool), f('show_stars', bool), f('shooting_stars', bool), f('sun_rays', bool), f('rain_splash', bool), f('lightning_flash', bool)),
        ] : []),
        grid(f('animated_icons', bool), f('chart_animation', bool)),
      ]),

      exp(S.sensors, 'mdi:tune-variant', [
        f('temperature_entity', ent('sensor')),
        f('feels_like_entity', ent('sensor')),
        f('humidity_entity', ent('sensor')),
        f('pressure_entity', ent('sensor')),
        f('wind_speed_entity', ent('sensor')),
        f('wind_gust_entity', ent('sensor')),
        f('wind_bearing_entity', ent('sensor')),
        f('uv_entity', ent('sensor')),
        f('indoor_temperature_entity', ent('sensor')),
        f('indoor_humidity_entity', ent('sensor')),
      ]),

      exp(S.actions, 'mdi:gesture-tap', [
        f('tap_action', { ui_action: { default_action: 'more-info' } }),
        f('hold_action', { ui_action: { default_action: 'none' } }),
      ]),
    ];
  }

  // Make sure HA's own form elements are loaded before the editor renders.
  async function loadEditorDeps() {
    if (customElements.get('ha-form') && customElements.get('ha-entity-picker')) return;
    try {
      const helpers = await window.loadCardHelpers?.();
      if (helpers) {
        const c = await helpers.createCardElement({ type: 'entities', entities: [] });
        await c?.constructor?.getConfigElement?.();
      }
    } catch (e) { /* ignore */ }
    await Promise.race([customElements.whenDefined('ha-form'), new Promise((r) => setTimeout(r, 3000))]);
  }

  // Remove empty values and anything that equals the default, so the YAML stays short.
  function cleanConfig(value, type) {
    const out = { type: type || `custom:${TAG}` };
    if (value.entity) out.entity = value.entity;
    for (const [k, v] of Object.entries(value)) {
      if (k === 'type' || k === 'entity') continue;
      if (v === undefined || v === null || v === '') continue;
      if (k in DEFAULTS && same(v, DEFAULTS[k])) continue;
      out[k] = v;
    }
    return out;
  }

  class SkycastCardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    setConfig(config) {
      this._config = { ...config };
      this._update();
    }

    set hass(hass) {
      const before = this._langKey();
      this._hass = hass;
      if (this._form) this._form.hass = hass;
      if (this._form && this._langKey() !== before) { this._form = null; this._update(); }
    }

    connectedCallback() {
      this._update();
    }

    // Editor language: the card's own locale if set, otherwise Home Assistant's language.
    _langKey() {
      const own = this._config?.locale;
      const l = own && own !== 'auto' ? own : this._hass?.locale?.language || this._hass?.language || 'en';
      return String(l).toLowerCase().startsWith('sv') ? 'sv' : 'en';
    }

    _update() {
      if (!this._config) return;
      const L = ED[this._langKey()];
      if (!customElements.get('ha-form')) {
        this.shadowRoot.innerHTML = `<p style="padding:8px 0">${L.loading}</p>`;
        customElements.whenDefined('ha-form').then(() => { this._form = null; this._update(); });
        return;
      }
      if (!this._form || this._formLang !== this._langKey()) {
        this._formLang = this._langKey();
        this.shadowRoot.innerHTML = `<style>
          .tip { font-size: 13px; line-height: 1.4; color: var(--secondary-text-color); margin: 0 0 12px; }
        </style>
        <p class="tip">${L.tip}</p>`;
        this._form = document.createElement('ha-form');
        this._form.computeLabel = (s) => ED[this._formLang].labels[s.name] ?? s.name;
        this._form.computeHelper = (s) => ED[this._formLang].helpers[s.name];
        this._form.addEventListener('value-changed', (ev) => this._changed(ev));
        this.shadowRoot.appendChild(this._form);
      }
      const data = { ...DEFAULTS, ...normalize(this._config), ...this._config };
      // show "auto" choices for things that are unset
      if (data.temperature_decimals === null) delete data.temperature_decimals;
      if (data.border_radius === null) delete data.border_radius;
      this._form.hass = this._hass;
      this._form.data = data;
      this._form.schema = editorSchema(data, L);
    }

    _changed(ev) {
      ev.stopPropagation();
      const config = cleanConfig(ev.detail.value || {}, this._config?.type);
      // legacy keys are replaced by the new ones once edited in the GUI
      delete config.show_tabs;
      delete config.number_of_forecasts;
      if (same(config, this._config)) return;
      this._config = config;
      this._update();
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SkycastCard);
  if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, SkycastCardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === TAG)) {
    window.customCards.push({
      type: TAG,
      name: 'Skycast Card',
      description: 'Animated sky with an hourly / daily forecast chart, precipitation bars and a rain summary.',
      preview: true,
      documentationURL: 'https://github.com/em0g/skycast-card',
    });
  }
  console.info(`%c SKYCAST-CARD %c v${VERSION} `, 'color:#fff;background:#3d8de0;font-weight:700;border-radius:4px 0 0 4px;padding:2px 4px', 'color:#3d8de0;background:#e8f2ff;border-radius:0 4px 4px 0;padding:2px 4px');
})();
