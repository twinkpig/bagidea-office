extends Sprite3D
## Tiny procedural outdoor wildlife. The world builder chooses which critters
## appear for the current season/weather; this sprite just draws and wanders.

const ART := {
	"rabbit": [
		".w....w.",
		"w.w..w.w",
		".wwwwww.",
		"wwbwwbww",
		"wwwwwwww",
		".wppppw.",
		"..w..w..",
	],
	"snowrabbit": [
		".s....s.",
		"s.s..s.s",
		".ssssss.",
		"ssbssbss",
		"ssssssss",
		".spppps.",
		"..s..s..",
	],
	"duck": [
		"........",
		"...yy...",
		"..yyyy..",
		"yyyyyobb",
		".yyyyy..",
		"..o.oo..",
	],
	"frog": [
		"........",
		"..g..g..",
		".gggggg.",
		"ggbggbgg",
		".gggggg.",
		"g.g..g.g",
	],
	"butterfly": [
		"m..b..m",
		"mm.b.mm",
		".mmbmm.",
		"..bbb..",
		".ppbpp.",
		"pp.b.pp",
		"p..b..p",
	],
	"squirrel": [
		"....rrr.",
		"...rrrrr",
		"..rr....",
		".rrrrr..",
		"rrbrbr..",
		".rrrr...",
		"..r.r...",
	],
	"fox": [
		"o......o",
		"oo....oo",
		".oooooo.",
		"oobooobo",
		".oooooo.",
		"..w..w..",
	],
	"crow": [
		"........",
		"..kkkk..",
		".kkkkkk.",
		"kkbkkbkk",
		".kkkkkk.",
		"..k..k..",
	],
	"snowbird": [
		"........",
		"..bbbb..",
		".wwwwww.",
		"wwbwwbww",
		".wwwwww.",
		"..b..b..",
	],
	"deer": [
		"t..t....",
		".tt.....",
		"..nnnn..",
		".nkbkn..",
		"nnnnnnn.",
		"..n..n..",
	],
}

const PAL := {
	"w": Color(0.9, 0.88, 0.76),
	"s": Color(0.95, 0.98, 1.0),
	"p": Color(1.0, 0.68, 0.72),
	"b": Color(0.06, 0.07, 0.08),
	"y": Color(0.95, 0.74, 0.16),
	"o": Color(0.9, 0.46, 0.12),
	"g": Color(0.22, 0.66, 0.28),
	"m": Color(0.88, 0.35, 0.84),
	"r": Color(0.58, 0.28, 0.12),
	"k": Color(0.08, 0.09, 0.12),
	"n": Color(0.56, 0.34, 0.18),
	"t": Color(0.34, 0.2, 0.1),
}

var species := "rabbit"
var roam_radius := Vector2(1.6, 0.9)
var speed := 0.65
var _home := Vector3.ZERO
var _tween: Tween
var _flutter := false
var _t := 0.0

func setup(p_species: String, p_radius := Vector2(1.6, 0.9), p_speed := 0.65) -> void:
	species = p_species
	roam_radius = p_radius
	speed = p_speed

func _ready() -> void:
	layers = 2
	billboard = BaseMaterial3D.BILLBOARD_ENABLED
	shaded = true
	alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	pixel_size = 0.045 if species in ["butterfly"] else 0.032
	offset.y = 4.0 if species in ["butterfly"] else 5.5
	_flutter = species in ["butterfly", "snowbird"]
	_home = position
	texture = _bake(ART.get(species, ART["rabbit"]))
	_life_loop()

func _bake(art: Array) -> ImageTexture:
	var w: int = String(art[0]).length()
	var h := art.size()
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	for y in h:
		var row := String(art[y])
		for x in w:
			var key := row[x]
			if key != ".":
				img.set_pixel(x, y, PAL.get(key, Color.WHITE))
	return ImageTexture.create_from_image(img)

func _life_loop() -> void:
	while is_inside_tree():
		await get_tree().create_timer(randf_range(1.8, 5.8)).timeout
		if not is_inside_tree():
			return
		if species in ["butterfly", "snowbird"]:
			_flutter_to(_home + Vector3(randf_range(-roam_radius.x, roam_radius.x),
				randf_range(0.15, 0.75), randf_range(-roam_radius.y, roam_radius.y)))
		elif randf() < 0.72:
			_walk_to(_home + Vector3(randf_range(-roam_radius.x, roam_radius.x),
				0.0, randf_range(-roam_radius.y, roam_radius.y)))

func _walk_to(target: Vector3) -> void:
	flip_h = target.x < position.x
	if _tween:
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(self, "position", target, position.distance_to(target) / speed)

func _flutter_to(target: Vector3) -> void:
	flip_h = target.x < position.x
	if _tween:
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(self, "position", target, position.distance_to(target) / speed)

func _process(delta: float) -> void:
	_t += delta
	if _flutter:
		offset.y = 5.5 + sin(_t * 8.0) * 1.6
	else:
		offset.y = 5.5 + maxf(0.0, sin(_t * 5.0)) * 0.7
