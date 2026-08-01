# 1C Product Relations

Verified against production OData on 2026-08-01.

| Type | Resource | Composite identity | Ordering | Current rows |
| --- | --- | --- | --- | ---: |
| Analog | `InformationRegister_АналогиНоменклатуры` | `Номенклатура_Key`, `Аналог_Key` | `Приоритет` | 41 |
| Related | `InformationRegister_СопутствующиеТовары` | `Номенклатура_Key`, `Характеристика_Key`, `СопутствующийТовар_Key`, `ХарактеристикаCопутствующегоТовара_Key` | `Приоритет` | 12 |

Neither register exposes `Period`, `DataVersion`, deletion, or activity fields. Relations are directional. Navigation links and `Комментарий` are not synchronized. Zero characteristic GUIDs normalize to `null`.

SKU `400540` (`DH-C4K-P`, `29a5f336-3473-11ef-de8b-7239d3b7bd5c`) currently has two analog rows and two related rows. The current snapshot has no duplicate logical pairs and no self-relations.
