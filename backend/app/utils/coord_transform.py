import math


PI = 3.1415926535897932384626
A = 6378245.0
EE = 0.00669342162296594323


def wgs84_to_gcj02(lng: float, lat: float):
    if out_of_china(lng, lat):
        return lng, lat

    dlat = _transform_lat(lng - 105.0, lat - 35.0)
    dlng = _transform_lng(lng - 105.0, lat - 35.0)
    radlat = lat / 180.0 * PI
    magic = math.sin(radlat)
    magic = 1 - EE * magic * magic
    sqrtmagic = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((A * (1 - EE)) / (magic * sqrtmagic) * PI)
    dlng = (dlng * 180.0) / (A / sqrtmagic * math.cos(radlat) * PI)
    return round(lng + dlng, 12), round(lat + dlat, 12)


def gcj02_to_wgs84(lng: float, lat: float):
    if out_of_china(lng, lat):
        return lng, lat

    lng_wgs, lat_wgs = lng, lat
    for _ in range(5):
        curr_lng, curr_lat = wgs84_to_gcj02(lng_wgs, lat_wgs)
        lng_wgs += lng - curr_lng
        lat_wgs += lat - curr_lat
    return round(lng_wgs, 12), round(lat_wgs, 12)


def _transform_lat(lng, lat):
    ret = (
        -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat
        + 0.1 * lng * lat + 0.2 * math.sqrt(abs(lng))
    )
    ret += (20.0 * math.sin(6.0 * lng * PI) + 20.0 * math.sin(2.0 * lng * PI)) * 2.0 / 3.0
    ret += (20.0 * math.sin(lat * PI) + 40.0 * math.sin(lat / 3.0 * PI)) * 2.0 / 3.0
    ret += (160.0 * math.sin(lat / 12.0 * PI) + 320 * math.sin(lat * PI / 30.0)) * 2.0 / 3.0
    return ret


def _transform_lng(lng, lat):
    ret = (
        300.0 + lng + 2.0 * lat + 0.1 * lng * lng
        + 0.1 * lng * lat + 0.1 * math.sqrt(abs(lng))
    )
    ret += (20.0 * math.sin(6.0 * lng * PI) + 20.0 * math.sin(2.0 * lng * PI)) * 2.0 / 3.0
    ret += (20.0 * math.sin(lng * PI) + 40.0 * math.sin(lng / 3.0 * PI)) * 2.0 / 3.0
    ret += (150.0 * math.sin(lng / 12.0 * PI) + 300.0 * math.sin(lng / 30.0 * PI)) * 2.0 / 3.0
    return ret


def out_of_china(lng, lat):
    return not (73.66 < lng < 135.05 and 3.86 < lat < 53.55)
