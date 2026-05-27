"""
视频功能测试脚本
用于测试video功能的后端API和数据库连接
"""

import requests
import json

# 配置API基础URL
BASE_URL = "http://127.0.0.1:8000"
VIDEO_API = f"{BASE_URL}/video"


class VideoAPITester:
    def __init__(self):
        self.test_video_id = None
        
    def test_connection(self):
        """测试后端服务器连接"""
        print("\n" + "="*60)
        print("测试 1: 检查后端服务器连接")
        print("="*60)
        try:
            response = requests.get(BASE_URL)
            if response.status_code == 200:
                print("✓ 后端服务器连接成功")
                print(f"  响应: {response.json()}")
                return True
            else:
                print(f"✗ 后端服务器响应异常: {response.status_code}")
                return False
        except Exception as e:
            print(f"✗ 无法连接后端服务器: {str(e)}")
            print("  请确保后端服务已启动: python backend/main.py")
            return False

    def test_get_all_videos(self):
        """测试获取所有视频设备"""
        print("\n" + "="*60)
        print("测试 2: 获取所有视频设备列表")
        print("="*60)
        try:
            response = requests.get(VIDEO_API)
            if response.status_code == 200:
                videos = response.json()
                print(f"✓ 成功获取视频设备列表")
                print(f"  数据库中共有 {len(videos)} 个视频设备")
                if videos:
                    print(f"  第一个设备信息: {json.dumps(videos[0], indent=2, ensure_ascii=False)}")
                else:
                    print("  提示: 数据库中暂无视频设备,稍后将创建测试数据")
                return videos
            else:
                print(f"✗ 获取失败: {response.status_code}")
                print(f"  错误信息: {response.text}")
                return None
        except Exception as e:
            print(f"✗ 请求异常: {str(e)}")
            return None

    def test_create_video(self):
        """测试创建视频设备"""
        print("\n" + "="*60)
        print("测试 3: 创建新的视频设备")
        print("="*60)
        
        test_data = {
            "name": "测试摄像头-大门口",
            "ip_address": "192.168.1.100",
            "port": 554,
            "username": "admin",
            "password": "admin123",
            "stream_url": "rtsp://192.168.1.100:554/Streaming/Channels/101",
            "latitude": 39.9042,
            "longitude": 116.4074,
            "status": "online",
            "remark": "API测试创建的设备"
        }
        
        print(f"  创建数据: {json.dumps(test_data, indent=2, ensure_ascii=False)}")
        
        try:
            response = requests.post(VIDEO_API, json=test_data)
            if response.status_code == 200:
                video = response.json()
                self.test_video_id = video.get('id')
                print(f"✓ 视频设备创建成功")
                print(f"  设备ID: {self.test_video_id}")
                print(f"  完整信息: {json.dumps(video, indent=2, ensure_ascii=False)}")
                return video
            else:
                print(f"✗ 创建失败: {response.status_code}")
                print(f"  错误信息: {response.text}")
                return None
        except Exception as e:
            print(f"✗ 请求异常: {str(e)}")
            return None

    def test_update_video(self, video_id):
        """测试更新视频设备"""
        print("\n" + "="*60)
        print(f"测试 4: 更新视频设备 (ID: {video_id})")
        print("="*60)
        
        update_data = {
            "name": "测试摄像头-大门口(已更新)",
            "status": "offline",
            "remark": "更新后的备注信息"
        }
        
        print(f"  更新数据: {json.dumps(update_data, indent=2, ensure_ascii=False)}")
        
        try:
            response = requests.put(f"{VIDEO_API}/{video_id}", json=update_data)
            if response.status_code == 200:
                video = response.json()
                print(f"✓ 视频设备更新成功")
                print(f"  更新后信息: {json.dumps(video, indent=2, ensure_ascii=False)}")
                return video
            else:
                print(f"✗ 更新失败: {response.status_code}")
                print(f"  错误信息: {response.text}")
                return None
        except Exception as e:
            print(f"✗ 请求异常: {str(e)}")
            return None

    def test_get_stream_url(self, video_id):
        """测试获取视频流地址"""
        print("\n" + "="*60)
        print(f"测试 5: 获取视频流地址 (ID: {video_id})")
        print("="*60)
        
        try:
            response = requests.get(f"{VIDEO_API}/stream/{video_id}")
            if response.status_code == 200:
                stream_info = response.json()
                print(f"✓ 成功获取视频流地址")
                print(f"  流地址: {stream_info.get('url')}")
                return stream_info
            else:
                print(f"✗ 获取失败: {response.status_code}")
                print(f"  错误信息: {response.text}")
                return None
        except Exception as e:
            print(f"✗ 请求异常: {str(e)}")
            return None

    def test_delete_video(self, video_id):
        """测试删除视频设备"""
        print("\n" + "="*60)
        print(f"测试 6: 删除视频设备 (ID: {video_id})")
        print("="*60)
        
        try:
            response = requests.delete(f"{VIDEO_API}/{video_id}")
            if response.status_code == 200:
                result = response.json()
                print(f"✓ 视频设备删除成功")
                print(f"  响应: {result}")
                return True
            else:
                print(f"✗ 删除失败: {response.status_code}")
                print(f"  错误信息: {response.text}")
                return False
        except Exception as e:
            print(f"✗ 请求异常: {str(e)}")
            return False

    def run_all_tests(self):
        """运行所有测试"""
        print("\n" + "="*60)
        print("开始视频功能完整测试")
        print("="*60)
        
        # 测试1: 连接检查
        if not self.test_connection():
            print("\n后端服务未启动,测试终止")
            return
        
        # 测试2: 获取现有设备
        existing_videos = self.test_get_all_videos()
        
        # 测试3: 创建新设备
        created_video = self.test_create_video()
        if not created_video:
            print("\n创建设备失败,跳过后续测试")
            return
        
        video_id = created_video.get('id')
        
        # 测试4: 更新设备
        self.test_update_video(video_id)
        
        # 测试5: 获取流地址
        self.test_get_stream_url(video_id)
        
        # 测试6: 删除设备 (可选,如需保留测试数据可注释掉)
        # self.test_delete_video(video_id)
        
        print("\n" + "="*60)
        print("测试完成!")
        print("="*60)
        print(f"\n创建的测试设备ID: {video_id}")
        print("如需删除测试数据,取消注释最后的delete测试")


def main():
    """主测试函数"""
    print("""
╔════════════════════════════════════════════════════════╗
║          视频设备功能API测试工具                      ║
║                                                        ║
║  测试内容:                                             ║
║    1. 后端服务连接测试                                 ║
║    2. 获取视频设备列表                                 ║
║    3. 创建新视频设备                                   ║
║    4. 更新视频设备信息                                 ║
║    5. 获取视频流地址                                   ║
║    6. 删除视频设备                                     ║
║                                                        ║
║  使用前提:                                             ║
║    - 后端服务已启动 (python backend/main.py)          ║
║    - MySQL数据库已启动并配置正确                      ║
╚════════════════════════════════════════════════════════╝
    """)
    
    tester = VideoAPITester()
    tester.run_all_tests()


if __name__ == "__main__":
    main()
