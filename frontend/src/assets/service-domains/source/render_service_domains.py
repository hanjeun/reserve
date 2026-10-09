"""Render the six RESERVE service icons with the delivered state library's materials and lights.

Run with Blender 4.3: blender --background --python render_service_domains.py
PNG and editable scenes go into source/exports; the app consumes the encoded WebP files only.
"""
from pathlib import Path
import math
import sys
import bpy

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import rounded_geometry as g

EXPORTS = SOURCE / "exports"
EXPORTS.mkdir(exist_ok=True)
PALETTE = [("white", "f2f5fa", .05, .28), ("pale", "b8c9de", .08, .3),
           ("blue", "3182f6", .12, .25), ("coffee", "946b4c", 0, .45)]


def cylinder(name, location, radius, depth, material="white", rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth,
                                      location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    bevel = obj.modifiers.new("Soft rim", "BEVEL")
    bevel.width = min(depth / 3, .09)
    bevel.segments = 6
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return g.assign(obj, material, "body")


def cup():
    # A hollow ceramic body, rather than a solid sphere pretending to be a cup.
    profile = [(0, .26), (.4, .26), (.51, .31), (.58, .43), (.61, 1.35),
               (.6, 1.43), (.56, 1.46), (.51, 1.41), (.49, .48), (.4, .42), (0, .42)]
    segments = 64
    vertices = [(r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments), z)
                for r, z in profile for i in range(segments)]
    faces = [(j * segments + i, j * segments + (i + 1) % segments,
              (j + 1) * segments + (i + 1) % segments, (j + 1) * segments + i)
             for j in range(len(profile) - 1) for i in range(segments)]
    mesh = bpy.data.meshes.new("Hollow cup mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Rounded ceramic cup", mesh)
    bpy.context.collection.objects.link(obj)
    subdivision = obj.modifiers.new("Continuous ceramic surface", "SUBSURF")
    subdivision.levels = 2
    g.assign(obj, "white", "body")
    cylinder("Coffee surface", (0, 0, 1.34), .5, .025, "coffee")
    g.line("Rounded handle", [(.56 + .49 * math.cos(t), 0, 1 + .36 * math.sin(t))
                               for t in [math.pi / 2 - math.pi * i / 40 for i in range(41)]], .1, "blue", "body")
    cylinder("Ceramic saucer", (0, 0, .18), .88, .12, "pale")


def bottle():
    g.cube("Rounded pump bottle", (0, 0, .94), (.97, .68, 1.42), "white", .2)
    g.cube("Blue bottle detail", (0, -.36, .78), (.64, .06, .22), "blue", .08)
    cylinder("Bottle neck", (0, 0, 1.72), .2, .2, "pale")
    cylinder("Pump collar", (0, 0, 1.83), .28, .14, "white")
    g.cube("Soft pump nozzle", (.16, 0, 1.99), (.78, .31, .19), "blue", .09)
    g.cube("Nozzle outlet", (.49, 0, 1.89), (.15, .23, .16), "blue", .06)


def dumbbell():
    cylinder("Grip", (0, 0, 1), .13, 1.45, "pale", (0, math.pi / 2, 0))
    for sign in [-1, 1]:
        cylinder("Inner weight", (sign * .67, 0, 1), .4, .19, "white", (0, math.pi / 2, 0))
        cylinder("Blue round weight", (sign * .91, 0, 1), .54, .3, "blue", (0, math.pi / 2, 0))
        cylinder("Rounded end cap", (sign * 1.08, 0, 1), .17, .065, "pale", (0, math.pi / 2, 0))


def performance():
    back = g.cube("Blue admission ticket", (.08, .16, 1.09), (1.93, .23, 1.3), "blue", .16)
    back.rotation_euler[1] = -.1
    g.cube("Soft blank ticket", (0, -.08, 1.03), (1.93, .25, 1.3), "white", .16)
    for z in [.65, .88, 1.11, 1.34]:
        g.ball("Ticket perforation", (-.65, -.23, z), (.035, .016, .035), "pale", "body")
    g.line("Music stem", [(.02, -.27, .78), (.02, -.27, 1.36), (.5, -.27, 1.49), (.5, -.27, .91)], .065, "blue", "body")
    g.ball("Music note left", (-.1, -.28, .76), (.17, .07, .115), "blue", "body")
    g.ball("Music note right", (.38, -.28, .89), (.17, .07, .115), "blue", "body")


def storefront():
    g.cube("White shop body", (0, .07, .9), (1.67, .75, 1.43), "white", .18)
    g.cube("Recessed storefront", (0, -.34, .93), (1.25, .1, .99), "pale", .08)
    g.cube("White shop sill", (0, -.43, .38), (1.71, .25, .19), "white", .08)
    g.cube("Blue shop awning", (0, -.03, 1.74), (1.97, 1.04, .23), "blue", .11)
    for i, x in enumerate([-.75, -.375, 0, .375, .75]):
        g.cube("Rounded awning fold", (x, -.57, 1.51), (.33, .22, .35), "blue" if i % 2 == 0 else "white", .12)


def calendar():
    g.cube("Rounded booking calendar", (0, 0, 1.05), (1.71, .32, 1.71), "white", .18)
    g.cube("Calendar blue header", (0, -.2, 1.58), (1.46, .08, .3), "blue", .08)
    for x in [-.49, .49]:
        g.line("Calendar binding", [(x, -.22, 1.66), (x, -.22, 1.94), (x, .03, 1.94)], .065, "pale", "body")
    for x in [-.47, 0, .47]:
        for z in [.61, 1.01]:
            g.cube("Calendar blank cell", (x, -.19, z), (.26, .05, .22), "pale", .05)


for name, build in [("food", cup), ("beauty", bottle), ("sports", dumbbell),
                    ("performance", performance), ("popup", storefront), ("other", calendar)]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.world = bpy.data.worlds.new("Shared studio world")
    bpy.context.scene.world.use_nodes = True
    g.M.clear()
    for material, color, metallic, roughness in PALETTE:
        g.M[material] = g.mat(material, color, metallic, roughness)
    build()
    g.normalize_geometry()
    g.setup("service-" + name)
    scene = bpy.context.scene
    # A tighter crop lets these small navigation icons retain the library's rounded silhouette.
    scene.camera.data.ortho_scale = 3.1
    scene.render.resolution_percentage = 100
    scene.render.resolution_x = scene.render.resolution_y = 768
    bpy.ops.wm.save_as_mainfile(filepath=str(EXPORTS / (name + ".blend")), compress=True)
    for resolution in [512, 768]:
        scene.render.resolution_x = scene.render.resolution_y = resolution
        scene.render.filepath = str(EXPORTS / f"{name}-{resolution}.png")
        bpy.ops.render.render(write_still=True)
    print("SERVICE_ICON_DONE", name, flush=True)
