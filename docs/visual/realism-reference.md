# Daylight visual direction

The user selected **sunny afternoon city streets** on 2026-11-18.

## Camera and scale

Use the imported car's metric wheel spacing (approximately 2.65 m wheelbase / 0.358 m tire radius), existing 13 m roadway, 3.05 m building floors and modeled door/window dimensions as the common scale. The driver eye is fitted to the imported interior; the existing 0–18 cm height adjustment is retained. First-person motion follows the interpolated vehicle rigidly.

## Lighting and materials

- One fixed world-space afternoon sun (approximately 35° elevation).
- Analytic sky with atmospheric scattering and clouds, plus a photographic HDR for diffuse/environment lighting.
- Warm direct light, cooler sky fill, natural asphalt and stone colors.
- Close shadow coverage follows the car while sunlight direction remains constant.
- Three local street reflection probes; low-resolution rear mirror in balanced and high quality.
- Mild glow after tone mapping prevents sky radiance from washing out the road.

Asset imagery used for surface reference: the Poly Haven asset previews linked in `assets/ATTRIBUTIONS.md`. Vehicle geometry is the attributed Three.js example model, with the original-model license limitation documented there. A complete real-world photo survey or measured architectural reconstruction is not claimed.

## Street identity

The full loop contains commercial facades, brick residential/shop blocks and lower warehouse buildings. Sidewalks, recessed framed windows, sills, shop awnings, balcony rails, vents, roof equipment, trees, grates, benches, bins, planters and parked cars provide scale and depth. Placement is deterministic and checks for building overlap and track clearance.
