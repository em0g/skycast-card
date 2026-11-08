/*
 * Demo only: a small stand-in for Home Assistant's <ha-form>.
 * It renders the same schema the card's editor sends to Home Assistant,
 * using plain HTML controls, so the editor can be tried outside HA.
 */
(() => {
  if (customElements.get('ha-form')) return;

  const hex = (rgb) => '#' + (Array.isArray(rgb) ? rgb : [0, 0, 0]).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const ACTIONS = ['more-info', 'none', 'toggle', 'navigate', 'url', 'perform-action', 'assist'];

  const CSS = `
    :host { display: block; font: 14px/1.4 Roboto, "Segoe UI", system-ui, sans-serif; color: #1f2937; }
    details { border: 1px solid #e3e6ea; border-radius: 12px; margin: 0 0 10px; background: #fff; }
    summary { cursor: pointer; padding: 12px 14px; font-weight: 600; list-style: none; display: flex; align-items: center; gap: 8px; }
    summary::before { content: '▸'; color: #6b7280; transition: transform .15s; }
    details[open] > summary::before { transform: rotate(90deg); }
    .body { padding: 2px 14px 14px; display: grid; gap: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px 14px; }
    .field { display: grid; gap: 4px; }
    .field > span { font-size: 12px; font-weight: 600; color: #4b5563; }
    .field small { font-size: 11.5px; color: #6b7280; }
    .field.boolean { grid-template-columns: auto 1fr; align-items: center; gap: 8px; }
    .field.boolean > span { font-weight: 500; font-size: 13px; color: #1f2937; }
    input[type=text], input[type=number], select { font: inherit; padding: 7px 9px; border: 1px solid #cfd5dc; border-radius: 8px; background: #fff; min-width: 0; }
    .range { display: flex; align-items: center; gap: 8px; }
    .range input { flex: 1; }
    .range output { min-width: 46px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12.5px; color: #374151; }
    .multi { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 4px 12px; }
    .multi label { display: flex; gap: 6px; align-items: center; font-size: 13px; }
    .multi .ord { font-size: 11px; color: #2563eb; font-weight: 700; min-width: 14px; }
    input[type=color] { width: 56px; height: 32px; border: 1px solid #cfd5dc; border-radius: 8px; padding: 2px; background: #fff; }
  `;

  class MockHaForm extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._open = new Set();
      this._closed = new Set();
      this._sig = '';
      this._data = {};
      this._schema = [];
    }
    set hass(h) {
      const first = !this._hass && h;
      this._hass = h;
      if (first) { this._sig = ''; this._queue(); } // entity lists need the states
    }
    get hass() { return this._hass; }
    set data(d) { this._data = d || {}; this._queue(); }
    get data() { return this._data; }
    set schema(s) { this._schema = s || []; this._queue(); }
    get schema() { return this._schema; }

    _queue() {
      if (this._q) return;
      this._q = true;
      queueMicrotask(() => { this._q = false; this._render(); });
    }

    _render() {
      const sig = JSON.stringify(this._schema);
      if (sig !== this._sig) {
        this._sig = sig;
        this._controls = new Map();
        this.shadowRoot.innerHTML = `<style>${CSS}</style>`;
        const wrap = document.createElement('div');
        this._schema.forEach((it) => wrap.appendChild(this._item(it)));
        this.shadowRoot.appendChild(wrap);
      }
      for (const [name, set] of this._controls) set(this._data[name]);
    }

    _item(item) {
      if (item.type === 'expandable') {
        const det = document.createElement('details');
        const key = item.title || item.name;
        det.open = this._open.has(key) || (!!item.expanded && !this._closed.has(key));
        det.addEventListener('toggle', () => {
          if (det.open) { this._open.add(key); this._closed.delete(key); } else { this._open.delete(key); this._closed.add(key); }
        });
        const sum = document.createElement('summary');
        sum.textContent = item.title || '';
        det.appendChild(sum);
        const body = document.createElement('div');
        body.className = 'body';
        item.schema.forEach((s) => body.appendChild(this._item(s)));
        det.appendChild(body);
        return det;
      }
      if (item.type === 'grid') {
        const g = document.createElement('div');
        g.className = 'grid';
        item.schema.forEach((s) => g.appendChild(this._item(s)));
        return g;
      }
      return this._field(item);
    }

    _field(item) {
      const sel = item.selector || {};
      const type = Object.keys(sel)[0];
      const o = sel[type] || {};
      const row = document.createElement('label');
      row.className = `field ${type}`;
      const label = document.createElement('span');
      label.textContent = (this.computeLabel && this.computeLabel(item)) || item.name;
      const help = this.computeHelper && this.computeHelper(item);
      const emit = (v) => this._emit(item.name, v);
      let set = () => {};

      if (type === 'boolean') {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.addEventListener('change', () => emit(cb.checked));
        set = (v) => { cb.checked = !!v; };
        row.append(cb, label);
      } else if (type === 'number' && o.mode === 'slider') {
        const wrap = document.createElement('div');
        wrap.className = 'range';
        const r = document.createElement('input');
        r.type = 'range';
        r.min = o.min; r.max = o.max; r.step = o.step || 1;
        const out = document.createElement('output');
        const unit = o.unit_of_measurement ? ` ${o.unit_of_measurement}` : '';
        r.addEventListener('input', () => { out.textContent = r.value + unit; emit(Number(r.value)); });
        set = (v) => { if (v !== undefined && v !== null) r.value = v; out.textContent = (v ?? '–') + unit; };
        wrap.append(r, out);
        row.append(label, wrap);
      } else if (type === 'number') {
        const inp = document.createElement('input');
        inp.type = 'number';
        if (o.min !== undefined) inp.min = o.min;
        if (o.max !== undefined) inp.max = o.max;
        inp.step = o.step || 1;
        inp.placeholder = o.unit_of_measurement || '';
        inp.addEventListener('change', () => emit(inp.value === '' ? undefined : Number(inp.value)));
        set = (v) => { if (this.shadowRoot.activeElement !== inp) inp.value = v ?? ''; };
        row.append(label, inp);
      } else if (type === 'select' && o.multiple) {
        const box = document.createElement('div');
        box.className = 'multi';
        const opts = (o.options || []).map((x) => (typeof x === 'string' ? { value: x, label: x } : x));
        const boxes = opts.map((opt) => {
          const l = document.createElement('label');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          const ord = document.createElement('span');
          ord.className = 'ord';
          cb.addEventListener('change', () => {
            const cur = Array.isArray(this._data[item.name]) ? [...this._data[item.name]] : [];
            const next = cb.checked ? [...cur.filter((v) => v !== opt.value), opt.value] : cur.filter((v) => v !== opt.value);
            emit(next);
          });
          l.append(cb, ord, document.createTextNode(opt.label));
          box.appendChild(l);
          return { cb, ord, value: opt.value };
        });
        set = (v) => {
          const arr = Array.isArray(v) ? v : [];
          boxes.forEach((b) => { const i = arr.indexOf(b.value); b.cb.checked = i >= 0; b.ord.textContent = i >= 0 ? String(i + 1) : ''; });
        };
        row.append(label, box);
      } else if (type === 'select' || type === 'entity' || type === 'ui_action') {
        const s = document.createElement('select');
        let opts;
        if (type === 'select') opts = (o.options || []).map((x) => (typeof x === 'string' ? { value: x, label: x } : x));
        else if (type === 'entity') {
          const ids = Object.keys(this._hass?.states || {}).filter((id) => !o.domain || id.startsWith(`${o.domain}.`)).sort();
          opts = [{ value: '', label: '— ingen —' }, ...ids.map((id) => ({ value: id, label: id }))];
        } else opts = ACTIONS.map((a) => ({ value: a, label: a }));
        opts.forEach((opt) => { const el = document.createElement('option'); el.value = opt.value; el.textContent = opt.label; s.appendChild(el); });
        s.addEventListener('change', () => {
          if (type === 'ui_action') emit({ action: s.value });
          else emit(s.value === '' ? undefined : s.value);
        });
        set = (v) => {
          if (type === 'ui_action') s.value = v?.action || o.default_action || 'none';
          else s.value = v ?? '';
        };
        row.append(label, s);
      } else if (type === 'color_rgb') {
        const c = document.createElement('input');
        c.type = 'color';
        c.addEventListener('input', () => emit(rgb(c.value)));
        set = (v) => { c.value = hex(v); };
        row.append(label, c);
      } else {
        const t = document.createElement('input');
        t.type = 'text';
        t.addEventListener('change', () => emit(t.value === '' ? undefined : t.value));
        set = (v) => { if (this.shadowRoot.activeElement !== t) t.value = v ?? ''; };
        row.append(label, t);
      }
      if (help) {
        const sm = document.createElement('small');
        sm.textContent = help;
        row.appendChild(sm);
      }
      this._controls.set(item.name, set);
      return row;
    }

    _emit(name, value) {
      const data = { ...this._data };
      if (value === undefined) delete data[name];
      else data[name] = value;
      this._data = data;
      this.dispatchEvent(new CustomEvent('value-changed', { detail: { value: data } }));
    }
  }

  customElements.define('ha-form', MockHaForm);
})();
