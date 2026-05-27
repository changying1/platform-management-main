from .registry import ai_rule

@ai_rule("equip_sign", "设备标识类")

def detect_equipment_signage(service, frame):
    if frame is None:
        return False, None

    if service.is_debug_force("equip_sign"):
        return service._check_cooldown_and_alarm(
            "设备标识缺失",
            "DEBUG: 强制触发设备标识缺失报警(链路测试)",
            1.0,
            service._debug_box(frame),
        )

    if service.model is None and not service._load_model_safe():
        return False, None

    try:
        results = service.model(frame, conf=0.45, verbose=False)[0]
        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = service._label_of(results, cls_id)

            if label in (
                "ladder_no_sign",
                "scaffold_no_sign",
                "platform_no_sign",
                "mobile_platform_no_sign",
            ):
                conf = float(box.conf[0])
                coords = box.xyxy[0].tolist()

                equip_name = "设备"
                if "ladder" in label:
                    equip_name = "梯子"
                elif "scaffold" in label:
                    equip_name = "脚手架"
                elif "mobile_platform" in label:
                    equip_name = "移动式操作平台"
                elif "platform" in label:
                    equip_name = "操作平台"

                return service._check_cooldown_and_alarm(
                    "设备标识缺失",
                    f"检测到{equip_name}未悬挂验收牌/安全注意事项牌/警示标牌",
                    conf,
                    coords,
                )

        return False, None

    except Exception as e:
        print(f"⚠️ 设备标识检测出错: {e}")
        return False, None
