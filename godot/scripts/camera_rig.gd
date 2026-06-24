extends Node3D
## Orbit camera rig v2: long lens, wide diorama framing, and a living
## multi-axis drift (slow Lissajous on yaw/pitch/distance plus a gentle
## target sway) so the wallpaper never feels frozen.

@export var target := Vector3(-0.5, 0.4, -2.8)
@export var yaw := -12.0
@export var pitch := -32.0
@export var distance := 33.0
@export var min_distance := 18.0
@export var max_distance := 56.0
@export var drift := true
## 0 = static, 1 = default cinematic drift, 2 = dramatic.
@export var drift_amount := 1.0
@export var pan_limit_x := 10.0
@export var pan_limit_z := 7.5

var _t := 0.0
# Cinematic interest shots: glide toward a character, linger, ease back.
var _focus_node: Node3D = null
var _focus_until := 0.0
var _focus_w := 0.0
var _restore_zoom_distance := -1.0
var _home_target := Vector3.ZERO

@onready var _cam: Camera3D = $Camera3D

func _ready() -> void:
	_home_target = target
	position = target
	rotation_degrees = Vector3(pitch, yaw, 0.0)
	_cam.position = Vector3(0.0, 0.0, distance)

func zoom_by(delta: float) -> void:
	distance = clampf(distance + delta, min_distance, max_distance)
	_restore_zoom_distance = -1.0
	_cam.position.z = distance
	_clamp_pan_target()

func pan_by_screen_delta(delta: Vector2) -> void:
	var zoom_t := clampf((max_distance - distance) / max(0.001, max_distance - min_distance), 0.0, 1.0)
	var speed := lerpf(0.00105, 0.0021, zoom_t)
	var right := global_transform.basis.x
	var forward := -global_transform.basis.z
	forward.y = 0.0
	if forward.length_squared() <= 0.0001:
		forward = Vector3.FORWARD
	else:
		forward = forward.normalized()
	target += (-right * delta.x + forward * delta.y) * speed
	_clamp_pan_target()
	position = target
	_focus_node = null
	_focus_w = 0.0

func _clamp_pan_target() -> void:
	var zoom_t := clampf((max_distance - distance) / max(0.001, max_distance - min_distance), 0.0, 1.0)
	var limit_x := lerpf(pan_limit_x * 0.35, pan_limit_x, zoom_t)
	var limit_z := lerpf(pan_limit_z * 0.35, pan_limit_z, zoom_t)
	target.x = clampf(target.x, _home_target.x - limit_x, _home_target.x + limit_x)
	target.z = clampf(target.z, _home_target.z - limit_z, _home_target.z + limit_z)
	target.y = _home_target.y

func reset_zoom() -> void:
	var fit_distance := max_distance
	var at_fit := absf(distance - fit_distance) <= 0.05
	if at_fit and _restore_zoom_distance > 0.0:
		distance = clampf(_restore_zoom_distance, min_distance, max_distance)
		_restore_zoom_distance = -1.0
	else:
		if not at_fit:
			_restore_zoom_distance = distance
		distance = fit_distance
	_cam.position.z = distance
	target = _home_target
	position = target

## Ask the camera to visit something interesting for a few seconds.
## Callers rate-limit; the rig just performs the move.
func focus_on(node: Node3D, dur := 7.0) -> void:
	if node == null or not is_instance_valid(node):
		return
	_focus_node = node
	_focus_until = Time.get_ticks_msec() / 1000.0 + dur

## Is a close-up currently playing? Lets callers fire a "guaranteed" focus on
## a fresh order only when the camera is otherwise idle (no event running).
func is_focusing() -> bool:
	return is_instance_valid(_focus_node) and Time.get_ticks_msec() / 1000.0 < _focus_until

func _process(delta: float) -> void:
	if not drift or drift_amount <= 0.0:
		return
	_t += delta
	var a := drift_amount
	# Different prime-ish periods per axis → the path never visibly repeats.
	rotation_degrees.y = yaw + sin(_t * 0.060) * 5.0 * a
	rotation_degrees.x = pitch + sin(_t * 0.037 + 1.7) * 2.0 * a
	var drift_z := distance + sin(_t * 0.047 + 0.6) * 2.6 * a
	var drift_pos := target + Vector3(
		sin(_t * 0.027) * 1.1 * a,
		sin(_t * 0.051 + 0.9) * 0.15 * a,
		cos(_t * 0.033) * 0.8 * a)

	# Blend toward the interest shot and back out, slow and creamy.
	var now := Time.get_ticks_msec() / 1000.0
	var want := 1.0 if (_focus_node != null and is_instance_valid(_focus_node)
		and now < _focus_until) else 0.0
	_focus_w = move_toward(_focus_w, want, delta * 0.45)
	if _focus_w <= 0.0:
		if want == 0.0:
			_focus_node = null
		position = drift_pos
		_cam.position.z = drift_z
		return
	var k := smoothstep(0.0, 1.0, _focus_w)
	if _focus_node == null or not is_instance_valid(_focus_node):
		_focus_node = null
		_focus_w = 0.0
		position = drift_pos
		_cam.position.z = drift_z
		return
	var fp: Vector3 = _focus_node.global_position
	position = drift_pos.lerp(Vector3(fp.x, fp.y + 0.35, fp.z), k)
	_cam.position.z = lerpf(drift_z, 21.0, k)
