from .registry import ai_rule

@ai_rule("hole_curb", "孔口挡坎违规类")

def detect_hole_curb(service, frame):
    if frame is None:
        return False, None

    if service.is_debug_force("hole_curb"):
        return service._check_cooldown_and_alarm(
            "孔口挡坎违规",
            "DEBUG: 强制触发孔口挡坎报警(链路测试)",
            1.0,
            service._debug_box(frame),
        )

    if service.model is None and not service._load_model_safe():
        return False, None

    try:
        results = service.model(frame, conf=0.45, verbose=False)[0]
        # 获取模型原始名称或使用服务默认定义的标签映射
        names = getattr(results, "names", service.class_names)
        
        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = names.get(cls_id, "unknown")
            
            # 兼容性匹配:支持 hole_danger 或包含 hole/curb 关键字的标签
            if label == "hole_danger" or "hole" in label.lower() or "curb" in label.lower():
                conf = float(box.conf[0])
                coords = box.xyxy[0].tolist()
                return service._check_cooldown_and_alarm(
                    "孔口挡坎违规",
                    "检测到孔口未设置挡坎或挡坎高度不足 (<15cm)",
                    conf,
                    coords,
                )
        return False, None
    except Exception as e:
        print(f"⚠️ 孔口检测出错: {e}")
        return False, None
