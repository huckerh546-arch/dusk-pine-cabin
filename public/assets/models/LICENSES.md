# 第三方素材来源与授权

本项目 3D 模型与 PBR 贴图全部来自 **[Poly Haven](https://polyhaven.com)**，授权协议为
**[CC0 1.0 Universal（公共领域贡献）](https://creativecommons.org/publicdomain/zero/1.0/)**。

CC0 允许复制、修改、分发和商用，无需署名、无需支付费用。本文件与 `manifest.json`
中仍保留完整来源记录，便于追溯。

> 核对方式：通过 Poly Haven 官方 API `https://api.polyhaven.com/files/<asset>` 获取文件清单，
> 素材页面均标注 CC0；未使用任何需要登录、付费或绕过下载限制的资源。

## 树木（经 Blender 减面 / Draco 压缩 / 共享贴图处理）

| 素材 | 用途 | 来源 |
| --- | --- | --- |
| Fir Tree 01 | 近景框景大杉木（18.9 m，三个变体） | https://polyhaven.com/a/fir_tree_01 |
| Fir Sapling Medium | 中近景杉木（8.8 / 7.8 / 5.9 m，三个变体，含 4 级 LOD） | https://polyhaven.com/a/fir_sapling_medium |
| Pine Sapling Small | 林下幼松 | https://polyhaven.com/a/pine_sapling_small |
| Fir Sapling | 林下幼杉（两个变体） | https://polyhaven.com/a/fir_sapling |

处理的中间文件（21M 面原始网格）保留在 `.assets-src/`（已在 `.gitignore` 中忽略），
可用 `scripts/process_tree.py` 重新生成。

## 林下与地面道具

| 素材 | 来源 |
| --- | --- |
| Moss 01 | https://polyhaven.com/a/moss_01 |
| Rock Moss Set 01 | https://polyhaven.com/a/rock_moss_set_01 |
| Rock Moss Set 02 | https://polyhaven.com/a/rock_moss_set_02 |
| Tree Stump 01 | https://polyhaven.com/a/tree_stump_01 |
| Dead Tree Trunk | https://polyhaven.com/a/dead_tree_trunk |
| Dead Tree Trunk 02 | https://polyhaven.com/a/dead_tree_trunk_02 |
| Fern 02 | https://polyhaven.com/a/fern_02 |
| Grass Medium 01 | https://polyhaven.com/a/grass_medium_01 |
| Shrub 01 | https://polyhaven.com/a/shrub_01 |
| Shrub 02 | https://polyhaven.com/a/shrub_02 |
| Dry Branches Medium 01 | https://polyhaven.com/a/dry_branches_medium_01 |
| Pine Roots | https://polyhaven.com/a/pine_roots |
| Rockingchair 01（门廊摇椅） | https://polyhaven.com/a/Rockingchair_01 |
| Lantern 01（门廊吊灯） | https://polyhaven.com/a/Lantern_01 |
| Planter Pot Clay（陶盆） | https://polyhaven.com/a/planter_pot_clay |
| Potted Plant 01 / 02（盆栽） | https://polyhaven.com/a/potted_plant_01 、 https://polyhaven.com/a/potted_plant_02 |
| Boulder 01（近景巨石） | https://polyhaven.com/a/boulder_01 |

## PBR 贴图（1k JPG）

| 素材 | 用途 | 来源 |
| --- | --- | --- |
| Forest Ground 03 | 林地松针地表（diffuse / normal / roughness） | https://polyhaven.com/a/forrest_ground_03 |
| Bark Brown 02 | 木屋原木（diffuse / normal） | https://polyhaven.com/a/bark_brown_02 |
| Dark Planks | 门廊、门板、山墙（diffuse / normal） | https://polyhaven.com/a/dark_planks |
| Mossy Stone Wall | 石基、烟囱、踏石（diffuse / normal） | https://polyhaven.com/a/mossy_stone_wall |

## 代码依赖

- [three.js](https://threejs.org) — MIT
- [Vite](https://vite.dev) — MIT
- Draco 解码器来自 three.js 官方示例（`node_modules/three/examples/jsm/libs/draco`），Apache-2.0。
