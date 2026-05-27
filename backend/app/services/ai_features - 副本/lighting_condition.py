from .registry import ai_rule
import cv2
import numpy as np


@ai_rule("lighting_condition", "施工照明")
def lighting_condition(service, frame):

    if frame is None:
        return False, {}

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    brightness = np.mean(gray)

    if brightness < 50:

        return True, {
            "type": "lighting_condition",
            "msg": "施工现场照明不足",
            "brightness": brightness
        }

    return False, {}