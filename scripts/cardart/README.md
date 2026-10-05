# Card art, painted with light

`render.py` paints card pictures the way the rarity gems are made (noise-painted nebulae, lit and bevelled
materials, raymarched crystals, bloom and tone mapping) and writes them to `src/assets/cards/<id>.webp`.
The game uses a card's rendered picture wherever it has one, and its SVG scene (`src/ui/cardart.ts`)
otherwise.

```
pip install numpy scipy pillow
python3 scripts/cardart/render.py aureline        # a race's whole set
python3 scripts/cardart/render.py helio_lancer    # one card (or several)
```

- `paint.py`: the painter (noise, nebula, stars, sun, planet, raymarcher, bloom, tone mapping).
- `kit.py`: the scene kit, mirroring the SVG helpers (`sun`, `beam`, `planet`, `dome`, `rings`, ...) and
  the materials (`solid`, `gold`, `tube`, `cloth`, `energy`).
- `aureline.py`: the Aureline figure. `cards_<race>.py`: that race's card scenes, in the same layouts as
  `cardart.ts`.

## The rule: no two characters alike

Every character is an individual, as no two people look the same. A race's figure is never one image
reused with a colour change. Its build, the turn of its head, its features and markings, its hair or
crest, what it wears and how it stands all vary from card to card, drawn from the card's id (and the
figure's place on the card, so the members of a group differ from each other too). A scene can still pin
any trait (`look=dict(...)`) where the card calls for something in particular. Each race's figure is
built with this range of traits from the start.

## Generated pictures (fal.ai)

`generate.py` paints a card with an image model on fal.ai instead: its prompt is the card's scene in
`prompts/<race>.json` plus the race's look, the house style and the framing, and the race's reference images
(`refs/<race>-*.jpg`) go with it. The full picture is kept in `generated/<id>.png`; the card's 640x400 picture
goes to `src/assets/cards/<id>.webp`.

The fal.ai key is a repository secret (`FAL_API_KEY`), so generation runs on GitHub Actions
(`.github/workflows/cardart.yml`): write `<race> [card ids...]` into `request.txt` and push. The pictures are
committed back to the same branch and the request is emptied. Each picture costs money; ask only for the ones
you need.

The card's type badge covers the top centre of its picture. When it hides a head, `reframe.py` re-cuts the
card's picture from the full one with more sky on top, so the figure sits lower:

```
python3 scripts/cardart/reframe.py halo_ward 128          # 128px more sky
python3 scripts/cardart/reframe.py halo_ward 128 --look   # also writes generated/<id>.reframed.png to check
```

Re-framed so far: `halo_ward` 128, `aureline_sun_priest` 112, `ignition_protocol` 100, `aurelia_first_light` 112.
