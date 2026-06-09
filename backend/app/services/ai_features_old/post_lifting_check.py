from .registry import ai_rule


@ai_rule("post_lifting_check", "吊后检查")
def post_lifting_check(service, frame):
    if frame is None:
        return False, {}

    if service.model is None and not service._load_model_safe():
        return False, {}

    try:
        results = service.model(frame, conf=0.4, verbose=False)[0]

        hook_low = 0
        gear_ground = 0
        outrigger_unretracted = 0

        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in {"hook_too_low", "hook_low"}:
                hook_low += 1
            elif label in {"gear_on_ground", "wire_rope_on_ground", "hook_on_ground"}:
                gear_ground += 1
            elif label in {"outrigger_not_retracted"}:
                outrigger_unretracted += 1

        if hook_low > 0 or gear_ground > 0 or outrigger_unretracted > 0:
            return True, {
                "type": "post_lifting_check",
                "msg": "吊装结束后吊索具未归位、吊钩高度不足或支腿未收回",
                "hook_low": hook_low,
                "gear_ground": gear_ground,
                "outrigger_unretracted": outrigger_unretracted,
            }

        return False, {}

    except Exception as e:
        print(f"⚠️ 吊后检查检测出错: {e}")
        return False, {}