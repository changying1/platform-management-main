# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.device_registration.hikiot_registration_service import (  # noqa: E402
    HikiotRegistrationService,
    build_import_excel,
    mask_iccid,
    normalize_iccid,
)


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python backend/tools/test_hikiot_import_and_remark.py <ICCID> <摄像头序列号>")
        return 2

    iccid = normalize_iccid(sys.argv[1])
    device_serial = sys.argv[2].strip()
    if not iccid or not device_serial:
        print("ICCID 和摄像头序列号不能为空")
        return 2

    service = HikiotRegistrationService()
    excel_bytes = build_import_excel(iccid, device_serial)

    print(f"准备导入 ICCID={mask_iccid(iccid)} remark={device_serial}")
    import_result = service.import_card(iccid, device_serial, excel_bytes)
    print("导入结果:")
    print(json.dumps(import_result, ensure_ascii=False, indent=2))

    if not import_result.get("success") and not import_result.get("already_exists"):
        print("导入未成功且不是已存在，不继续修改备注。")
        return 1

    remark_result = service.update_remark(iccid, device_serial)
    print("修改备注结果:")
    print(json.dumps(remark_result, ensure_ascii=False, indent=2))
    if not remark_result.get("success"):
        return 1

    card = service.find_card(iccid)
    print("查询验证结果:")
    if not card:
        print(f"未查询到 ICCID={mask_iccid(iccid)}")
        return 1

    card_remark = service._extract_card_remark(card)
    ok = card_remark == device_serial
    print(json.dumps({"iccid": mask_iccid(iccid), "remark": card_remark, "verified": ok}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
