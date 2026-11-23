"""对已导出的 glTF 再做一次整体减面，用于降低成熟杉木的精度。"""
import bpy, sys, os, json
argv = sys.argv; argv = argv[argv.index("--")+1:] if "--" in argv else []
opts = {"input": None, "ratio": 0.35, "texture": 1024}
k = None
for t in argv:
    if t.startswith("--"): k = t[2:]
    elif k: opts[k] = int(t) if t.isdigit() else t; k = None

bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for item in list(block):
        if item.users == 0: block.remove(item)

bpy.ops.import_scene.gltf(filepath=opts["input"])
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
def tris(o):
    o.data.calc_loop_triangles(); return len(o.data.loop_triangles)
before = sum(tris(o) for o in meshes)

for o in meshes:
    if tris(o) < 50: continue
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    m = o.modifiers.new("Dec", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = float(opts["ratio"])
    m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)
    o.select_set(False)

after = sum(tris(o) for o in meshes)
bpy.ops.export_scene.gltf(
    filepath=opts["input"],
    export_format="GLTF_SEPARATE",
    export_texture_dir="textures",
    use_selection=False,
    export_apply=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
    export_image_format="JPEG",
    export_jpeg_quality=88,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)
print("RESULT " + json.dumps({"input": opts["input"], "before": before, "after": after, "sizeMB": round(os.path.getsize(opts["input"])/1048576, 2)}))
