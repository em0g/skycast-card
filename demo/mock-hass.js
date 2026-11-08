/*
 * Demo only: fake Home Assistant data (weather entity, sun, sensors and
 * forecast subscriptions) so the card can run outside Home Assistant.
 */
window.SkycastMock = (() => {
  const ENTITY = 'weather.smhi_hemma';
  const WET = ['rainy', 'pouring', 'lightning-rainy', 'snowy', 'snowy-rainy', 'hail'];
  const rnd = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  let listeners = [];

  // st: { cond, temp, wind (m/s), scen: auto|later|now|dry }
  function genForecasts(st, seed = 7) {
    const R = rnd(seed * 97 + 3);
    const now = new Date(); now.setMinutes(0, 0, 0);
    const hourly = [];
    const wetNow = st.scen === 'now' || (st.scen === 'auto' && WET.includes(st.cond));
    const laterStart = 5 + Math.floor(R() * 4);
    const intensity = { pouring: 4, 'lightning-rainy': 2.5, hail: 1.5 }[st.cond] || 0.8;
    for (let i = 0; i < 48; i++) {
      const d = new Date(now.getTime() + i * 3600e3);
      const h = d.getHours();
      const temp = st.temp + 2.6 * Math.sin((2 * Math.PI * (h - 9)) / 24) - 2.6 * Math.sin((2 * Math.PI * (now.getHours() - 9)) / 24) + (R() - 0.5) * 0.6 - i * 0.03;
      let wet = false;
      if (st.scen !== 'dry') {
        if (wetNow && i < 6) wet = true;
        if (!wetNow && (st.scen === 'later' || st.scen === 'auto') && i >= laterStart && i < laterStart + 4) wet = true;
        if (i >= 26 && i < 31) wet = true;
      }
      const night = h < 7 || h >= 16;
      let cond;
      if (wet) cond = WET.includes(st.cond) ? st.cond : temp <= 0 ? 'snowy' : 'rainy';
      else if (['sunny', 'clear-night'].includes(st.cond)) cond = night ? 'clear-night' : 'sunny';
      else if (st.cond === 'partlycloudy') cond = R() < 0.25 ? 'cloudy' : 'partlycloudy';
      else if (WET.includes(st.cond)) cond = 'cloudy';
      else cond = R() < 0.15 ? 'partlycloudy' : st.cond;
      const precip = wet ? Math.round((intensity * (0.3 + R() * 1.2)) * 10) / 10 : 0;
      hourly.push({
        datetime: d.toISOString(), condition: cond, temperature: Math.round(temp * 10) / 10, precipitation: precip,
        precipitation_probability: wet ? Math.round(55 + R() * 40) : Math.round(R() * 12),
        wind_speed: Math.round((st.wind * 3.6 * (0.7 + R() * 0.6)) * 10) / 10, wind_bearing: Math.round(200 + R() * 100),
        humidity: Math.round(75 + R() * 20),
      });
    }
    const daily = [];
    const conds = ['cloudy', 'rainy', 'partlycloudy', 'rainy', 'cloudy', 'snowy', 'sunny', 'partlycloudy'];
    const today = new Date(); today.setHours(12, 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const d = new Date(today.getTime() + i * 864e5);
      const c = i === 0 ? (st.cond === 'clear-night' ? 'sunny' : st.cond) : conds[(i + seed) % conds.length];
      const hi = st.temp + 1.5 + Math.sin(i * 0.9 + seed) * 2.2;
      const lo = hi - 2.5 - R() * 3;
      const p = st.scen === 'dry' ? 0 : WET.includes(c) ? Math.round((1 + R() * 6) * 10) / 10 : R() < 0.3 ? Math.round(R() * 1.5 * 10) / 10 : 0;
      daily.push({
        datetime: d.toISOString(), condition: c, temperature: Math.round(hi * 10) / 10, templow: Math.round(lo * 10) / 10,
        precipitation: p, precipitation_probability: p > 0 ? Math.round(40 + R() * 55) : Math.round(R() * 15),
        wind_speed: Math.round((st.wind * 3.6 * (0.6 + R() * 0.9)) * 10) / 10, wind_bearing: Math.round(180 + R() * 140),
      });
    }
    return { hourly, daily };
  }

  // st also takes elev / azi (sun) and lang. getForecasts() returns the current { hourly, daily }.
  function makeHass(st, getForecasts, name = 'Hemma') {
    const today = new Date();
    const at = (h, m, addDay) => { const d = new Date(today); d.setHours(h, m, 0, 0); if (addDay) d.setDate(d.getDate() + 1); return d.toISOString(); };
    const nowH = today.getHours() + today.getMinutes() / 60;
    const sensor = (id, state, unit, fname) => ({ entity_id: id, state: String(state), attributes: { unit_of_measurement: unit, friendly_name: fname } });
    const lang = st.lang || 'sv';
    return {
      states: {
        [ENTITY]: {
          entity_id: ENTITY, state: st.cond, last_changed: today.toISOString(),
          attributes: {
            friendly_name: name, temperature: st.temp, temperature_unit: '°C', humidity: st.humidity ?? 88, pressure: 1006,
            pressure_unit: 'hPa', wind_speed: Math.round(st.wind * 3.6 * 10) / 10, wind_gust_speed: Math.round(st.wind * 3.6 * 1.8 * 10) / 10,
            wind_bearing: 225, wind_speed_unit: 'km/h', precipitation_unit: 'mm', visibility: 12.4, visibility_unit: 'km',
            apparent_temperature: Math.round((st.temp - st.wind * 0.7) * 10) / 10, dew_point: Math.round((st.temp - 2.1) * 10) / 10,
            uv_index: 1, cloud_coverage: 72, supported_features: 3,
          },
        },
        'weather.yr_hemma': { entity_id: 'weather.yr_hemma', state: st.cond, attributes: { friendly_name: 'Yr', temperature: st.temp, supported_features: 3 } },
        'sun.sun': {
          entity_id: 'sun.sun', state: st.elev > 0 ? 'above_horizon' : 'below_horizon',
          attributes: { elevation: st.elev, azimuth: st.azi, rising: st.azi < 180, next_rising: at(7, 21, nowH > 7.35), next_setting: at(16, 4, nowH > 16.07) },
        },
        'sensor.ute_temperatur': sensor('sensor.ute_temperatur', 2.3, '°C', 'Ute temperatur'),
        'sensor.inne_temperatur': sensor('sensor.inne_temperatur', 21.4, '°C', 'Inne temperatur'),
        'sensor.inne_luftfuktighet': sensor('sensor.inne_luftfuktighet', 38, '%', 'Inne luftfuktighet'),
      },
      locale: { language: lang, number_format: 'language', time_format: '24' },
      language: lang,
      config: { unit_system: { temperature: '°C' } },
      localize: () => '',
      connection: {
        subscribeMessage(cb, msg) {
          const l = { cb, msg, get: getForecasts };
          listeners.push(l);
          setTimeout(() => cb({ type: msg.forecast_type, forecast: getForecasts()[msg.forecast_type] || [] }), 60);
          return Promise.resolve(() => { listeners = listeners.filter((x) => x !== l); });
        },
      },
    };
  }

  // push fresh forecasts to every subscribed card
  function notify() {
    for (const l of listeners) l.cb({ type: l.msg.forecast_type, forecast: l.get()[l.msg.forecast_type] || [] });
  }

  return { ENTITY, genForecasts, makeHass, notify };
})();
