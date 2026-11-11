# Hero and skin artwork

Place base hero artwork in `type/`, using the hero ID as the filename:

- `type/cat.png`
- `type/dog.png`
- `type/rabbit.png`
- `type/bear.png`
- `type/owl.png`

Place skin artwork in `skin/` using `<heroId>_<skinId>.png`, for example:

- `skin/cat_bloom.png`
- `skin/dog_meadow.png`
- `skin/rabbit_starlight.png`

Names are matched case-insensitively. If a skin image is not present, the app
uses that hero's base image until the skin artwork is added.

Use transparent square artwork where possible. A 512 × 512 PNG is a good starting point for a portrait; GIF files can be used for animated previews. `expo-image` supports bundled local images and GIFs on iOS, Android, and web.

The app loads assets from these folders automatically. Add a matching skin record
to `type/heroes.json` with the skin ID that appears in its filename. For example,
the ID `meadow` on hero `dog` resolves to `skin/dog_meadow.png`.

Each hero and skin can also set a `rarity` field in `type/heroes.json` to one of
`common`, `uncommon`, `rare`, `epic`, `legendary`, or `mythic`. The matching
`assets/game/functions/card/hero_card_<rarity>.png` artwork is used as the store
card background, and rarity is available as a store filter. Missing rarity values
default to `common`.
