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
