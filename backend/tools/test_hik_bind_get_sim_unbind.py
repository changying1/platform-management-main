# backend/tools/test_hik_bind_get_sim_unbind.py
# -*- coding: utf-8 -*-
"""
验证流程：
1. 调用海康互联添加设备接口
2. 查询海康互联流量卡列表，尝试通过设备序列号匹配 ICCID
3. 如果配置了解绑接口，则尝试解绑设备

注意：
- 不写数据库
- 不绑定萤石云
- 只验证能不能自动拿到 serial_number + iccid

已根据当前抓包适配：
- 添加设备：POST https://api.hikiot.com/api-device/fwd/device/v1/add
- 流量卡列表：GET https://api.hikiot.com/api-saas/v1/flow/card/user/page?page=1&size=50&groupId=0
- 设备管理 Appno 默认：__UNI__779ACE6
- 流量卡管理 Appno 默认：__UNI__3109F91
"""

import os
import sys
import json
import time
import traceback
from typing import Any, Dict, List, Optional

import requests


DEFAULT_BASE_URL = "https://api.hikiot.com"
ADD_DEVICE_PATH = "/api-device/fwd/device/v1/add"
FLOW_CARD_PAGE_PATH = "/api-saas/v1/flow/card/user/page"


def pretty(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)


def get_env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def normalize_base_url() -> str:
    return get_env("HIKIOT_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def build_headers(appno_override: Optional[str] = None) -> Dict[str, str]:
    """
    根据抓包请求头构造请求头。
    注意：设备管理模块和流量卡模块 Appno 不一样。
    """
    token = get_env("HIKIOT_BEARER_TOKEN")
    appno = appno_override or get_env("HIKIOT_APPNO", "__UNI__779ACE6")
    terminal = get_env("HIKIOT_TERMINAL", "2")
    autherm = get_env("HIKIOT_AUTHERM", "DEVICELISTFUN")
    deviceid = get_env("HIKIOT_DEVICEID", "uleGPllOK1u6rUI")

    headers = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
        "Content-Type": "application/json",
        "Origin": "https://www.hikiot.com",
        "Referer": "https://www.hikiot.com/",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0"
        ),
        "Appno": appno,
        "Terminal": terminal,
        "Autherm": autherm,
        "Deviceid": deviceid,
    }

    if token:
        if token.lower().startswith("bearer "):
            headers["Authorization"] = token
        else:
            headers["Authorization"] = f"Bearer {token}"

    return headers


def request_post_json(url: str, payload: Dict[str, Any], appno_override: Optional[str] = None) -> Dict[str, Any]:
    try:
        resp = requests.post(
            url,
            headers=build_headers(appno_override=appno_override),
            json=payload,
            timeout=25,
        )

        try:
            data = resp.json()
        except Exception:
            data = {"raw_text": resp.text[:3000]}

        return {
            "ok": True,
            "http_status": resp.status_code,
            "url": url,
            "payload": payload,
            "response": data,
        }

    except Exception as e:
        return {
            "ok": False,
            "url": url,
            "payload": payload,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }


def request_get_json(url: str, params: Dict[str, Any], appno_override: Optional[str] = None) -> Dict[str, Any]:
    try:
        resp = requests.get(
            url,
            headers=build_headers(appno_override=appno_override),
            params=params,
            timeout=25,
        )

        try:
            data = resp.json()
        except Exception:
            data = {"raw_text": resp.text[:3000]}

        return {
            "ok": True,
            "http_status": resp.status_code,
            "url": resp.url,
            "params": params,
            "response": data,
        }

    except Exception as e:
        return {
            "ok": False,
            "url": url,
            "params": params,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }


def add_device_to_hik(serial_number: str, validate_code: str, device_name: Optional[str] = None) -> Dict[str, Any]:
    """
    添加设备到海康互联。

    抓包确认 payload：
    {
      "deviceName": "test-TEST_DEVICE_SERIAL",
      "deviceSerial": "TEST_DEVICE_SERIAL",
      "deviceZoneId": 0,
      "ext": {"deviceAddSource": "link_web"},
      "validateCode": "TEST_VALIDATE_CODE"
    }
    """
    base_url = normalize_base_url()
    url = base_url + ADD_DEVICE_PATH

    if not device_name:
        device_name = f"test-{serial_number}"

    payload = {
        "deviceName": device_name,
        "deviceSerial": serial_number,
        "deviceZoneId": 0,
        "ext": {
            "deviceAddSource": "link_web"
        },
        "validateCode": validate_code,
    }

    result = request_post_json(url, payload)

    response = result.get("response") or {}
    data = response.get("data") if isinstance(response, dict) else None
    if not isinstance(data, dict):
        data = {}

    outer_code = response.get("code") if isinstance(response, dict) else None
    outer_msg = response.get("msg") if isinstance(response, dict) else None
    sub_code = data.get("subCode")
    remark = data.get("remark")

    # 当前已验证：subCode=0 且 remark=null 为添加成功。
    business_success = (
        result.get("http_status") == 200
        and outer_code == 0
        and str(sub_code) == "0"
    )

    result["parsed"] = {
        "outer_code": outer_code,
        "outer_msg": outer_msg,
        "sub_code": sub_code,
        "remark": remark,
        "device_serial": data.get("deviceSerial"),
        "device_name": data.get("deviceName"),
        "device_model": data.get("deviceModel"),
        "final_model": data.get("finalModel"),
        "validate_code": data.get("validateCode"),
        "raw_data": data,
    }

    result["business_success"] = business_success

    if business_success:
        result["message"] = "添加海康设备成功。"
    elif str(sub_code) == "3" or "不在线" in str(remark):
        result["message"] = "添加接口已识别设备，但设备当前不在线，没有真正完成绑定。"
    elif str(sub_code) == "6" or "验证码" in str(remark):
        result["message"] = "添加失败：验证码错误。"
    else:
        result["message"] = "添加设备未成功，请查看 response 和 parsed。"

    return result


def collect_dicts_from_any(obj: Any) -> List[Dict[str, Any]]:
    """
    从复杂 JSON 里递归收集所有 dict，方便在未知结构里查找 iccid / remark / serial。
    """
    found: List[Dict[str, Any]] = []

    def walk(x: Any):
        if isinstance(x, dict):
            found.append(x)
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for item in x:
                walk(item)

    walk(obj)
    return found


def pick_iccid_from_card(card: Dict[str, Any]) -> Optional[str]:
    """
    从一条卡信息里提取 iccid。
    """
    keys = [
        "iccid",
        "ICCID",
        "iccId",
        "cardNo",
        "cardNumber",
        "cardId",
        "simCardId",
        "sim_card_id",
        "msisdn",
    ]

    for key in keys:
        value = card.get(key)
        if value:
            text = str(value).strip()
            if text:
                return text

    return None


def query_flow_card_by_serial(serial_number: str) -> Dict[str, Any]:
    """
    查询海康互联流量卡列表，并通过卡号备注 remark 匹配摄像头序列号。

    抓包确认：
    GET /api-saas/v1/flow/card/user/page?page=1&size=50&groupId=0

    流量卡模块 Appno：__UNI__3109F91
    """
    base_url = normalize_base_url()
    url = base_url + FLOW_CARD_PAGE_PATH

    params = {
        "page": 1,
        "size": 50,
        "groupId": 0,
    }

    flow_appno = get_env("HIKIOT_FLOW_APPNO", "__UNI__3109F91")

    result = request_get_json(
        url=url,
        params=params,
        appno_override=flow_appno,
    )

    response = result.get("response")
    all_dicts = collect_dicts_from_any(response)

    matched_card = None
    iccid = None

    # 优先用 remark 精确匹配。网页上“卡号备注”就是设备序列号。
    for item in all_dicts:
        if not isinstance(item, dict):
            continue

        remark = str(item.get("remark") or "")
        item_iccid = pick_iccid_from_card(item)

        if serial_number == remark or serial_number in remark:
            matched_card = item
            iccid = item_iccid
            break

    # 兜底：整条 JSON 里找设备序列号。
    if not matched_card:
        for item in all_dicts:
            if not isinstance(item, dict):
                continue

            text = json.dumps(item, ensure_ascii=False)
            if serial_number in text:
                matched_card = item
                iccid = pick_iccid_from_card(item)
                break

    # 再兜底：如果当前返回只有一条带 ICCID 的卡，先取出来方便排查。
    if not iccid:
        cards_with_iccid = []
        for item in all_dicts:
            if not isinstance(item, dict):
                continue
            candidate_iccid = pick_iccid_from_card(item)
            if candidate_iccid:
                cards_with_iccid.append((item, candidate_iccid))

        if len(cards_with_iccid) == 1:
            matched_card, iccid = cards_with_iccid[0]

    result["parsed"] = {
        "matched": bool(matched_card),
        "iccid": iccid,
        "matched_card": matched_card,
        "dict_count_scanned": len(all_dicts),
    }

    result["business_success"] = bool(iccid)

    if iccid:
        result["message"] = f"已从流量卡列表中匹配到 ICCID：{iccid}"
    else:
        result["message"] = (
            "未从流量卡列表中匹配到 ICCID。"
            "如果网页能看到卡号，请把 page 接口的响应 Response 发我，我再适配返回结构。"
        )

    return result


def unbind_device_from_hik(serial_number: str) -> Dict[str, Any]:
    """
    尝试解绑海康设备。

    目前未抓到解绑接口，所以通过环境变量控制。
    设置示例：
    $env:HIKIOT_UNBIND_DEVICE_PATH="/真实解绑路径"
    """
    unbind_path = get_env("HIKIOT_UNBIND_DEVICE_PATH")
    if not unbind_path:
        return {
            "called": False,
            "business_success": False,
            "message": "未配置 HIKIOT_UNBIND_DEVICE_PATH，本次不执行解绑。",
        }

    base_url = normalize_base_url()
    url = base_url + unbind_path

    # 真实 payload 需要等解绑接口抓包后再确认。
    payload = {
        "deviceSerial": serial_number,
        "deviceSerials": [serial_number],
        "serialNumber": serial_number,
        "sn": serial_number,
    }

    result = request_post_json(url, payload)

    response = result.get("response") or {}
    outer_code = response.get("code") if isinstance(response, dict) else None
    outer_msg = response.get("msg") if isinstance(response, dict) else None

    success = result.get("http_status") == 200 and str(outer_code) in ["0", "200"]

    result["parsed"] = {
        "outer_code": outer_code,
        "outer_msg": outer_msg,
    }
    result["business_success"] = success

    if success:
        result["message"] = "解绑接口返回成功。"
    else:
        result["message"] = "解绑接口未确认成功，请根据真实返回调整判断。"

    return result


def save_and_print_final(final_result: Dict[str, Any]) -> None:
    output_path = "hik_bind_get_sim_unbind_result.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(final_result, f, ensure_ascii=False, indent=2)

    print()
    print("=" * 80)
    print("最终结果")
    print("=" * 80)
    print(pretty(final_result["final"]))
    print()
    print(f"完整日志已保存到：{output_path}")


def main():
    if len(sys.argv) < 3:
        print("用法：")
        print("python test_hik_bind_get_sim_unbind.py <SN> <验证码> [设备名称]")
        print()
        print("示例：")
        print("python test_hik_bind_get_sim_unbind.py TEST_DEVICE_SERIAL TEST_VALIDATE_CODE test-TEST_DEVICE_SERIAL")
        print()
        print("需要先设置环境变量：")
        print('$env:HIKIOT_BASE_URL="https://api.hikiot.com"')
        print('$env:HIKIOT_BEARER_TOKEN="你的 token"')
        print('$env:HIKIOT_APPNO="__UNI__779ACE6"')
        print('$env:HIKIOT_FLOW_APPNO="__UNI__3109F91"')
        print('$env:HIKIOT_TERMINAL="2"')
        return

    serial_number = sys.argv[1].strip()
    validate_code = sys.argv[2].strip()
    device_name = sys.argv[3].strip() if len(sys.argv) >= 4 else f"test-{serial_number}"

    final_result: Dict[str, Any] = {
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "input": {
            "serial_number": serial_number,
            "validate_code": validate_code,
            "device_name": device_name,
        },
        "steps": {
            "add_device": None,
            "query_flow_card": None,
            "unbind_device": None,
        },
        "final": {
            "success": False,
            "serial_number": serial_number,
            "iccid": None,
            "can_continue_to_ezviz": False,
            "message": "",
        },
    }

    print("=" * 80)
    print("步骤 1：添加设备到海康互联")
    print("=" * 80)

    add_result = add_device_to_hik(
        serial_number=serial_number,
        validate_code=validate_code,
        device_name=device_name,
    )
    final_result["steps"]["add_device"] = add_result
    print(pretty(add_result))

    # 添加失败就直接停止。先绑定成功，再查 SIM。
    if not add_result.get("business_success"):
        final_result["final"]["success"] = False
        final_result["final"]["iccid"] = None
        final_result["final"]["can_continue_to_ezviz"] = False
        final_result["final"]["message"] = (
            "海康添加设备未成功，本次不继续查询 SIM。原因："
            + str(add_result.get("parsed", {}).get("remark"))
        )
        save_and_print_final(final_result)
        return

    print()
    print("=" * 80)
    print("步骤 2：等待 5 秒后查询流量卡列表")
    print("=" * 80)
    time.sleep(5)

    card_result = query_flow_card_by_serial(serial_number)
    final_result["steps"]["query_flow_card"] = card_result
    print(pretty(card_result))

    iccid = card_result.get("parsed", {}).get("iccid")
    if iccid:
        final_result["final"]["success"] = True
        final_result["final"]["iccid"] = iccid
        final_result["final"]["message"] = "已自动获取到 SIM 卡 ICCID。"
    else:
        final_result["final"]["success"] = False
        final_result["final"]["message"] = "没有自动获取到 SIM 卡 ICCID。"

    print()
    print("=" * 80)
    print("步骤 3：尝试解绑海康设备")
    print("=" * 80)

    unbind_result = unbind_device_from_hik(serial_number)
    final_result["steps"]["unbind_device"] = unbind_result
    print(pretty(unbind_result))

    final_result["final"]["can_continue_to_ezviz"] = bool(
        final_result["final"]["iccid"]
        and (
            unbind_result.get("business_success")
            or not unbind_result.get("called")
        )
    )

    save_and_print_final(final_result)


if __name__ == "__main__":
    main()
