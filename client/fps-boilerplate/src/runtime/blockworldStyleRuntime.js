export const DEFAULT_BLOCKWORLD_BIOME = 'peak';

const BASE_POST_PROCESS_STYLE = Object.freeze({
  saturation: 1.06,
  contrast: 1.08,
  warmth: 0.2,
  shadowLift: 0.074,
  highlightSoftness: 0.44,
  blackPoint: 0.03,
  vignetteStrength: 0.16,
  vignetteSoftness: 0.62,
  grainAmount: 0.009,
  bloomStrength: 0.22,
  bloomRadius: 0.44,
  bloomThreshold: 0.87
});

export const BLOCKWORLD_BIOME_PRESETS = Object.freeze({
  forest: Object.freeze({
    key: 'forest',
    sun: Object.freeze({ day: 0xffefce, sunset: 0xffbb86, night: 0x8ba2c7 }),
    fog: Object.freeze({ day: 0x8eb0bb, sunset: 0x7488a1, night: 0x2f4358 }),
    sky: Object.freeze({
      zenith: Object.freeze({ day: 0x6c9fd2, sunset: 0x8c73aa, night: 0x223654 }),
      horizon: Object.freeze({ day: 0xd7c79f, sunset: 0xf0a26a, night: 0x475a7a }),
      nadir: Object.freeze({ day: 0x6f8198, sunset: 0x715f86, night: 0x23344c })
    }),
    cloud: Object.freeze({
      bright: Object.freeze({ day: 0xfde8cf, sunset: 0xffc59f, night: 0x7a8cb0 }),
      shadow: Object.freeze({ day: 0x9eb8c8, sunset: 0xb79bb2, night: 0x5c7295 })
    }),
    hemisphere: Object.freeze({
      sky: Object.freeze({ day: 0x89b5d8, sunset: 0xa38dc2, night: 0x365174 }),
      ground: Object.freeze({ day: 0x56735c, sunset: 0x716962, night: 0x2a3c4a })
    }),
    ambient: Object.freeze({ day: 0xe2dac7, sunset: 0xe9c2a0, night: 0x6f86ae }),
    bounce: Object.freeze({ day: 0x7fb07a, sunset: 0xa18d74, night: 0x5d7da8 }),
    exposure: Object.freeze({ day: 1.14, night: 0.88, sunsetBoost: 0.05 }),
    fogRange: Object.freeze({ nearDay: 58, nearNight: 30, farDay: 308, farNight: 172, sunsetBonus: 24 }),
    intensity: Object.freeze({
      sunDay: 2.04,
      sunNight: 0.28,
      sunSunsetBoost: 0.58,
      hemiDay: 0.56,
      hemiNight: 0.24,
      hemiSunsetBoost: 0.18,
      ambientDay: 0.62,
      ambientNight: 0.24,
      ambientSunsetBoost: 0.14,
      bounceDay: 0.4,
      bounceNight: 0.12,
      bounceSunsetBoost: 0.1
    }),
    voxel: Object.freeze({
      palette: Object.freeze({
        default: 0x7b6048,
        1: 0x70b35a,
        2: 0x8f949d,
        3: 0xe4cb90,
        4: 0xb7d8f5
      }),
      topWarmTint: 0xffe3af,
      sideCoolTint: 0x7fa5bf,
      bottomShadowTint: 0x506b78,
      heightHighTint: 0xc9e4ac,
      heightLowTint: 0x516173,
      topBrightness: 1.18,
      sideBrightness: 0.86,
      bottomBrightness: 0.62,
      sideSunBoost: 0.2,
      sideShadowTint: 0.3,
      topWarmTintAmount: 0.18,
      bottomTintAmount: 0.36,
      heightHighAmount: 0.08,
      heightLowAmount: 0.06,
      heightOffset: 6,
      heightRange: 34,
      sunDirection: [0.62, 0.0, -0.51],
      emissive: 0x14251a,
      emissiveIntensity: 0.045
    }),
    surface: Object.freeze({
      grassColor: 0x81b969,
      grassEmissive: 0x203a2b,
      planeColor: 0x6f9d5e
    }),
    postProcess: Object.freeze({ warmth: 0.24, saturation: 1.08, bloomStrength: 0.24 })
  }),
  desert: Object.freeze({
    key: 'desert',
    sun: Object.freeze({ day: 0xffefcb, sunset: 0xffb678, night: 0x9f96bf }),
    fog: Object.freeze({ day: 0xd4bea4, sunset: 0xba9ca0, night: 0x5f566b }),
    sky: Object.freeze({
      zenith: Object.freeze({ day: 0xa4bddf, sunset: 0xb486b5, night: 0x4c4760 }),
      horizon: Object.freeze({ day: 0xf0d19d, sunset: 0xffb77a, night: 0x766385 }),
      nadir: Object.freeze({ day: 0xcead87, sunset: 0xbc8d87, night: 0x5a4f68 })
    }),
    cloud: Object.freeze({
      bright: Object.freeze({ day: 0xffefd4, sunset: 0xffd0a0, night: 0x9e8cae }),
      shadow: Object.freeze({ day: 0xd5b693, sunset: 0xc8a299, night: 0x7b6c8d })
    }),
    hemisphere: Object.freeze({
      sky: Object.freeze({ day: 0xc4c5dc, sunset: 0xbe9dbe, night: 0x6a627f }),
      ground: Object.freeze({ day: 0xb89769, sunset: 0xaa8167, night: 0x66566f })
    }),
    ambient: Object.freeze({ day: 0xf3ddbf, sunset: 0xf0c29f, night: 0x9b87ab }),
    bounce: Object.freeze({ day: 0xe2be86, sunset: 0xcf9a77, night: 0x84789b }),
    exposure: Object.freeze({ day: 1.18, night: 0.9, sunsetBoost: 0.05 }),
    fogRange: Object.freeze({ nearDay: 62, nearNight: 34, farDay: 332, farNight: 185, sunsetBonus: 20 }),
    intensity: Object.freeze({
      sunDay: 2.12,
      sunNight: 0.32,
      sunSunsetBoost: 0.62,
      hemiDay: 0.52,
      hemiNight: 0.24,
      hemiSunsetBoost: 0.16,
      ambientDay: 0.6,
      ambientNight: 0.24,
      ambientSunsetBoost: 0.12,
      bounceDay: 0.38,
      bounceNight: 0.12,
      bounceSunsetBoost: 0.08
    }),
    voxel: Object.freeze({
      palette: Object.freeze({
        default: 0x8a6849,
        1: 0xc8a46a,
        2: 0xa69a8f,
        3: 0xf0d39a,
        4: 0xc6ddf2
      }),
      topWarmTint: 0xffe7ba,
      sideCoolTint: 0xb9a2be,
      bottomShadowTint: 0x7b6d7f,
      heightHighTint: 0xf3d7ab,
      heightLowTint: 0x7f7084,
      topBrightness: 1.16,
      sideBrightness: 0.88,
      bottomBrightness: 0.64,
      sideSunBoost: 0.16,
      sideShadowTint: 0.27,
      topWarmTintAmount: 0.2,
      bottomTintAmount: 0.34,
      heightHighAmount: 0.09,
      heightLowAmount: 0.05,
      heightOffset: 8,
      heightRange: 36,
      sunDirection: [0.58, 0.0, -0.44],
      emissive: 0x2e2218,
      emissiveIntensity: 0.04
    }),
    surface: Object.freeze({
      grassColor: 0xd4b57a,
      grassEmissive: 0x4d3a29,
      planeColor: 0xc9aa73
    }),
    postProcess: Object.freeze({ warmth: 0.32, saturation: 1.02, contrast: 1.05 })
  }),
  snow: Object.freeze({
    key: 'snow',
    sun: Object.freeze({ day: 0xf6fbff, sunset: 0xffdac5, night: 0x8faad1 }),
    fog: Object.freeze({ day: 0xbdd6ea, sunset: 0xa4b7d1, night: 0x4f6281 }),
    sky: Object.freeze({
      zenith: Object.freeze({ day: 0x8fb6df, sunset: 0x9d9fcc, night: 0x364f76 }),
      horizon: Object.freeze({ day: 0xe7f2ff, sunset: 0xd3c9e0, night: 0x6f7d9d }),
      nadir: Object.freeze({ day: 0x9fbfda, sunset: 0x8c95b7, night: 0x2f4368 })
    }),
    cloud: Object.freeze({
      bright: Object.freeze({ day: 0xf9fdff, sunset: 0xf3e4f0, night: 0x9cb0d1 }),
      shadow: Object.freeze({ day: 0xb0c6de, sunset: 0xb5abc9, night: 0x6f85ad })
    }),
    hemisphere: Object.freeze({
      sky: Object.freeze({ day: 0xb5d5f2, sunset: 0xb9b2d9, night: 0x5a6f9a }),
      ground: Object.freeze({ day: 0x88b6d2, sunset: 0x8ea3c2, night: 0x54698d })
    }),
    ambient: Object.freeze({ day: 0xe8f1fb, sunset: 0xd7d4e8, night: 0x7e9bc7 }),
    bounce: Object.freeze({ day: 0x96c7e7, sunset: 0xaebad4, night: 0x6c85b4 }),
    exposure: Object.freeze({ day: 1.2, night: 0.94, sunsetBoost: 0.05 }),
    fogRange: Object.freeze({ nearDay: 66, nearNight: 36, farDay: 342, farNight: 194, sunsetBonus: 18 }),
    intensity: Object.freeze({
      sunDay: 1.96,
      sunNight: 0.3,
      sunSunsetBoost: 0.5,
      hemiDay: 0.58,
      hemiNight: 0.26,
      hemiSunsetBoost: 0.14,
      ambientDay: 0.64,
      ambientNight: 0.26,
      ambientSunsetBoost: 0.1,
      bounceDay: 0.42,
      bounceNight: 0.14,
      bounceSunsetBoost: 0.08
    }),
    voxel: Object.freeze({
      palette: Object.freeze({
        default: 0x70839b,
        1: 0xb6d8f1,
        2: 0xa6b4c6,
        3: 0xe9f2fa,
        4: 0xc7e5ff
      }),
      topWarmTint: 0xf7fdff,
      sideCoolTint: 0x8db0d2,
      bottomShadowTint: 0x58749c,
      heightHighTint: 0xdff2ff,
      heightLowTint: 0x617da4,
      topBrightness: 1.14,
      sideBrightness: 0.9,
      bottomBrightness: 0.68,
      sideSunBoost: 0.14,
      sideShadowTint: 0.22,
      topWarmTintAmount: 0.16,
      bottomTintAmount: 0.32,
      heightHighAmount: 0.1,
      heightLowAmount: 0.06,
      heightOffset: 10,
      heightRange: 40,
      sunDirection: [0.56, 0.0, -0.38],
      emissive: 0x1a2537,
      emissiveIntensity: 0.03
    }),
    surface: Object.freeze({
      grassColor: 0xc4deee,
      grassEmissive: 0x27405e,
      planeColor: 0xb8d5e8
    }),
    postProcess: Object.freeze({ warmth: 0.08, saturation: 1.04, highlightSoftness: 0.5, bloomStrength: 0.24 })
  }),
  island: Object.freeze({
    key: 'island',
    sun: Object.freeze({ day: 0xffe8c8, sunset: 0xffc199, night: 0x8ea8c8 }),
    fog: Object.freeze({ day: 0x9ec7d0, sunset: 0x89a8bf, night: 0x3c5a6f }),
    sky: Object.freeze({
      zenith: Object.freeze({ day: 0x7db3d7, sunset: 0x8fa5cb, night: 0x2e4968 }),
      horizon: Object.freeze({ day: 0xd7ecd9, sunset: 0xe8ccb1, night: 0x5b7694 }),
      nadir: Object.freeze({ day: 0x7ca2bb, sunset: 0x7f8dab, night: 0x28445f })
    }),
    cloud: Object.freeze({
      bright: Object.freeze({ day: 0xf8f4dd, sunset: 0xf7d9bf, night: 0x88a7c7 }),
      shadow: Object.freeze({ day: 0x9dc5c8, sunset: 0xa9afc4, night: 0x5e7f9e })
    }),
    hemisphere: Object.freeze({
      sky: Object.freeze({ day: 0x9accdf, sunset: 0xa4b2d2, night: 0x456684 }),
      ground: Object.freeze({ day: 0x5d8d7f, sunset: 0x6f8f89, night: 0x35596f })
    }),
    ambient: Object.freeze({ day: 0xe1ecd9, sunset: 0xe7cfb6, night: 0x6f8fb2 }),
    bounce: Object.freeze({ day: 0x7fbfaf, sunset: 0x9eb29e, night: 0x5f88af }),
    exposure: Object.freeze({ day: 1.16, night: 0.9, sunsetBoost: 0.05 }),
    fogRange: Object.freeze({ nearDay: 64, nearNight: 34, farDay: 338, farNight: 188, sunsetBonus: 22 }),
    intensity: Object.freeze({
      sunDay: 2.0,
      sunNight: 0.3,
      sunSunsetBoost: 0.56,
      hemiDay: 0.55,
      hemiNight: 0.25,
      hemiSunsetBoost: 0.16,
      ambientDay: 0.61,
      ambientNight: 0.25,
      ambientSunsetBoost: 0.12,
      bounceDay: 0.4,
      bounceNight: 0.13,
      bounceSunsetBoost: 0.09
    }),
    voxel: Object.freeze({
      palette: Object.freeze({
        default: 0x6f6a59,
        1: 0x6cb893,
        2: 0x92a7b2,
        3: 0xe2d1a7,
        4: 0x9fd5f4
      }),
      topWarmTint: 0xffe6c3,
      sideCoolTint: 0x7eabc1,
      bottomShadowTint: 0x4d6f81,
      heightHighTint: 0xc3e9d7,
      heightLowTint: 0x546e81,
      topBrightness: 1.17,
      sideBrightness: 0.88,
      bottomBrightness: 0.64,
      sideSunBoost: 0.18,
      sideShadowTint: 0.26,
      topWarmTintAmount: 0.18,
      bottomTintAmount: 0.34,
      heightHighAmount: 0.1,
      heightLowAmount: 0.05,
      heightOffset: 8,
      heightRange: 38,
      sunDirection: [0.58, 0.0, -0.46],
      emissive: 0x163030,
      emissiveIntensity: 0.038
    }),
    surface: Object.freeze({
      grassColor: 0x78b99f,
      grassEmissive: 0x1f3c40,
      planeColor: 0x72ad97
    }),
    postProcess: Object.freeze({ warmth: 0.18, saturation: 1.03, contrast: 1.04, bloomRadius: 0.5 })
  }),
  peak: Object.freeze({
    key: 'peak',
    sun: Object.freeze({ day: 0xfff2da, sunset: 0xffd5b0, night: 0xa8bbd8 }),
    fog: Object.freeze({ day: 0xcfe3ef, sunset: 0xc2d7e7, night: 0x7890b0 }),
    sky: Object.freeze({
      zenith: Object.freeze({ day: 0x9bc8f0, sunset: 0xb6c8e3, night: 0x5f78a2 }),
      horizon: Object.freeze({ day: 0xf7ebd5, sunset: 0xf0dcc2, night: 0x8ea2c2 }),
      nadir: Object.freeze({ day: 0xb8cde0, sunset: 0xc0c3d6, night: 0x566f95 })
    }),
    cloud: Object.freeze({
      bright: Object.freeze({ day: 0xfff7ea, sunset: 0xffead6, night: 0xb2c3df }),
      shadow: Object.freeze({ day: 0xd2dfee, sunset: 0xd8d9e8, night: 0x7b91b4 })
    }),
    hemisphere: Object.freeze({
      sky: Object.freeze({ day: 0xc8e1f7, sunset: 0xd3d7eb, night: 0x748fb6 }),
      ground: Object.freeze({ day: 0xa6c3af, sunset: 0xb8c1b6, night: 0x67839e })
    }),
    ambient: Object.freeze({ day: 0xf4f0e4, sunset: 0xf2e4d0, night: 0x94aecd }),
    bounce: Object.freeze({ day: 0xc3e0c9, sunset: 0xd3d4c4, night: 0x7f9fc0 }),
    exposure: Object.freeze({ day: 1.24, night: 1.0, sunsetBoost: 0.03 }),
    fogRange: Object.freeze({ nearDay: 82, nearNight: 52, farDay: 430, farNight: 290, sunsetBonus: 26 }),
    intensity: Object.freeze({
      sunDay: 1.72,
      sunNight: 0.44,
      sunSunsetBoost: 0.36,
      hemiDay: 0.68,
      hemiNight: 0.42,
      hemiSunsetBoost: 0.08,
      ambientDay: 0.74,
      ambientNight: 0.48,
      ambientSunsetBoost: 0.06,
      bounceDay: 0.48,
      bounceNight: 0.26,
      bounceSunsetBoost: 0.06
    }),
    voxel: Object.freeze({
      palette: Object.freeze({
        default: 0x8f876e,
        1: 0x9fd488,
        2: 0xb6bdc8,
        3: 0xf2e2bd,
        4: 0xd0e9ff
      }),
      topWarmTint: 0xfff1d4,
      sideCoolTint: 0xa9c6dc,
      bottomShadowTint: 0x748ea7,
      heightHighTint: 0xe0f2cf,
      heightLowTint: 0x86a0b6,
      topBrightness: 1.22,
      sideBrightness: 0.95,
      bottomBrightness: 0.75,
      sideSunBoost: 0.12,
      sideShadowTint: 0.16,
      topWarmTintAmount: 0.14,
      bottomTintAmount: 0.2,
      heightHighAmount: 0.07,
      heightLowAmount: 0.04,
      heightOffset: 8,
      heightRange: 42,
      sunDirection: [0.54, 0.0, -0.36],
      emissive: 0x1e2a22,
      emissiveIntensity: 0.024
    }),
    surface: Object.freeze({
      grassColor: 0xa7d498,
      grassEmissive: 0x2f4b39,
      planeColor: 0x9acb8d
    }),
    postProcess: Object.freeze({
      warmth: 0.12,
      saturation: 1.06,
      contrast: 1.03,
      shadowLift: 0.045,
      highlightSoftness: 0.24,
      blackPoint: 0.018,
      vignetteStrength: 0.07,
      vignetteSoftness: 0.72,
      grainAmount: 0.003,
      bloomStrength: 0.15,
      bloomRadius: 0.3,
      bloomThreshold: 0.93
    })
  })
});

export function normalizeBlockworldBiome(value) {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return candidate && BLOCKWORLD_BIOME_PRESETS[candidate] ? candidate : DEFAULT_BLOCKWORLD_BIOME;
}

export function getBlockworldBiomePreset(value) {
  return BLOCKWORLD_BIOME_PRESETS[normalizeBlockworldBiome(value)]
    || BLOCKWORLD_BIOME_PRESETS[DEFAULT_BLOCKWORLD_BIOME];
}

export function getBlockworldPostProcessStyle(value) {
  const preset = getBlockworldBiomePreset(value);
  return {
    ...BASE_POST_PROCESS_STYLE,
    ...preset.postProcess
  };
}
