extends Node3D
## Root controller for the office floor: real-time day cycle, screenshot
## automation (--shot) and wallpaper mode (--wallpaper).

## hour → [sun pitch°, sun energy, sun color, sky color, ambient energy].
## Ambient must follow the clock too — light surroundings (grass, mountains)
## glow unnaturally at night otherwise.
## Tuned to a realistic tropical (Thailand) sun: first light ~5:45, sunrise
## ~6:10, golden mornings, white overhead noon, golden hour from ~17:30,
## sunset ~18:20 with a purple dusk, full night by ~19:10.
const DAY_KEYS := [
	[0.0,  -40.0, 0.22, Color(0.5, 0.62, 1.0),  Color(0.05, 0.07, 0.16), 0.8],   # deep night
	[5.6,  -40.0, 0.22, Color(0.5, 0.62, 1.0),  Color(0.06, 0.08, 0.18), 0.8],   # pre-dawn
	[6.1,  -11.0, 0.9,  Color(1.0, 0.52, 0.32), Color(0.5, 0.38, 0.52),  1.05],  # sunrise — red sun, mauve sky
	[7.0,  -20.0, 1.9,  Color(1.0, 0.76, 0.5),  Color(0.82, 0.68, 0.58), 1.45],  # golden morning
	[9.0,  -38.0, 2.5,  Color(1.0, 0.91, 0.78), Color(0.58, 0.77, 1.0),  1.6],   # bright morning
	[12.0, -50.0, 2.7,  Color(1.0, 0.93, 0.8),  Color(0.55, 0.74, 1.0),  1.6],   # noon — warm daylight, not washed-out white (lower ambient = richer + visible shadows)
	[15.0, -45.0, 2.6,  Color(1.0, 0.91, 0.78), Color(0.58, 0.76, 1.0),  1.6],   # afternoon
	[17.0, -30.0, 2.3,  Color(1.0, 0.82, 0.56), Color(0.74, 0.72, 0.66), 1.6],   # late afternoon, warming
	[18.0, -15.0, 1.5,  Color(1.0, 0.58, 0.32), Color(0.95, 0.55, 0.38), 1.2],   # golden hour
	[18.4, -8.0,  0.7,  Color(1.0, 0.42, 0.3),  Color(0.45, 0.28, 0.42), 0.95],  # sunset — purple dusk
	[19.1, -40.0, 0.22, Color(0.5, 0.62, 1.0),  Color(0.07, 0.09, 0.2),  0.8],   # night falls
	[24.0, -40.0, 0.22, Color(0.5, 0.62, 1.0),  Color(0.05, 0.07, 0.16), 0.8],
]
const SEASONS := ["spring", "summer", "autumn", "winter"]
const WEATHER_BY_SEASON := {
	"spring": ["sunny", "light_rain"],
	"summer": ["sunny", "light_rain", "storm"],
	"autumn": ["sunny", "light_rain"],
	"winter": ["sunny", "snow"],
}

var _day_timer := 0.0
var _hour_override := -1.0
var _cli_pinned := false  # --hour=N beats replayed ui.daylight events
var _season_offset := 0
var _season_name := ""
var _weather_offset := 0
var _weather_name := ""

var _wallpaper_mode := false
var _occ_check_timer := 0.0
var _occluded := false
var _fps_log_timer := 0.0
var _resize_dragging := false
var _map_dragging := false
var _season_button: Button
var _weather_button: Button
var _season_req: HTTPRequest
var _weather_req: HTTPRequest
var _map_capture_busy := false
var _map_capture_pending := false
var _scene_booted := false

func wallpaper_active_fps() -> int:
	# Windows desktop embedding currently has no reliable occlusion monitor in the
	# shell, so keep the always-on wallpaper conservative by default.
	return 12 if OS.get_name() == "Windows" else 30

func wallpaper_hidden_fps() -> int:
	return 2

func set_wallpaper_visible(on: bool) -> void:
	Engine.max_fps = wallpaper_active_fps() if on else wallpaper_hidden_fps()

func _disable_camera_blur() -> void:
	var cam := get_node_or_null("CameraRig/Camera3D") as Camera3D
	if cam == null:
		pass
	elif cam.attributes:
		cam.attributes.dof_blur_far_enabled = false
		cam.attributes.dof_blur_near_enabled = false
		cam.attributes.dof_blur_amount = 0.0
	for n in ["CinemaLayer", "GrainLayer"]:
		var layer := get_node_or_null(n)
		if layer:
			layer.visible = false

func _force_opaque_window() -> void:
	RenderingServer.set_default_clear_color(Color(0.02, 0.03, 0.05, 1.0))
	get_tree().root.transparent_bg = false
	get_viewport().transparent_bg = false
	var win := get_window()
	if win:
		win.transparent = false
	DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_TRANSPARENT, false)

func _build_window_controls() -> void:
	if not (_wallpaper_mode and OS.get_name() == "Windows"):
		return
	if get_node_or_null("WindowControls"):
		return
	var layer := CanvasLayer.new()
	layer.name = "WindowControls"
	layer.layer = 200
	add_child(layer)

	var grip := PanelContainer.new()
	grip.tooltip_text = "Drag to resize"
	grip.mouse_filter = Control.MOUSE_FILTER_STOP
	grip.anchor_left = 1.0
	grip.anchor_top = 1.0
	grip.anchor_right = 1.0
	grip.anchor_bottom = 1.0
	grip.offset_left = -34.0
	grip.offset_top = -34.0
	grip.offset_right = -8.0
	grip.offset_bottom = -8.0
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.04, 0.06, 0.1, 0.55)
	style.border_color = Color(0.55, 0.8, 1.0, 0.65)
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	grip.add_theme_stylebox_override("panel", style)
	var mark := Label.new()
	mark.text = "///"
	mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mark.add_theme_font_size_override("font_size", 10)
	grip.add_child(mark)
	grip.gui_input.connect(_on_resize_grip_input)
	layer.add_child(grip)

	var row := HBoxContainer.new()
	row.name = "SeasonControls"
	row.anchor_left = 0.0
	row.anchor_top = 0.0
	row.anchor_right = 0.0
	row.anchor_bottom = 0.0
	row.offset_left = 12.0
	row.offset_top = 12.0
	row.offset_right = 210.0
	row.offset_bottom = 44.0
	row.add_theme_constant_override("separation", 8)
	layer.add_child(row)

	_season_button = Button.new()
	_season_button.focus_mode = Control.FOCUS_NONE
	_season_button.tooltip_text = "Switch season"
	_season_button.pressed.connect(_request_next_season)
	row.add_child(_season_button)

	_weather_button = Button.new()
	_weather_button.focus_mode = Control.FOCUS_NONE
	_weather_button.tooltip_text = "Switch weather"
	_weather_button.pressed.connect(_request_next_weather)
	row.add_child(_weather_button)

	_season_req = HTTPRequest.new()
	add_child(_season_req)
	_season_req.request_completed.connect(_on_season_requested)

	_weather_req = HTTPRequest.new()
	add_child(_weather_req)
	_weather_req.request_completed.connect(_on_weather_requested)
	_update_season_controls()
	_update_weather_controls()

func _on_resize_grip_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_resize_dragging = event.pressed
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion and _resize_dragging:
		var size := DisplayServer.window_get_size()
		size.x = maxi(720, size.x + int(round(event.relative.x)))
		size.y = maxi(405, size.y + int(round(event.relative.y)))
		DisplayServer.window_set_size(size)
		get_viewport().set_input_as_handled()

func _request_next_season() -> void:
	if not is_instance_valid(_season_req):
		return
	if _season_req.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		return
	if is_instance_valid(_season_button):
		_season_button.disabled = true
	var err := _season_req.request("http://127.0.0.1:8787/ui/season",
		["content-type: application/json"], HTTPClient.METHOD_POST,
		JSON.stringify({"step": 1}))
	if err != OK:
		if is_instance_valid(_season_button):
			_season_button.disabled = false

func _on_season_requested(_result: int, _code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	if is_instance_valid(_season_button):
		_season_button.disabled = false

func _request_next_weather() -> void:
	if not is_instance_valid(_weather_req):
		return
	if _weather_req.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		return
	if is_instance_valid(_weather_button):
		_weather_button.disabled = true
	var err := _weather_req.request("http://127.0.0.1:8787/ui/weather",
		["content-type: application/json"], HTTPClient.METHOD_POST,
		JSON.stringify({"step": 1}))
	if err != OK:
		if is_instance_valid(_weather_button):
			_weather_button.disabled = false

func _on_weather_requested(_result: int, _code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	if is_instance_valid(_weather_button):
		_weather_button.disabled = false

func _season_label(season: String) -> String:
	match season:
		"spring":
			return "Spring"
		"summer":
			return "Summer"
		"autumn":
			return "Autumn"
		"winter":
			return "Winter"
	return season.capitalize()

func _weather_label(weather: String) -> String:
	match weather:
		"sunny":
			return "Sunny"
		"light_rain":
			return "Light rain"
		"storm":
			return "Storm"
		"snow":
			return "Snow"
	return weather.capitalize()

func _update_season_controls() -> void:
	if is_instance_valid(_season_button):
		_season_button.text = "Season: " + _season_label(_season_name)

func _update_weather_controls() -> void:
	if is_instance_valid(_weather_button):
		_weather_button.text = "Weather: " + _weather_label(_weather_name)

func _unhandled_input(event: InputEvent) -> void:
	if not (_wallpaper_mode and OS.get_name() == "Windows"):
		return
	var rig := get_node_or_null("CameraRig")
	if rig == null:
		return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			_map_dragging = event.pressed
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			if rig.has_method("zoom_by"):
				rig.zoom_by(-2.0)
				get_viewport().set_input_as_handled()
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			if rig.has_method("zoom_by"):
				rig.zoom_by(2.0)
				get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion and _map_dragging:
		if rig.has_method("pan_by_screen_delta"):
			rig.pan_by_screen_delta(event.relative)
			get_viewport().set_input_as_handled()
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_EQUAL or event.keycode == KEY_KP_ADD:
			if rig.has_method("zoom_by"):
				rig.zoom_by(-2.0)
				get_viewport().set_input_as_handled()
		elif event.keycode == KEY_MINUS or event.keycode == KEY_KP_SUBTRACT:
			if rig.has_method("zoom_by"):
				rig.zoom_by(2.0)
				get_viewport().set_input_as_handled()
		elif event.keycode == KEY_0 or event.keycode == KEY_KP_0:
			if rig.has_method("reset_zoom"):
				rig.reset_zoom()
				get_viewport().set_input_as_handled()

func _ready() -> void:
	_wallpaper_mode = "--wallpaper" in OS.get_cmdline_user_args()
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--hour="):
			_hour_override = float(arg.split("=")[1])
			_cli_pinned = true
	_disable_camera_blur()
	$Sun.rotation_degrees = Vector3(-46.0, 150.0, 0.0)
	_apply_daylight()
	_apply_season(true)
	_apply_weather(true)

	# 🎨 3D EDITOR MODE — a normal window for arranging the office. Skip the
	# wallpaper attach / splash / live agents / cinematic drift; drive the
	# camera and editing through map_editor.gd. The procedural world stays as
	# locked context.
	if "--editor3d" in OS.get_cmdline_user_args():
		_enter_editor_mode()
		return

	if "--shot" in OS.get_cmdline_user_args():
		_take_shot()

		_request_map_capture(4.0)

	# 🎨 Office Editor layer: spawn the user's custom furniture/decor on top
	# of the procedural world (atmosphere + effects stay intact).
	var layout: Node = load("res://scripts/layout_loader.gd").new()
	layout.name = "LayoutLoader"
	add_child(layout)
	_scene_booted = true

	# Splash floats logo-only over the desktop (transparent window). Going
	# opaque here would paint a black box for the whole blocking scene build
	# — flip only after the first real frame is on screen.
	_opaque_after_first_frame()

	if "--wallpaper" in OS.get_cmdline_user_args():
		# NB: borderless/fullscreen/opaque happen in _opaque_after_first_frame
		# — touching the window mid-load repaints the splash on black.
		# Wallpaper rung. Windows keeps the renderer alive even when the desktop
		# is covered, so use a lower-cost default there.
		set_wallpaper_visible(true)
		var low_power := OS.get_name() == "Windows"
		get_viewport().scaling_3d_scale = 0.75 if low_power else 1.0
		get_viewport().msaa_3d = Viewport.MSAA_DISABLED if low_power else Viewport.MSAA_2X
		var env: Environment = $WorldEnvironment.environment
		env.ssao_enabled = false
		env.ssr_max_steps = 24
		# Volumetric froxel pipeline is the big GPU cost — at wallpaper rung
		# the fake beam cards carry the god-ray look on their own.
		env.volumetric_fog_enabled = false
		# Shadow atlas: the orthogonal map is fit to the whole view frustum (up to
		# directional_shadow_max_distance = 100, which must cover the office at the
		# far wallpaper camera or shadows vanish entirely when zoomed out). Spread
		# over that large area, 4096 read soft/faint at normal zoom — 8192 packs
		# enough texels to stay CRISP at the far camera, the same way the map
		# concentrates when you zoom in. Windows local-custom mode favors GPU headroom.
		RenderingServer.directional_shadow_atlas_set_size(2048 if low_power else 8192, true)
		var cam: Camera3D = $CameraRig/Camera3D
		cam.attributes.dof_blur_far_enabled = false
		cam.attributes.dof_blur_near_enabled = false

## 🎨 Switch this instance into the standalone 3D Office Editor.
## Boots EXACTLY like the main app: the window stays transparent/borderless while
## everything loads (so Godot's small centred boot splash floats over the desktop
## — no black box), then goes opaque + windowed after the first real frame.
func _enter_editor_mode() -> void:
	DisplayServer.window_set_title("BagIdea Office Editor")
	var icon := Image.new()
	if icon.load(ProjectSettings.globalize_path("res://assets/brand/logo_ico_cute.png")) == OK:
		DisplayServer.set_icon(icon)
	# bright, fixed daylight for clear editing
	_cli_pinned = true
	_hour_override = 12.0
	_apply_daylight()
	# silence the live office: no cinematic drift, no agents, no overlays
	var rig := get_node_or_null("CameraRig")
	if rig:
		rig.set_process(false)
		rig.set_physics_process(false)
		if rig.has_method("set_process_input"):
			rig.set_process_input(false)
	var ec := get_node_or_null("EventClient")
	if ec:
		ec.set_process(false)
	for n in ["CinemaLayer", "GrainLayer", "Hud"]:
		var node := get_node_or_null(n)
		if node:
			node.visible = false
	# camera = the real framing, DOF off (blur made everything fuzzy)
	var cam: Camera3D = $CameraRig/Camera3D
	if cam.attributes:
		cam.attributes.dof_blur_far_enabled = false
		cam.attributes.dof_blur_near_enabled = false
	# drive the camera + editing (built while the transparent boot splash shows)
	var ed: Node = load("res://scripts/map_editor.gd").new()
	ed.name = "MapEditor"
	add_child(ed)
	ed.setup($CameraRig, cam)
	# first real frame is ready → drop the transparent boot splash, become the
	# opaque framed editor window (same handoff as the main app).
	await RenderingServer.frame_post_draw
	_force_opaque_window()
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, false)
	var win := Vector2i(1280, 800)
	DisplayServer.window_set_size(win)
	var scr := DisplayServer.window_get_current_screen()
	var sp := DisplayServer.screen_get_position(scr)
	var ss := DisplayServer.screen_get_size(scr)
	DisplayServer.window_set_position(sp + (ss - win) / 2)
	get_window().grab_focus()
	DisplayServer.window_move_to_foreground()
	get_tree().create_timer(0.6).timeout.connect(func():
		DisplayServer.window_move_to_foreground(); get_window().grab_focus())
	# re-assert the title AFTER the window is framed — Godot stamps
	# "<project> (DEBUG)" on a debug run; setting it here overrides that suffix.
	DisplayServer.window_set_title("BagIdea Office Editor")
	_force_opaque_window()
	get_tree().create_timer(0.8).timeout.connect(func():
		DisplayServer.window_set_title("BagIdea Office Editor"))
	Engine.max_fps = 60
	# tell the shell the editor is on screen → it drops the circular logo splash
	# (same handoff as the wallpaper's bagidea_world_ready flag)
	var flag := FileAccess.open(
		OS.get_environment("TEMP").path_join("bagidea_editor_ready"), FileAccess.WRITE)
	if flag:
		flag.store_line(Time.get_datetime_string_from_system())

## Manual atmosphere from the overlay: {"hour": 17.5} pins the clock for
## debugging/beauty shots; {"hour": "auto"} hands it back to real time.
func apply_daylight_event(evt: Dictionary) -> void:
	if _cli_pinned:
		return
	var h: Variant = evt.get("hour", "auto")
	_hour_override = float(h) if (h is float or h is int) else -1.0
	_apply_daylight()

func apply_season_event(evt: Dictionary) -> void:
	if evt.has("offset"):
		_season_offset = ((int(evt.get("offset", 0)) % SEASONS.size()) + SEASONS.size()) % SEASONS.size()
	elif evt.has("season"):
		var s := str(evt.get("season", "spring")).to_lower()
		var ix := SEASONS.find(s)
		if ix >= 0:
			var h := int(Time.get_time_dict_from_system().hour)
			_season_offset = (ix - int(floor(float(h) / 2.0)) + SEASONS.size()) % SEASONS.size()
	_apply_season(true)
	_apply_weather(true)

func apply_weather_event(evt: Dictionary) -> void:
	var opts: Array = WEATHER_BY_SEASON.get(_season_name, WEATHER_BY_SEASON["spring"])
	if evt.has("offset"):
		_weather_offset = ((int(evt.get("offset", 0)) % opts.size()) + opts.size()) % opts.size()
	elif evt.has("weather"):
		var w := str(evt.get("weather", "sunny")).to_lower()
		var ix := opts.find(w)
		if ix >= 0:
			var slot := int(Time.get_unix_time_from_system() / 3600.0)
			_weather_offset = (ix - _weather_base_index(slot, _season_name, opts.size()) + opts.size()) % opts.size()
	_apply_weather(true)

func _opaque_after_first_frame() -> void:
	await RenderingServer.frame_post_draw
	_force_opaque_window()
	if "--wallpaper" in OS.get_cmdline_user_args():
		if OS.get_name() == "Windows":
			DisplayServer.window_set_title("BagIdea Office")
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, false)
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_RESIZE_DISABLED, false)
			DisplayServer.window_set_min_size(Vector2i(720, 405))
			var win := Vector2i(1280, 720)
			DisplayServer.window_set_size(win)
			var scr := DisplayServer.window_get_current_screen()
			var sp := DisplayServer.screen_get_position(scr)
			var ss := DisplayServer.screen_get_size(scr)
			DisplayServer.window_set_position(sp + (ss - win) / 2)
			_build_window_controls()
		else:
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, true)
			DisplayServer.window_set_position(Vector2i.ZERO)
			DisplayServer.window_set_size(DisplayServer.screen_get_size())
		_force_opaque_window()
		await RenderingServer.frame_post_draw
		_force_opaque_window()
	# Signal the shell that the scene is on screen — it holds the WorkerW
	# attach until now so the transparent splash survives the whole load.
	var flag := FileAccess.open(
		OS.get_environment("TEMP").path_join("bagidea_world_ready"), FileAccess.WRITE)
	if flag:
		flag.store_line(Time.get_datetime_string_from_system())

func _process(delta: float) -> void:
	_day_timer -= delta
	if _day_timer <= 0.0:
		_day_timer = 60.0  # re-evaluate once a minute
		_apply_daylight()
		_apply_season()
		_apply_weather()

	if _wallpaper_mode:
		# Occlusion throttle: shim writes /tmp/bagidea_occ when the window is
		# fully hidden — drop to 2 fps so we consume near-zero GPU while invisible.
		_occ_check_timer -= delta
		if _occ_check_timer <= 0.0:
			_occ_check_timer = 0.5
			var now_occ := FileAccess.open("/private/tmp/bagidea_occ", FileAccess.READ) != null
			if now_occ != _occluded:
				_occluded = now_occ
				set_wallpaper_visible(not _occluded)

		# FPS telemetry for perf testing: write actual fps to /tmp/bagidea_fps once/sec.
		_fps_log_timer += delta
		if _fps_log_timer >= 1.0:
			_fps_log_timer -= 1.0
			var f := FileAccess.open("/private/tmp/bagidea_fps", FileAccess.WRITE)
			if f:
				f.store_line(str(Engine.get_frames_per_second()))

## Sun, sky and god-ray cards follow the machine's real local time (doc 3.4:
## lighting itself is a status display — glance at the office, read the day).
func _apply_daylight() -> void:
	var t := Time.get_time_dict_from_system()
	var hour: float = t.hour + t.minute / 60.0
	if _hour_override >= 0.0:
		hour = _hour_override
	var a: Array = DAY_KEYS[0]
	var b: Array = DAY_KEYS[DAY_KEYS.size() - 1]
	for i in DAY_KEYS.size() - 1:
		if hour >= DAY_KEYS[i][0] and hour <= DAY_KEYS[i + 1][0]:
			a = DAY_KEYS[i]
			b = DAY_KEYS[i + 1]
			break
	var f: float = 0.0 if b[0] == a[0] else (hour - a[0]) / (b[0] - a[0])
	var pitch: float = lerpf(a[1], b[1], f)
	var energy: float = lerpf(a[2], b[2], f)
	var sun_col: Color = a[3].lerp(b[3], f)
	var sky_col: Color = a[4].lerp(b[4], f)
	if _weather_name != "" and _weather_name != "sunny":
		energy = 0.0

	$Sun.rotation_degrees = Vector3(pitch, 150.0, 0.0)
	$Sun.light_energy = energy
	$Sun.light_color = sun_col
	var env: Environment = $WorldEnvironment.environment
	env.ambient_light_energy = lerpf(a[5], b[5], f)
	# Procedural sky is the IBL source (ambient + reflections) — keep its
	# colors on the clock so glossy floors mirror dawn/day/night correctly.
	if env.sky and env.sky.sky_material is ProceduralSkyMaterial:
		var sm: ProceduralSkyMaterial = env.sky.sky_material
		sm.sky_top_color = sky_col.darkened(0.25)
		sm.sky_horizon_color = sky_col.lightened(0.25)
		sm.ground_horizon_color = sky_col * Color(0.75, 0.8, 0.7)
	var world: Node3D = $World
	# Roofline clock + phase icon + the day/night particle shift.
	var phase := "day"
	if hour < 5.8 or hour >= 19.0:
		phase = "night"
	elif hour < 8.5:
		phase = "dawn"
	elif hour >= 17.3:
		phase = "dusk"
	var mins := int(round(fmod(hour, 1.0) * 60.0)) % 60
	world.update_clock("%02d:%02d" % [int(hour) % 24, mins], phase)
	world.set_night_life(phase in ["dusk", "night"])
	if world.sky_mat:
		world.sky_mat.emission = sky_col
		world.sky_mat.albedo_color = sky_col
	for bm in world.beam_mats:
		bm.set_shader_parameter("strength", 0.18 * clampf(energy / 2.6, 0.0, 1.0))
		bm.set_shader_parameter("tint", Color(sun_col.r, sun_col.g, sun_col.b * 0.8))

func _apply_season(force := false) -> void:
	var h := int(Time.get_time_dict_from_system().hour)
	var season: String = SEASONS[(int(floor(float(h) / 2.0)) + _season_offset) % SEASONS.size()]
	if not force and season == _season_name:
		return
	_season_name = season
	var opts: Array = WEATHER_BY_SEASON.get(_season_name, WEATHER_BY_SEASON["spring"])
	_weather_offset = ((_weather_offset % opts.size()) + opts.size()) % opts.size()
	var world: Node3D = $World
	if world and world.has_method("apply_season"):
		world.apply_season(season)
	_update_season_controls()
	if _scene_booted:
		_request_map_capture(0.4)

func _weather_base_index(slot: int, season: String, count: int) -> int:
	if count <= 1:
		return 0
	var seed: int = int(abs((slot ^ (season.length() * 131)) * 1103515245 + 12345))
	return seed % count

func _apply_weather(force := false) -> void:
	if _season_name == "":
		_apply_season(true)
	var opts: Array = WEATHER_BY_SEASON.get(_season_name, WEATHER_BY_SEASON["spring"])
	var slot := int(Time.get_unix_time_from_system() / 3600.0)
	var weather: String = opts[(_weather_base_index(slot, _season_name, opts.size()) + _weather_offset) % opts.size()]
	if not force and weather == _weather_name:
		return
	_weather_name = weather
	var world: Node3D = $World
	if world and world.has_method("apply_weather"):
		world.apply_weather(weather, _season_name)
	_apply_daylight()
	_update_weather_controls()
	if _scene_booted:
		_request_map_capture(0.4)

## Orthographic top-down floorplan, rendered once into a SubViewport and
## shipped to the daemon — the overlay's live-map background. Extents MUST
## match overlay.html's MAP_* constants: x -11.29..17.29, z -11..14.
func _request_map_capture(delay := 0.0) -> void:
	if _map_capture_busy:
		_map_capture_pending = true
		return
	_capture_map.call_deferred(delay)

func _capture_map(delay := 4.0) -> void:
	_map_capture_busy = true
	if delay > 0.0:
		await get_tree().create_timer(delay).timeout  # world + runtime assets ready
	var vp := SubViewport.new()
	vp.size = Vector2i(832, 640)   # 1.3:1 — matches the rectangular office (X>Z)
	vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	add_child(vp)
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = 26.0                # vertical world extent; horizontal = 26*832/640 ≈ 33.8
	cam.cull_mask = 1  # world only — characters live on render layer 2
	cam.position = Vector3(0, 40, 0)
	cam.rotation_degrees = Vector3(-90, 0, 0)
	vp.add_child(cam)
	cam.current = true
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var img := vp.get_texture().get_image()
	vp.queue_free()
	var req := HTTPRequest.new()
	add_child(req)
	req.request_completed.connect(func(_r, _c, _h, _b): req.queue_free())
	req.request_raw("http://127.0.0.1:8787/map/bg", ["content-type: image/png"],
		HTTPClient.METHOD_POST, img.save_png_to_buffer())
	_map_capture_busy = false
	if _map_capture_pending:
		_map_capture_pending = false
		_request_map_capture(0.4)

func _take_shot() -> void:
	await get_tree().create_timer(2.5).timeout
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var dir := ProjectSettings.globalize_path("res://").path_join("../shots")
	DirAccess.make_dir_recursive_absolute(dir)
	var path := dir.path_join("office_floor.png")
	img.save_png(path)
	print("screenshot saved: ", path)
	get_tree().quit()
