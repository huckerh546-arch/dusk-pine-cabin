"""把 Poly Haven 小件模型转成 GLB，并按需减面。"""
import bpy, sys, os, json
argv = sys.argv; argv = argv[argv.index("--")+1:] if "--" in argv else []
opts = {"input": None, "out": None, "budget": 40000, "texture": 1024}
k=None
for t in argv:
    if t.startswith("--"): k=t[2:]
    elif k: opts[k]=int(t) if t.isdigit() else t; k=None

bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for item in list(block):
        if item.users == 0: block.remove(item)

bpy.ops.import_scene.gltf(filepath=opts["input"])
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
for o in meshes:
    if o.parent: o.matrix_world = o.matrix_world
bpy.ops.object.select_all(action="DESELECT")

def tris(o):
    o.data.calc_loop_triangles(); return len(o.data.loop_triangles)

before=sum(tris(o) for o in meshes)
if before > opts["budget"]:
    ratio = opts["budget"]/before
    for o in meshes:
        if tris(o) < 100: continue
        bpy.context.view_layer.objects.active=o; o.select_set(True)
        m=o.modifiers.new("Dec","DECIMATE"); m.decimate_type="COLLAPSE"; m.ratio=ratio; m.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=m.name); o.select_set(False)

if opts["texture"] < 4096:
    for img in bpy.data.images:
        w,h=img.size
        if max(w,h) > opts["texture"] and w>0:
            s=opts["texture"]/max(w,h); img.scale(max(1,int(w*s)),max(1,int(h*s)))

os.makedirs(os.path.dirname(opts["out"]), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=opts["out"], export_format="GLB", use_selection=False,
    export_apply=True, export_animations=False, export_cameras=False, export_lights=False,
    export_image_format="JPEG", export_jpeg_quality=88)
after=sum(tris(o) for o in meshes)
print("RESULT "+json.dumps({"in":opts["input"],"out":opts["out"],"trisBefore":before,"trisAfter":after,
    "sizeMB":round(os.path.getsize(opts["out"])/1048576,2)}))
