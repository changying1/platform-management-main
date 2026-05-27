from onvif import ONVIFCamera

camera = ONVIFCamera('10.102.7.154', 80, 'admin', 'Song@871023')
media = camera.create_media_service()
ptz = camera.create_ptz_service()
profiles = media.GetProfiles()
token = profiles[0].token

# 发送停止命令(速度为0)
stop_request = {
    'ProfileToken': token,
    'Velocity': {
        'PanTilt': {'x': 0.0, 'y': 0.0},
        'Zoom': {'x': 0.0}
    }
}

ptz.ContinuousMove(stop_request)
print("停止命令已发送")