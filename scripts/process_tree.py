"""
把 Poly Haven 的高模树木处理成游戏可用的 GLB。

- 一个 glTF 里常含多个树变体（a/b/c），分别居中、分别导出
- 先按材质拆分，再对木质/针叶分别做塌陷减面
- 可缩小贴图，用于远景 LOD

usage:
  blender -b --factory-startup --python scripts/process_tree.py -- \
    --input .assets-src/fir_sapling_medium/fir_sapling_medium_1k.gltf \
    --out-dir public/assets/models/trees --prefix fir_medium --lod lod0 \
    --wood 9000 --foliage 17000 --texture 1024
"""
import bpy
import sys
import os
import re
import json
from mathutils import Vector

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []

opts = {
    "input": None,
    "out-dir": "public/assets/models/trees",
    "prefix": "tree",
    "lod": "lod0",
    "wood": 7000,
    "foliage": 18000,
    "texture": 1024,
    "format": "gltf",
    "draco": 1,
}

key = None
for token in argv:
    if token.startswith("--"):
        key = token[2:]
    elif key:
        opts[key] = int(token) if token.isdigit() else token
        key = None

if not opts["input"]:
    raise SystemExit("need --input")

# ---------------------------------------------------------------- 清场
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for item in list(block):
        if item.users == 0:
            block.remove(item)

bpy.ops.import_scene.gltf(filepath=opts["input"])

# 统一清掉父级，保留世界变换，方便居中与导出
for obj in [o for o in bpy.context.scene.objects if o.parent]:
    obj.select_set(True)
if bpy.context.selected_objects:
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.select_all(action="DESELECT")

FOILAGE_HINTS = ("twig", "leaf", "leaves", "needle", "foliage", "needles", "frond")


def is_foliage(obj):
    for slot in obj.material_slots:
        if slot.material and any(h in slot.material.name.lower() for h in FOILAGE_HINTS):
            return True
    return False


def tri_count(obj):
    me = obj.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def separate_by_material(obj):
    """把多材质对象拆成每材质一个对象"""
    if len(obj.material_slots) <= 1:
        return [obj]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    return [o for o in bpy.context.selected_objects if o.type == "MESH"]


meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for obj in list(meshes):
    separate_by_material(obj)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

# ---------------------------------------------------------------- 按变体分组
# Poly Haven 会把多个树变体沿 X 轴间隔摆放；按世界坐标 X 聚类，
# 比解析对象名更可靠（材质拆分后名字会被追加 .001 后缀）。
def obj_center_x(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return sum(c.x for c in corners) / 8.0


ordered = sorted(meshes, key=obj_center_x)
groups = {}
letter_iter = iter("abcdefghij")
current = None
last_x = None
for obj in ordered:
    x = obj_center_x(obj)
    if last_x is None or (x - last_x) > 1.0:
        current = next(letter_iter)
        groups[current] = []
    groups[current].append(obj)
    last_x = x

print(f"[groups] {[(k, len(v), round(obj_center_x(v[0]), 2)) for k, v in groups.items()]}")

os.makedirs(opts["out-dir"], exist_ok=True)
os.makedirs(opts["blender-tmp"] if "blender-tmp" in opts else "/tmp", exist_ok=True)

results = []

for letter, objs in sorted(groups.items()):
    # 居中：以包围盒的 x/y 中心和地面为原点
    corners = []
    for obj in objs:
        corners += [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    min_v = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    max_v = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    center = (min_v + max_v) * 0.5

    for obj in objs:
        obj.location.x -= center.x
        obj.location.y -= center.y

    bpy.context.view_layer.update()

    # 先统计预算，再逐对象减面
    foliage_total = sum(tri_count(o) for o in objs if is_foliage(o))
    wood_total = sum(tri_count(o) for o in objs if not is_foliage(o))
    before_total = foliage_total + wood_total

    detail = []
    for obj in objs:
        tris = tri_count(obj)
        foliage = is_foliage(obj)
        total = foliage_total if foliage else wood_total
        budget = opts["foliage"] if foliage else opts["wood"]
        ratio = 1.0 if total == 0 else min(1.0, budget / total)
        after = tris
        if ratio < 0.999 and tris > 50:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
            mod.decimate_type = "COLLAPSE"
            mod.ratio = ratio
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            obj.select_set(False)
            after = tri_count(obj)
        detail.append({"object": obj.name, "foliage": foliage, "before": tris, "after": after})

    height = max_v.z - min_v.z

    # 按变体导出
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

    fmt = opts["format"]
    ext = "gltf" if fmt == "gltf" else "glb"
    out_path = os.path.join(opts["out-dir"], f"{opts['prefix']}_{letter}_{opts['lod']}.{ext}")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLTF_SEPARATE" if fmt == "gltf" else "GLB",
        export_texture_dir="textures",
        use_selection=True,
        export_apply=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_image_format="JPEG",
        export_jpeg_quality=88,
        export_draco_mesh_compression_enable=bool(opts["draco"]),
        export_draco_mesh_compression_level=6,
    )

    after_total = sum(d["after"] for d in detail)
    results.append(
        {
            "variant": letter,
            "out": out_path,
            "sizeMB": round(os.path.getsize(out_path) / 1048576, 2),
            "heightM": round(height, 2),
            "trisBefore": before_total,
            "trisAfter": after_total,
            "objects": detail,
        }
    )
    print(f"[export] {out_path} tris {before_total} -> {after_total}")

print("RESULT " + json.dumps(results))
