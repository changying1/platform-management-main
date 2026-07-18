import qrcode


def create_qr(content, filename):
    """
    生成二维码
    """
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4
    )

    qr.add_data(content)
    qr.make(fit=True)

    img = qr.make_image()

    img.save(filename)

    print("生成完成:")
    print(filename)
    print("内容:")
    print(repr(content))
    print("-" * 50)


# =====================================
# 1. 双二维码设备 - 设备序列号二维码
# =====================================

device_serial = "GM7974925"

create_qr(
    device_serial,
    "01_device_serial_GM7974925.png"
)


# =====================================
# 2. 双二维码设备 - SIM卡二维码
# =====================================

sim_content = (
    "http://weixin.qq.com/r/NhOXj97EnIPjrZrs90Yk"
    "?ICCID=89861125217089127921"
)

create_qr(
    sim_content,
    "02_sim_iccid_89861125217089127921.png"
)


# =====================================
# 3. 单二维码设备
# 海康真实二维码格式
# =====================================

single_camera_content = (
    "http://support.hikvision.com:8085?SN=\r"
    "GW4602592\r"
    "BLZXKI\r"
    "iDS-MCD2AM\r"
)


create_qr(
    single_camera_content,
    "03_single_camera_GW4602592.png"
)


print("全部二维码生成完成")