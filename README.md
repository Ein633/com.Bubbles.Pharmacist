# Bubble-Pharmacist — Configuration Reference

This document describes the configuration keys and defaults used by the mod.

Purpose
- The mod changes item uses/HP, updates prices when applicable, scales trader barter requirement counts, and updates hideout crafting recipe requirements.

Current config (values from `config/config.json`)

- `logItemsWithModifiedUses` (boolean)
  - Example value: `true`
  - When true the mod prints verbose logs about which items, traders, and recipes were modified.

- `barterScaleMode` (string — "both" | "currency" | "items")
  - Example value: `"both"`
  - Controls the barter mode, it affects the offers you see in the trader's inventory:
    - `"both"` — scale both currency-type and item-type barter requirements (subject to `currencyTpls` / `itemTpls` whitelists).
    - `"currency"` — only scale currency-type requirements. Dollars, Roubles, Euros, Bitcoins and Gpcoins.
    - `"items"` — only scale item-type requirements.

- `changeCrafts` (boolean)
  - Example value: `true`
  - When true the mod updates hideout recipes for items whose uses were changed.

- `changeStims` / `changeMedkits` / `changeMedical` / `changeDrugs` (boolean)
  - Example values: all `true`
  - Enable modifications for each item category. When enabled, items with that category uses/HP scaled according to the corresponding multiplier (unless they are blacklisted or `inf*` is enabled).

- `infDrugs` / `infStims` / `infMedkits` / `infMedical` (boolean)
  - Example values: all `false`
  - When true, that category of items will receive a large use/HP value (effectively infinite uses) instead of being multiplied by a configured multiplier.

- `stimUsesMultiplier` (number)
  - Example value: `10`
  - The multiplier applied to stimulators when enabled.

- `medkitHpMultiplier` (number)
  - Example value: `2`
  - The multiplier applied to medkits when enabled.

- `medicalUsesMultiplier` (number)
  - Example value: `2`
  - The multiplier applied to medical items when enabled.

- `drugUsesMultiplier` (number)
  - Example value: `2`
  - The multiplier applied to drugs' when enabled.

- `blacklisted_stims` / `blacklisted_medkits` / `blacklisted_medical` / `blacklisted_drugs`
  - Items with more than one category will choose one category based on my whims. If you want to manually chose a category for an item, just blacklist the itemId on the corresponding blacklist
  - Morphine is "544fb3f34bdc2d03748b456a" and it is considered both a stim and a medical item. Adding "544fb3f34bdc2d03748b456a" to blacklisted_stims will now make Morphine be considered a medical item.
  - To fully blacklist an item with multiple categories it must be added to all categories, IE adding Morphine to both stims and medical blacklist will fully blacklist Morphine.
  - Example values (from config):
    - `blacklisted_stims`: `["648c1a965043c4052a4f8505"]`
    - `blacklisted_medkits`: `["5755356824597772cb798962","5e99711486f7744bfc4af328","5e99735686f7744bfc4af32c"]`
    - `blacklisted_medical`: `[]`
    - `blacklisted_drugs`: `[]`
  - These are tpl ids that the mod will skip when applying use/HP adjustments (typically quest or special-case items).

- `currencyTpls` (string[])
  - Example value: `[
      "5449016a4bdc2d6f028b456f",
      "569668774bdc2da2298b4568",
      "5696686a4bdc2da3298b456a",
      "59faff1d86f7746c51718c9c",
      "5d235b4d86f7742e017bc88a"
    ]`
  - A whitelist of currency tpl ids used to detect currency-type barter requirements. When empty, the mod treats currency detection more generically depending on `barterScaleMode`.

- `itemTpls` (string[])
  - Example value: `[]` (empty)
  - A whitelist of item tpl ids used to detect item-type barter requirements. When empty, the mod treats non-currency barter entries as items by default (depending on `barterScaleMode`).

Behavior notes and key details
- Morphine is a special-case handled inside the code: even if its parent class would classify it differently, the mod forces it to use the stim multiplier to keep behavior consistent.

Troubleshooting
- If you don't see the mod's logs when SPT starts, confirm that `logItemsWithModifiedUses` is `true` in the config.