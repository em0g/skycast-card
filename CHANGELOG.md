# Changelog

All notable changes to Skycast Card. Versions follow [semantic versioning](https://semver.org/).

## 1.0.2 – 2026-11-09

### Added
- The card editor shows links to the documentation, bug reports and release notes, and the version you are running.
- Installation guide for the Home Assistant **Marketplace** (2026.11 and newer), with a one-click button, and for HACS on older versions.
- Instructions for updating, removing and YAML-managed resources, a troubleshooting section and issue templates.

## 1.0.1 – 2026-11-09

### Fixed
- Hour labels in the chart shrink to fit their column, so 12-hour times no longer overlap ("02:00 PM" → "2 PM" → "2p"; "14:00" → "14" on very narrow columns).
- The rain summary reads "Wed at 4 AM" instead of "wed at 04:00 AM"; weekdays are only lower-cased in Swedish.

## 1.0.0 – 2026-11-08

First release.

- Living sky that follows the weather and the real sun position (dawn, day, dusk, night): clouds drifting with the wind, rain with splashes, snow, hail, fog, wind streaks, lightning, stars, shooting stars, sun rays and the moon in its current phase.
- Hourly and daily forecast chart: temperature curve coloured by temperature, high/low band, weather icons, wind arrows.
- Precipitation bars in mm or probability in %, with snow and sleet drawn in their own colours.
- Rain summary line ("Rain expected tomorrow at 03:00 · 3.9 mm · 88 %").
- Hourly and daily as tabs, on their own, side by side or stacked in one card.
- Visual editor (Swedish / English) for layout, size, shown information and metrics, colours, animation, custom sensors and tap/hold actions.
- Fills the height given in the sections view and hides less important rows when space is tight.
- Animation pauses when the card is off screen; honours "reduce motion".
