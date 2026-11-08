# Skycast Card

A weather card for Home Assistant with a **living sky** behind an **hourly and daily forecast chart** – and everything is set up in the visual editor.

![Skycast Card](docs/hero.png)

- The sky follows the weather and the real position of the sun (`sun.sun`): dawn, day, dusk and night.
- Clouds drifting with the wind, rain with splashes, snow, hail, fog, wind streaks, lightning, stars, shooting stars, a sun with rays and the moon in its current phase.
- Temperature curve coloured by temperature (blue when cold, orange when warm). The daily view shows high/low with a band between them.
- **Precipitation bars** in mm (or probability in %). Snow is drawn white, sleet light blue.
- A rain summary line: *"Rain expected tomorrow at 03:00 · 3.9 mm · 88 %"* or *"Dry until Wednesday"*.
- Hourly and daily as **tabs**, on their own, **side by side** or **stacked** – in one single card.
- Fills the height you give it in the sections view.
- Swedish and English (follows Home Assistant's language). No dependencies – one file.

![Hourly and daily side by side](docs/side-by-side.png)

![Different skies](docs/skies.png)

## Installation

### HACS
1. HACS → ⋮ → **Custom repositories** → add `https://github.com/em0g/skycast-card`, type **Dashboard**.
2. Install **Skycast Card** and reload the browser. HACS registers the resource
   `/hacsfiles/skycast-card/skycast-card.js` for you.

### Manual
Copy `dist/skycast-card.js` to `/config/www/skycast-card/` and add the resource
`/local/skycast-card/skycast-card.js` (JavaScript module) under **Settings → Dashboards → ⋮ → Resources**.

## Usage

Edit a dashboard → **Add card** → **Skycast Card**. Everything can be changed in the editor, grouped in sections:

| Section | What you can change |
|---|---|
| **Weather data** | Weather entity, name, language, sun entity |
| **Forecast** | Layout (tabs / hourly / daily / side by side / stacked), width share, number of hours and days, hour step, which rows are shown (times, icons, curve, values, low temperature, now highlight, day separators), precipitation as amount or probability, wind and wind unit |
| **Current weather** | On/off, large or compact style, name, condition, high/low, feels like, decimals, which metrics are shown and in which order, icons, labels, columns |
| **Rain summary** | On/off, threshold, how far ahead to look |
| **Size** | Overall scale, fixed height, padding, temperature size, corner radius, curve and bar height, column width, icon size |
| **Appearance** | Sky visibility, panel strength, curve colour, custom precipitation and text colours |
| **Animation** | On/off, frames per second, amount of clouds, amount of rain/snow, wind effect, day/night, stars, shooting stars, sun rays, splashes, lightning flash, animated icons, chart draw-in |
| **Custom sensors** | Your own sensors for temperature, feels like, humidity, pressure, wind, gusts, wind direction, UV, indoor temperature and humidity |
| **Tap and hold** | Tap and hold actions |

### Size

- **Sections view:** resize the card on the *Layout* tab. The card fills the height – the curve grows when there is room, and when it gets too small the probability, wind and icon rows are hidden one by one.
- **Other views:** use *Fixed card height* and *Scale* in the **Size** section.

### YAML examples

Hourly and daily side by side, without current weather:

```yaml
type: custom:skycast-card
entity: weather.home
show_current: false
forecast_mode: side_by_side
```

Compact header with your own metrics, hourly above daily:

```yaml
type: custom:skycast-card
entity: weather.home
header_style: compact
forecast_mode: stacked
wind_unit: m/s
metrics: [wind, humidity, indoor_temperature, sun]
indoor_temperature_entity: sensor.indoor_temperature
```

Current weather only:

```yaml
type: custom:skycast-card
entity: weather.home
show_chart: false
metrics: [humidity, wind, pressure, sun, uv_index, visibility]
metrics_columns: 3
```

<details>
<summary>All options</summary>

| Key | Default | Description |
|---|---|---|
| `entity` | – (required) | Weather entity |
| `name` | entity name | Text above the temperature |
| `locale` | `auto` | `auto`, `sv` or `en` |
| `sun_entity` | `sun.sun` | Sky light, sun position and night icons |
| `show_chart` | `true` | Show the forecast |
| `forecast_mode` | `tabs` | `tabs`, `hourly`, `daily`, `side_by_side`, `stacked` |
| `forecast_type` | `hourly` | Tab shown first (`tabs` mode) |
| `split` | `50` | Percent of the width for hourly (`side_by_side`) |
| `stack_below` | `560` | Stack hourly and daily when the card is narrower than this (px) |
| `hours_to_show` / `days_to_show` | `0` | Number of columns, `0` = as many as fit |
| `hourly_step` | `1` | Every n:th hour; precipitation is summed |
| `show_time_labels`, `show_icons`, `show_temperature`, `show_temp_labels`, `show_low_temp`, `show_now_highlight`, `show_day_separators` | `true` | Chart rows |
| `round_temp` | `false` | Whole degrees in the chart |
| `show_precipitation` | `true` | Precipitation bars |
| `precipitation_type` | `amount` | `amount` (mm) or `probability` (%) |
| `show_precip_labels`, `show_probability` | `true` | Values above the bars, probability below |
| `show_wind` | `true` | Wind in the chart |
| `wind_unit` | `auto` | `auto`, `m/s`, `km/h`, `mph`, `kn` |
| `show_current` | `true` | Current weather |
| `header_style` | `large` | `large` or `compact` |
| `show_name`, `show_condition`, `show_hilo`, `show_feels_like` | `true` | Parts of the current weather |
| `temperature_decimals` | auto | 0–2 |
| `show_metrics` | `true` | Metrics box |
| `metrics` | `[humidity, wind, pressure, sun]` | Order and choice of `humidity`, `wind`, `pressure`, `sun`, `feels_like`, `uv_index`, `visibility`, `dew_point`, `cloud_coverage`, `precipitation`, `indoor_temperature`, `indoor_humidity` |
| `show_metric_icons`, `show_metric_labels` | `true` | Icons and labels in the metrics |
| `metrics_columns` | `0` | Columns, `0` = auto |
| `show_nowcast` | `true` | Rain summary line |
| `nowcast_threshold` | `0.1` | mm/h that counts as precipitation |
| `nowcast_hours` | `48` | Hours to look ahead |
| `scale` | `1` | Scale of text and icons |
| `card_height` | `0` | Fixed height in px, `0` = auto |
| `padding` | `14` | Inner padding |
| `temp_size` | `0` | Big temperature size in px, `0` = auto |
| `border_radius` | theme | Corner radius in px |
| `chart_height` | `56` | Temperature curve height |
| `precip_height` | `30` | Precipitation bar height |
| `column_width` | `0` | Minimum column width, `0` = auto |
| `icon_size` | `0` | Weather icon size, `0` = auto |
| `sky_opacity` | `1` | 0–1, lower lets the dashboard background through |
| `panel_opacity` | `1` | 0–2, strength of the dark panels |
| `temp_color_mode` | `gradient` | `gradient` or `fixed` (+ `temp_color`) |
| `custom_colors` | `false` | Enables `precip_color` and `text_color` |
| `animate` | `true` | Animated sky |
| `max_fps` | `30` | Frames per second |
| `cloud_amount`, `precip_amount`, `wind_effect` | `1` | Amount of clouds, rain/snow and wind effect |
| `day_night` | `true` | Light from the sun's position |
| `show_stars`, `shooting_stars`, `sun_rays`, `rain_splash`, `lightning_flash` | `true` | Effects |
| `animated_icons`, `chart_animation` | `true` | Icon animation and chart draw-in |
| `temperature_entity`, `feels_like_entity`, `humidity_entity`, `pressure_entity`, `wind_speed_entity`, `wind_gust_entity`, `wind_bearing_entity`, `uv_entity`, `indoor_temperature_entity`, `indoor_humidity_entity` | – | Custom sensors |
| `tap_action` / `hold_action` | more-info / none | Actions |

</details>

## Wall tablets

- The animation pauses when the card is off screen or the screen is off.
- If the tablet gets warm or slow, lower *Max frames per second* to 20 or turn off *Animated sky*.
- Honours the operating system's "reduce motion" setting.

## Demo without Home Assistant

`demo/index.html` runs the card on fake data, with the editor (simplified controls) and a preview you can resize.
Start a web server in the repository folder and open `http://localhost:8765/demo/`:

```bash
python -m http.server 8765
```

## License

MIT
