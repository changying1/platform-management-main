from ultralytics import YOLO

model = YOLO("backend/app/services/yolo_models/helmet.pt")
print(model.names)