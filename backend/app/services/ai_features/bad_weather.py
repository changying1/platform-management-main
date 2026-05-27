from .registry import ai_rule


@ai_rule("bad_weather", "恶劣天气作业")
def bad_weather(service, frame):
    """
    结合天气数据判断
    """

    weather = getattr(service, "weather", None)

    if weather is None:
        return False, {}

    wind = weather.get("wind_level", 0)
    rain = weather.get("rain", False)
    snow = weather.get("snow", False)

    if wind >= 6 or rain or snow:

        results = service.model(frame)[0]

        for box in results.boxes:

            cls = int(box.cls[0])
            name = service.labels[cls]

            if name == "person":

                return True, {
                    "type": "bad_weather",
                    "msg": "恶劣天气仍存在高处作业人员",
                    "wind": wind,
                    "rain": rain,
                    "snow": snow
                }

    return False, {}