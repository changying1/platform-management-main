import qrcode

# 二维码里要保存的序列码文本
serial_code = "DS-2CD3T47G2-L-20260611001"

# 生成二维码
img = qrcode.make(serial_code)

# 保存图片
img.save("camera_serial_qr.png")

print("二维码已生成：camera_serial_qr.png")
print("二维码内容：", serial_code)