import bpy, sys, os, math, json
from mathutils import Vector
argv = sys.argv; argv = argv[argv.index("--")+1:] if "--" in argv else []
opts = {"input": None, "out": "/tmp/tree-preview.png", "res": 800}
k=None
for t in argv:
    if t.startswith("--"): k=t[2:]
    elif k: opts[k]=int(t) if t.isdigit() else t; k=None

bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=opts["input"])
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
pts=[]
for o in meshes:
    pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
mn=Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts)))
mx=Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
h=mx.z-mn.z; cx=(mn.x+mx.x)/2; cy=(mn.y+mx.y)/2

# 地面
bpy.ops.mesh.primitive_plane_add(size=max(40,h*4), location=(cx,cy,mn.z))
ground=bpy.context.object
m=bpy.data.materials.new("ground"); m.use_nodes=True
m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value=(0.16,0.15,0.1,1)
m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value=0.95
ground.data.materials.append(m)

# 相机
cam_data=bpy.data.cameras.new("cam"); cam=bpy.data.objects.new("cam",cam_data); bpy.context.scene.collection.objects.link(cam)
cam.location=(cx+max(6,h*0.9), cy-max(9,h*1.5), mn.z+h*0.55)
d=Vector((cx,cy,mn.z+h*0.45))-cam.location
cam.rotation_euler=d.to_track_quat("-Z","Y").to_euler()
cam_data.lens=50
bpy.context.scene.camera=cam

# 光
sun_data=bpy.data.lights.new("sun", type="SUN"); sun_data.energy=3.0; sun_data.angle=math.radians(4)
sun=bpy.data.objects.new("sun",sun_data); bpy.context.scene.collection.objects.link(sun)
sun.rotation_euler=(math.radians(55),math.radians(8),math.radians(35))

world=bpy.context.scene.world or bpy.data.worlds.new("w")
bpy.context.scene.world=world; world.use_nodes=True
bg=world.node_tree.nodes["Background"]; bg.inputs[0].default_value=(0.55,0.6,0.7,1); bg.inputs[1].default_value=1.2

sc=bpy.context.scene
sc.render.engine="CYCLES"; sc.cycles.samples=24; sc.cycles.use_denoising=False
sc.cycles.device="CPU"
sc.render.resolution_x=opts["res"]; sc.render.resolution_y=opts["res"]
sc.render.filepath=opts["out"]
sc.render.image_settings.file_format="PNG"
bpy.ops.render.render(write_still=True)
print("RENDERED", opts["out"], "height", round(h,2))
